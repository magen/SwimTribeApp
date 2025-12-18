import { GOOGLE_FIT_SCOPES } from './config';
import { loadAnchors, saveAnchors, type Anchors } from './anchors';

export type GoogleFitWorkout = {
  id?: string;
  startDate: string;
  endDate: string;
  activityType?: string | number;
  totalDistance?: number;
  totalDistanceUnit?: 'm';
  totalEnergyBurned?: number | null;
  totalEnergyBurnedUnit?: 'kcal';
  totalSwimmingStrokeCount?: number;
  totalSwimmingStrokeCountUnit?: 'count';
};

export type GoogleFitHeartRateSample = {
  value: number;
  startDate: string;
  endDate: string;
  unit?: 'count/min';
};

export type IngestionResult = {
  workouts?: GoogleFitWorkout[];
  heartRates?: GoogleFitHeartRateSample[];
  nextAnchors: Anchors;
};

const SDK_UNAVAILABLE_MESSAGE =
  'Google Fit SDK not available; install @react-native-google-fit/google-fit and rebuild.';

let cachedSdk: any;
let triedImport = false;

function getSdk() {
  if (cachedSdk || triedImport) {
    return cachedSdk;
  }
  triedImport = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-google-fit');
    cachedSdk = mod?.default ?? mod;
  } catch (err) {
    console.warn('[GoogleFit] SDK not linked yet; skipping import', err);
  }
  return cachedSdk;
}

const DEFAULT_LOOKBACK_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function resolveScopes(sdk: any) {
  if (sdk?.Scopes) {
    return [
      sdk.Scopes.FITNESS_ACTIVITY_READ,
      sdk.Scopes.FITNESS_ACTIVITY_WRITE,
      sdk.Scopes.FITNESS_HEART_RATE_READ,
      sdk.Scopes.FITNESS_LOCATION_READ,
    ].filter(Boolean);
  }
  return GOOGLE_FIT_SCOPES as readonly string[];
}

function coerceDate(date?: string | number | Date) {
  if (!date) return undefined;
  try {
    const d = new Date(date);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  } catch {
    return undefined;
  }
}

function mapWorkout(raw: any): GoogleFitWorkout | null {
  const startDate = coerceDate(raw?.startDate ?? raw?.start);
  const endDate = coerceDate(raw?.endDate ?? raw?.end);
  if (!startDate || !endDate) {
    return null;
  }
  const distance =
    typeof raw?.distance === 'number'
      ? raw.distance
      : typeof raw?.distanceMeters === 'number'
        ? raw.distanceMeters
        : typeof raw?.totalDistance === 'number'
          ? raw.totalDistance
          : undefined;
  const energy =
    typeof raw?.calories === 'number'
      ? raw.calories
      : typeof raw?.totalEnergyBurned === 'number'
        ? raw.totalEnergyBurned
        : null;
  const strokes =
    typeof raw?.swimmingStrokeCount === 'number'
      ? raw.swimmingStrokeCount
      : typeof raw?.strokeCount === 'number'
        ? raw.strokeCount
        : undefined;
  return {
    id: raw?.id ?? raw?.sessionId ?? raw?.sourceId,
    startDate,
    endDate,
    activityType: raw?.activityType ?? raw?.activityName ?? raw?.activity,
    totalDistance: distance,
    totalDistanceUnit: distance != null ? 'm' : undefined,
    totalEnergyBurned: energy ?? null,
    totalEnergyBurnedUnit: energy != null ? 'kcal' : undefined,
    totalSwimmingStrokeCount: strokes,
    totalSwimmingStrokeCountUnit: strokes != null ? 'count' : undefined,
  };
}

function mapHeartRate(raw: any): GoogleFitHeartRateSample | null {
  const startDate = coerceDate(raw?.startDate ?? raw?.start);
  const endDate = coerceDate(raw?.endDate ?? raw?.end);
  if (!startDate || !endDate || typeof raw?.value !== 'number') {
    return null;
  }
  return {
    value: raw.value,
    startDate,
    endDate,
    unit: 'count/min',
  };
}

function latestEndDate(items: { endDate: string }[]) {
  let latest: string | undefined;
  items.forEach(item => {
    if (!latest || new Date(item.endDate).getTime() > new Date(latest).getTime()) {
      latest = item.endDate;
    }
  });
  return latest;
}

export async function initGoogleFit() {
  return requestWorkoutPermissions();
}

export async function requestWorkoutPermissions() {
  const sdk = getSdk();
  if (!sdk) {
    throw new Error(SDK_UNAVAILABLE_MESSAGE);
  }
  const scopes = resolveScopes(sdk);
  if (typeof sdk.authorize === 'function') {
    console.log('[GoogleFit] Requesting permissions', { scopes });
    const result = await sdk.authorize({
      scopes: scopes as readonly string[],
    });
    return result;
  }

  console.log('[GoogleFit] authorize unavailable on SDK', { scopes });
  return { authorized: false, success: false };
}

export async function getAnchors(): Promise<Anchors> {
  return loadAnchors();
}

export async function runAnchoredFetches(): Promise<IngestionResult> {
  const anchors = await loadAnchors();
  const nextAnchors: Anchors = { ...anchors };
  const workouts: GoogleFitWorkout[] = [];
  const heartRates: GoogleFitHeartRateSample[] = [];

  const sdk = getSdk();
  if (!sdk) {
    throw new Error(SDK_UNAVAILABLE_MESSAGE);
  }

  const now = new Date();
  const startDateSessions =
    anchors.sessions || new Date(now.getTime() - DEFAULT_LOOKBACK_MS).toISOString();
  const startDateHr =
    anchors.heartRate || new Date(now.getTime() - DEFAULT_LOOKBACK_MS).toISOString();
  const endDate = now.toISOString();

  try {
    if (typeof sdk.getWorkoutSamples === 'function') {
      const workoutResp = await sdk.getWorkoutSamples({
        startDate: startDateSessions,
        endDate,
      });
      const mapped = (workoutResp ?? [])
        .map(mapWorkout)
        .filter(Boolean) as GoogleFitWorkout[];
      workouts.push(...mapped);
      const latest = latestEndDate(mapped);
      if (latest) {
        nextAnchors.sessions = latest;
      }
    } else {
      console.log('[GoogleFit] getWorkoutSamples unavailable on SDK');
    }
  } catch (err) {
    console.warn('[GoogleFit] workout fetch failed', err);
  }

  try {
    if (typeof sdk.getHeartRateSamples === 'function') {
      const hrResp = await sdk.getHeartRateSamples({
        startDate: startDateHr,
        endDate,
        ascending: true,
      });
      const mapped = (hrResp ?? []).map(mapHeartRate).filter(Boolean) as GoogleFitHeartRateSample[];
      heartRates.push(...mapped);
      const latest = latestEndDate(mapped);
      if (latest) {
        nextAnchors.heartRate = latest;
      }
    } else {
      console.log('[GoogleFit] getHeartRateSamples unavailable on SDK');
    }
  } catch (err) {
    console.warn('[GoogleFit] heart rate fetch failed', err);
  }

  await saveAnchors(nextAnchors);
  return { workouts, heartRates, nextAnchors };
}

export async function enableBackgroundObservers() {
  console.log('[GoogleFit] Background observers skipped; using on-demand sync at launch.');
}

import * as healthkit from '@kingstinct/react-native-healthkit';
import type { QuantitySample } from '@kingstinct/react-native-healthkit/types/QuantitySample';
import type { Workout } from '@kingstinct/react-native-healthkit/types/Workouts';
import { UpdateFrequency } from '@kingstinct/react-native-healthkit/types';
import { READ_TYPES, SHARE_TYPES } from './config';
import { loadAnchors, saveAnchors, type Anchors } from './anchors';

export type IngestionConfig = {
  enableBackground?: boolean;
};

export type IngestionResult = {
  workouts?: Workout[];
  heartRates?: QuantitySample[];
  nextAnchors: Anchors;
};

const WORKOUT_IDENTIFIER = 'HKWorkoutTypeIdentifier';
const HR_IDENTIFIER = 'HKQuantityTypeIdentifierHeartRate';

export async function initHealthKit() {
  await healthkit.requestAuthorization({
    toRead: READ_TYPES,
    toShare: SHARE_TYPES,
  });
}

export async function getAnchors() {
  return loadAnchors();
}

export async function runAnchoredFetches(): Promise<IngestionResult> {
  const anchors = await loadAnchors();
  const nextAnchors: Anchors = { ...anchors };
  const workouts: Workout[] = [];
  const heartRates: QuantitySample[] = [];

  try {
    console.log('[HealthKit] queryWorkoutSamplesWithAnchor start', {
      anchor: anchors.workouts,
    });
    const workoutResp = await healthkit.queryWorkoutSamplesWithAnchor({
      anchor: anchors.workouts,
      limit: -1,
    });
    console.log('[HealthKit] workout response', {
      count: (workoutResp as any)?.workouts?.length,
      anchor: (workoutResp as any)?.newAnchor,
    });
    // The response returns WorkoutProxy[] in `workouts` and anchor in `newAnchor`
    // We keep the proxy objects for now; can map to plain objects later if needed.
    workouts.push(...(((workoutResp as any)?.workouts as Workout[]) ?? []));
    nextAnchors.workouts = (workoutResp as any)?.newAnchor;
  } catch (err) {
    console.warn('[HealthKit] workout anchor query failed', err);
  }

  try {
    console.log('[HealthKit] queryQuantitySamplesWithAnchor HR start', {
      anchor: anchors.heartRate,
    });
    const hrResp = await healthkit.queryQuantitySamplesWithAnchor(
      HR_IDENTIFIER,
      {
        anchor: anchors.heartRate,
        limit: -1,
        unit: 'count/min',
      },
    );
    console.log('[HealthKit] HR response', {
      count: hrResp.samples?.length,
      anchor: (hrResp as any)?.newAnchor,
    });
    heartRates.push(...(hrResp.samples ?? []));
    nextAnchors.heartRate = (hrResp as any)?.newAnchor;
  } catch (err) {
    console.warn('[HealthKit] heart rate anchor query failed', err);
  }

  await saveAnchors(nextAnchors);
  return { workouts, heartRates, nextAnchors };
}

/**
 * Enable background delivery + observer callbacks for workouts and heart rate.
 * In practice this schedules HKObserver queries; HealthKit will wake the app and deliver changes.
 */
export async function enableBackgroundObservers() {
  // enable delivery for workouts
  await healthkit.enableBackgroundDelivery(WORKOUT_IDENTIFIER, UpdateFrequency.immediate);

  const subscribeObserver = (healthkit as any).subscribeToObserverQuery as
    | ((identifier: string, cb: (args: any) => void) => Promise<void>)
    | undefined;

  // enable delivery for heart rate
  await healthkit.enableBackgroundDelivery(HR_IDENTIFIER, UpdateFrequency.immediate);

  const attachObserver = (
    identifier: string,
    label: string,
  ) => {
    if (subscribeObserver) {
      return subscribeObserver(identifier, ({ errorMessage }: any) => {
        if (errorMessage) {
          console.warn(`[HealthKit] ${label} observer error`, errorMessage);
        } else {
          console.log(`[HealthKit] ${label} observer fired`);
        }
      });
    }
    if (typeof healthkit.subscribeToChanges === 'function') {
      healthkit.subscribeToChanges(identifier, ({ errorMessage }: any) => {
        if (errorMessage) {
          console.warn(`[HealthKit] ${label} observer error`, errorMessage);
        } else {
          console.log(`[HealthKit] ${label} observer fired`);
        }
      });
      return;
    }
    console.warn(`[HealthKit] subscribeToObserverQuery not available; skipping ${label} observer`);
  };

  await attachObserver(WORKOUT_IDENTIFIER, 'Workout');
  await attachObserver(HR_IDENTIFIER, 'HR');
}

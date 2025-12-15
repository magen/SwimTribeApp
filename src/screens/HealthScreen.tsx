import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { QuantitySample } from '@kingstinct/react-native-healthkit/types/QuantitySample';
import type { Workout } from '@kingstinct/react-native-healthkit/types/Workouts';
import { runAnchoredFetches, getAnchors } from '../healthkit/service';
import { clearAnchors } from '../healthkit/anchors';

type Props = {
  onExit: () => void;
};

type SwimDetails = {
  distanceMeters?: number;
  strokeCount?: number;
  energyKcal?: number;
  durationSeconds?: number;
  poolLengthMeters?: number;
  locationType?: string;
  pacePer100mSeconds?: number;
  swolfApprox?: number;
  sourceName?: string;
  device?: string;
};

type WorkoutDisplay = {
  label: string;
  start: string;
  end: string;
  distanceMeters?: number;
  durationSeconds?: number;
  pacePerKmSeconds?: number;
  device?: string;
  energyKcal?: number;
  sourceName?: string;
};

export function HealthScreen({ onExit }: Props) {
  const [hrSamples, setHrSamples] = useState<QuantitySample[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutDisplay[]>([]);
  const [lastSwim, setLastSwim] = useState<Workout | null>(null);
  const [swimDetails, setSwimDetails] = useState<SwimDetails | null>(null);
  const [anchors, setAnchors] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Idle');
  const [loading, setLoading] = useState(false);

  const loadAnchors = useCallback(async () => {
    const a = await getAnchors();
    setAnchors(JSON.stringify(a, null, 2));
  }, []);

  const formatSeconds = (seconds?: number) => {
    if (!seconds && seconds !== 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const activityLabel = (activity?: number) => {
    if (activity === 46) return 'Swimming';
    return activity ?? 'Workout';
  };

  const mapWorkouts = (items?: Workout[]) => {
    return (items ?? []).slice(0, 5).map(w => {
      const durationSeconds = (w as any).duration?.quantity as number | undefined;
      // totalDistance/totalDistanceUnit are not typed on WorkoutSample; read from any
      const rawDistance = (w as any).totalDistance as number | undefined;
      const rawUnit = (w as any).totalDistanceUnit as string | undefined;
      const distanceMeters =
        rawDistance != null
          ? rawUnit === 'm'
            ? rawDistance
            : rawUnit === 'km'
              ? rawDistance * 1000
              : rawDistance
          : undefined;
      const rawEnergy = (w as any).totalEnergyBurned as number | undefined;
      const rawEnergyUnit = (w as any).totalEnergyBurnedUnit as string | undefined;
      const energyKcal =
        rawEnergy != null
          ? rawEnergyUnit === 'kcal'
            ? rawEnergy
            : rawEnergyUnit === 'cal'
              ? rawEnergy / 1000
              : rawEnergy
          : undefined;

      let pacePerKmSeconds: number | undefined;
      if (distanceMeters && durationSeconds && distanceMeters > 0) {
        pacePerKmSeconds = (durationSeconds / distanceMeters) * 1000;
      }

      return {
        label: activityLabel((w as any).workoutActivityType),
        start: new Date((w as any).startDate).toLocaleString(),
        end: new Date((w as any).endDate).toLocaleString(),
        distanceMeters,
        durationSeconds,
        pacePerKmSeconds,
        device: (w as any).device?.name,
        energyKcal,
        sourceName: (w as any).sourceRevision?.source?.name,
      };
    });
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setStatus('Fetching...');
    try {
      const result = await runAnchoredFetches();
      const sortedWorkouts = (result.workouts ?? []).sort((a, b) => {
        const aTime = new Date((a as any).endDate ?? (a as any).startDate ?? 0).getTime();
        const bTime = new Date((b as any).endDate ?? (b as any).startDate ?? 0).getTime();
        return bTime - aTime;
      });
      const sortedHR = (result.heartRates ?? []).sort((a, b) => {
        const aTime = new Date(a.endDate ?? a.startDate ?? 0).getTime();
        const bTime = new Date(b.endDate ?? b.startDate ?? 0).getTime();
        return bTime - aTime;
      });
      setHrSamples(sortedHR.slice(0, 25));
      setWorkouts(mapWorkouts(sortedWorkouts));
      const swim = sortedWorkouts.find(
        w => (w as any).workoutActivityType === 46, // swimming
      );
      setLastSwim(swim ?? null);
      if (swim && typeof (swim as any).getStatistic === 'function') {
        try {
          const distance = await (swim as any).getStatistic(
            'HKQuantityTypeIdentifierDistanceSwimming',
            'm',
          );
          const strokes = await (swim as any).getStatistic(
            'HKQuantityTypeIdentifierSwimmingStrokeCount',
            'count',
          );
          const energy = await (swim as any).getStatistic(
            'HKQuantityTypeIdentifierActiveEnergyBurned',
            'kcal',
          );
          const distanceMeters = distance?.sumQuantity?.quantity;
          const durationSeconds = (swim as any).duration?.quantity as number | undefined;
          const strokesTotal = strokes?.sumQuantity?.quantity;
          const poolLength = (swim as any).metadata?.HKSwimmingPoolLength;
          const locationType = (swim as any).metadata?.HKWorkoutSwimmingLocationType;
          const device = (swim as any).device?.name;

          let pacePer100mSeconds: number | undefined;
          if (distanceMeters && durationSeconds && distanceMeters > 0) {
            pacePer100mSeconds = (durationSeconds / distanceMeters) * 100;
          }

          let swolfApprox: number | undefined;
          if (pacePer100mSeconds && strokesTotal && distanceMeters && distanceMeters > 0) {
            // Approximate average strokes per 100m then add pace seconds
            const strokesPer100m = (strokesTotal / distanceMeters) * 100;
            swolfApprox = pacePer100mSeconds + strokesPer100m;
          }

          setSwimDetails({
            distanceMeters,
            strokeCount: strokesTotal,
            energyKcal: energy?.sumQuantity?.quantity,
            durationSeconds,
            poolLengthMeters: poolLength,
            locationType: locationType === 0 ? 'pool' : locationType === 1 ? 'open water' : undefined,
            pacePer100mSeconds,
            swolfApprox,
            sourceName: (swim as any).sourceRevision?.source?.name,
            device,
          });
        } catch (err) {
          console.warn('[Health] failed to load swim stats', err);
          setSwimDetails(null);
        }
      } else {
        setSwimDetails(null);
      }
      setAnchors(JSON.stringify(result.nextAnchors, null, 2));
      setStatus(
        `Fetched HR:${result.heartRates?.length ?? 0} workouts:${
          result.workouts?.length ?? 0
        }`,
      );
    } catch (err: any) {
      setStatus(err?.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(async () => {
    await clearAnchors();
    setHrSamples([]);
    setWorkouts([]);
    setAnchors(null);
    setStatus('Anchors reset; next fetch will read all');
  }, []);

  useEffect(() => {
    loadAnchors();
  }, [loadAnchors]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Health Debug</Text>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <Pressable
            style={[styles.button, loading ? styles.buttonDisabled : null]}
            onPress={refresh}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Loading…' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={reset}>
            <Text style={styles.buttonText}>Reset anchors</Text>
          </Pressable>
        </View>
        <Text style={styles.caption}>{status}</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Anchors</Text>
          <Text style={styles.code}>{anchors ?? 'None'}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Heart Rate</Text>
          {hrSamples.length === 0 ? (
            <Text style={styles.caption}>No samples yet.</Text>
          ) : (
            hrSamples.map((s, idx) => (
              <View key={`${s.uuid ?? idx}`} style={styles.itemRow}>
                <Text style={styles.itemKey}>
                  {s.quantity} {s.unit ?? ''}
                </Text>
                <Text style={styles.itemValue}>
                  {new Date(s.startDate).toLocaleString()}
                </Text>
                {s.sourceRevision?.source?.name && (
                  <Text style={styles.caption}>
                    Source: {s.sourceRevision.source.name}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Workouts</Text>
          {workouts.length === 0 ? (
            <Text style={styles.caption}>No workouts yet.</Text>
          ) : (
            workouts.map((w, idx) => (
              <View key={`${idx}`} style={styles.itemRow}>
                <Text style={styles.itemKey}>{w.label}</Text>
                <Text style={styles.itemValue}>
                  {w.start} → {w.end}
                </Text>
                {w.distanceMeters != null && (
                  <Text style={styles.caption}>
                    Distance: {w.distanceMeters.toFixed(1)} m
                  </Text>
                )}
                {w.durationSeconds != null && (
                  <Text style={styles.caption}>
                    Duration: {formatSeconds(w.durationSeconds)} ({w.durationSeconds.toFixed(0)}s)
                  </Text>
                )}
                {w.pacePerKmSeconds && (
                  <Text style={styles.caption}>
                    Pace/km: {formatSeconds(w.pacePerKmSeconds)} ({w.pacePerKmSeconds.toFixed(1)}s)
                  </Text>
                )}
                {w.energyKcal != null && (
                  <Text style={styles.caption}>
                    Energy: {w.energyKcal.toFixed(0)} kcal
                  </Text>
                )}
                {w.device && <Text style={styles.caption}>Device: {w.device}</Text>}
                {w.sourceName && <Text style={styles.caption}>Source: {w.sourceName}</Text>}
              </View>
            ))
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Last Swim</Text>
          {!lastSwim ? (
            <Text style={styles.caption}>No swim workouts yet.</Text>
          ) : (
            <View style={styles.itemRow}>
              <Text style={styles.itemKey}>Swim workout</Text>
              <Text style={styles.itemValue}>
                {new Date((lastSwim as any).startDate).toLocaleString()} →{' '}
                {new Date((lastSwim as any).endDate).toLocaleString()}
              </Text>
              {swimDetails?.durationSeconds && (
                <Text style={styles.caption}>
                  Duration: {formatSeconds(swimDetails.durationSeconds)} ({swimDetails.durationSeconds.toFixed(0)}s)
                </Text>
              )}
              {swimDetails?.distanceMeters && (
                <Text style={styles.caption}>
                  Distance: {swimDetails.distanceMeters.toFixed(1)} m
                </Text>
              )}
              {swimDetails?.pacePer100mSeconds && (
                <Text style={styles.caption}>
                  Pace/100m: {formatSeconds(swimDetails.pacePer100mSeconds)} ({swimDetails.pacePer100mSeconds.toFixed(1)}s)
                </Text>
              )}
              {swimDetails?.strokeCount && (
                <Text style={styles.caption}>
                  Strokes: {swimDetails.strokeCount.toFixed(0)}
                </Text>
              )}
              {swimDetails?.swolfApprox && (
                <Text style={styles.caption}>
                  SWOLF (approx): {swimDetails.swolfApprox.toFixed(1)}
                </Text>
              )}
              {swimDetails?.energyKcal && (
                <Text style={styles.caption}>
                  Energy: {swimDetails.energyKcal.toFixed(0)} kcal
                </Text>
              )}
              {swimDetails?.poolLengthMeters && (
                <Text style={styles.caption}>
                  Pool length: {swimDetails.poolLengthMeters} m
                </Text>
              )}
              {swimDetails?.locationType && (
                <Text style={styles.caption}>
                  Location: {swimDetails.locationType}
                </Text>
              )}
              {swimDetails?.device && (
                <Text style={styles.caption}>Device: {swimDetails.device}</Text>
              )}
              {swimDetails?.sourceName && (
                <Text style={styles.caption}>
                  Source: {swimDetails.sourceName}
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F8FC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0B1F3F',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  close: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    backgroundColor: '#0B1F3F',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  caption: {
    fontSize: 12,
    color: '#54627A',
    lineHeight: 16,
  },
  card: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D9DFE7',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B1F3F',
  },
  code: {
    fontFamily: 'Menlo',
    fontSize: 12,
    color: '#1E2A3A',
  },
  itemRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E9F0',
  },
  itemKey: {
    fontSize: 14,
    color: '#1E2A3A',
    fontWeight: '700',
  },
  itemValue: {
    fontSize: 13,
    color: '#1E2A3A',
  },
});

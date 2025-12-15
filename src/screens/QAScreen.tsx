import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as healthkit from '@kingstinct/react-native-healthkit';
import {
  AuthorizationStatus,
  AuthorizationRequestStatus,
  type ObjectTypeIdentifier,
  type SampleTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit/types';

type StatusKind = AuthorizationStatus | 'error' | 'read-only';

const PERMISSION_TYPES: readonly {
  id: ObjectTypeIdentifier;
  label: string;
  writable: boolean;
}[] = [
  { id: 'HKWorkoutTypeIdentifier', label: 'Workouts', writable: true },
  { id: 'HKQuantityTypeIdentifierHeartRate', label: 'Heart rate', writable: false },
  { id: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', label: 'HRV', writable: false },
  { id: 'HKQuantityTypeIdentifierVO2Max', label: 'VO₂ Max', writable: false },
  { id: 'HKQuantityTypeIdentifierAppleExerciseTime', label: 'Exercise time', writable: false },
  { id: 'HKQuantityTypeIdentifierAppleStandTime', label: 'Stand time', writable: false },
  { id: 'HKQuantityTypeIdentifierActiveEnergyBurned', label: 'Active energy', writable: true },
  { id: 'HKQuantityTypeIdentifierDistanceSwimming', label: 'Swim distance', writable: true },
  { id: 'HKQuantityTypeIdentifierSwimmingStrokeCount', label: 'Stroke count', writable: true },
] as const;

const SHARE_TYPES: readonly SampleTypeIdentifierWriteable[] = PERMISSION_TYPES.filter(
  t => t.writable,
).map(t => t.id as SampleTypeIdentifierWriteable);
const READ_TYPES: readonly ObjectTypeIdentifier[] = PERMISSION_TYPES.map(t => t.id);

const statusLabel = (status: StatusKind) => {
  if (status === 'error') return 'Error';
  if (status === 'read-only') return 'Read-only (see Health app)';
  switch (status) {
    case AuthorizationStatus.notDetermined:
      return 'Not determined';
    case AuthorizationStatus.sharingDenied:
      return 'Denied (sharing)';
    case AuthorizationStatus.sharingAuthorized:
      return 'Authorized';
    default:
      return 'Unknown';
  }
};

const requestStatusLabel = (
  status: AuthorizationRequestStatus | 'error' | undefined,
) => {
  if (status === 'error') return 'Error';
  if (status === undefined) return '—';
  switch (status) {
    case AuthorizationRequestStatus.unknown:
      return 'Unknown';
    case AuthorizationRequestStatus.shouldRequest:
      return 'Should request';
    case AuthorizationRequestStatus.unnecessary:
      return 'Granted';
    default:
      return 'Unknown';
  }
};

type Props = { onExit: () => void };

export function QAScreen({ onExit }: Props) {
  const [statuses, setStatuses] = useState<Record<string, StatusKind>>({});
  const [requestStatuses, setRequestStatuses] = useState<
    Record<string, AuthorizationRequestStatus | 'error'>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const loadStatuses = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setError('HealthKit is iOS-only');
      return;
    }
    setLoading(true);
    try {
      const next: Record<string, StatusKind> = {};
      const reqNext: Record<string, AuthorizationRequestStatus | 'error'> = {};
      PERMISSION_TYPES.forEach(({ id, writable }) => {
        if (!writable) {
          next[id] = 'read-only';
          return;
        }
        try {
          next[id] = healthkit.authorizationStatusFor(id);
        } catch (err) {
          console.warn('authorizationStatusFor failed', id, err);
          next[id] = 'error';
        }
      });
      await Promise.all(
        READ_TYPES.map(async id => {
          try {
            const status = await healthkit.getRequestStatusForAuthorization({
              toRead: [id],
            });
            reqNext[id] = status;
          } catch (err) {
            console.warn('getRequestStatusForAuthorization failed', id, err);
            reqNext[id] = 'error';
          }
        }),
      );
      setStatuses(next);
      setRequestStatuses(reqNext);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load statuses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setError('HealthKit is iOS-only');
      return;
    }
    setRequesting(true);
    setError(null);
    try {
      await healthkit.requestAuthorization({
        toRead: READ_TYPES,
        toShare: SHARE_TYPES,
      });
    } catch (err: any) {
      console.warn('requestAuthorization failed', err);
      setError(err?.message || 'Authorization failed');
    } finally {
      setRequesting(false);
      loadStatuses();
    }
  }, [loadStatuses]);

  return (
    <SafeAreaView style={styles.qaContainer} edges={['bottom']}>
      <View style={styles.qaHeader}>
        <Text style={styles.qaTitle}>HealthKit QA</Text>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.qaClose}>Close</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.qaContent}>
        <Text style={styles.qaHint}>
          Dev-only screen (hidden behind long-press in the top-left). Use this
          to verify HealthKit permissions, ingestion, and logs as we build out
          Steps 6-15.
        </Text>
        <Text style={styles.qaSection}>Now in QA:</Text>
        <Text style={styles.qaItem}>- Permission status snapshot</Text>
        <Text style={styles.qaItem}>- One-tap request flow with errors</Text>
        <Text style={styles.qaSection}>Next hookup:</Text>
        <Text style={styles.qaItem}>- Anchored queries + logging hooks</Text>
        <View style={styles.qaCard}>
          <View style={styles.qaCardHeader}>
            <Text style={styles.qaCardTitle}>Permissions</Text>
            <Pressable onPress={loadStatuses} hitSlop={10}>
              <Text style={styles.qaLink}>Refresh</Text>
            </Pressable>
          </View>
          {error && <Text style={styles.qaError}>{error}</Text>}
          {loading ? (
            <Text style={styles.qaItem}>Loading...</Text>
          ) : (
            PERMISSION_TYPES.map(type => (
              <View style={styles.qaRow} key={type.id}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.qaKey}>{type.label}</Text>
                  <Text style={styles.qaCaption}>
                    Read: {requestStatusLabel(requestStatuses[type.id])}
                  </Text>
                  {!type.writable && (
                    <Text style={styles.qaCaption}>Sharing: Read-only</Text>
                  )}
                </View>
                <Text style={styles.qaValue}>{statusLabel(statuses[type.id]) || '—'}</Text>
              </View>
            ))
          )}
          <Pressable
            style={[
              styles.qaButton,
              requesting ? styles.qaButtonDisabled : undefined,
            ]}
            onPress={requestPermissions}
            disabled={requesting}
          >
            <Text style={styles.qaButtonText}>
              {requesting ? 'Requesting…' : 'Request all'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.qaButton, styles.qaSecondaryButton]}
            onPress={() => Linking.openURL('x-apple-health://')}
          >
            <Text style={styles.qaButtonText}>Open Health app</Text>
          </Pressable>
          <Text style={styles.qaCaption}>
            Requests read access for workouts, HR/HRV/VO2, rings, and swim
            metrics. Read-only types (HR/HRV/VO2/rings) will always show “Read-only”
            because iOS doesn’t report a sharing status for them; manage read access
            in the Health app.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  qaContainer: {
    flex: 1,
    backgroundColor: '#F6F8FC',
  },
  qaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0B1F3F',
  },
  qaTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  qaClose: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  qaContent: {
    padding: 16,
    gap: 8,
  },
  qaHint: {
    color: '#2B2B2B',
    fontSize: 14,
    lineHeight: 20,
  },
  qaSection: {
    marginTop: 8,
    fontWeight: '700',
    color: '#0B1F3F',
  },
  qaItem: {
    color: '#2B2B2B',
    fontSize: 14,
  },
  qaCard: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D9DFE7',
  },
  qaCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  qaCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B1F3F',
  },
  qaLink: {
    color: '#0B6EFD',
    fontWeight: '600',
    fontSize: 14,
  },
  qaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  qaKey: {
    flex: 1,
    color: '#1E2A3A',
    fontSize: 14,
  },
  qaValue: {
    fontWeight: '700',
    color: '#0B1F3F',
    fontSize: 14,
  },
  qaButton: {
    marginTop: 12,
    backgroundColor: '#0B1F3F',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  qaSecondaryButton: {
    backgroundColor: '#1F2F50',
  },
  qaButtonDisabled: {
    opacity: 0.6,
  },
  qaButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  qaCaption: {
    marginTop: 4,
    fontSize: 12,
    color: '#54627A',
    lineHeight: 16,
  },
  qaError: {
    color: '#B00020',
    fontWeight: '600',
    marginBottom: 8,
  },
});

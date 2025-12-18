import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  requestWorkoutPermissions,
  runAnchoredFetches,
  getAnchors,
} from '../googlefit/service';
import { clearAnchors } from '../googlefit/anchors';

type Props = { onExit: () => void };

export function GoogleFitQAScreen({ onExit }: Props) {
  const [status, setStatus] = useState<string>('Idle');
  const [anchors, setAnchors] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAnchors = useCallback(async () => {
    try {
      const data = await getAnchors();
      setAnchors(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setAnchors(`Failed to load anchors: ${err?.message || err}`);
    }
  }, []);

  useEffect(() => {
    refreshAnchors();
  }, [refreshAnchors]);

  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setError('Google Fit is Android-only');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus('Requesting permissions...');
    try {
      const resp = await requestWorkoutPermissions();
      setResult(`Permissions response: ${JSON.stringify(resp)}`);
      setStatus('Permission request completed');
    } catch (err: any) {
      console.warn('[GoogleFit][QA] permission request failed', err);
      setError(err?.message || 'Permission request failed');
      setStatus('Permission request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const runFetch = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setError('Google Fit is Android-only');
      return;
    }
    if (loading) return;
    setLoading(true);
    setError(null);
    setStatus('Fetching anchored data...');
    setResult(null);
    try {
      const res = await runAnchoredFetches();
      const summary = `Workouts: ${res.workouts?.length ?? 0}, Heart rates: ${
        res.heartRates?.length ?? 0
      }, Anchors: ${JSON.stringify(res.nextAnchors)}`;
      setResult(summary);
      setAnchors(JSON.stringify(res.nextAnchors, null, 2));
      setStatus('Fetch completed');
    } catch (err: any) {
      console.warn('[GoogleFit][QA] fetch failed', err);
      setError(err?.message || 'Fetch failed');
      setStatus('Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const clearAnchorState = useCallback(async () => {
    try {
      await clearAnchors();
      setAnchors('{}');
      Alert.alert('Cleared', 'Google Fit anchors cleared from storage.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to clear anchors');
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Google Fit QA</Text>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.close}>Close</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Android-only QA screen to request Google Fit permissions and run anchored sync on demand.
        </Text>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Actions</Text>
            <Text style={styles.status}>{status}</Text>
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={requestPermissions}
          >
            <Text style={styles.buttonText}>Request permissions</Text>
          </Pressable>
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            disabled={loading}
            onPress={runFetch}
          >
            <Text style={styles.buttonText}>Run anchored fetch</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={clearAnchorState}>
            <Text style={styles.buttonText}>Clear anchors</Text>
          </Pressable>
          {result && <Text style={styles.result}>{result}</Text>}
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Anchors</Text>
            <Pressable onPress={refreshAnchors} hitSlop={10}>
              <Text style={styles.link}>Refresh</Text>
            </Pressable>
          </View>
          <Text style={styles.mono}>{anchors || '—'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0B1F3F',
  },
  close: {
    color: '#246BFD',
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  hint: {
    color: '#2F3A4C',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontWeight: '700',
    color: '#0B1F3F',
  },
  status: {
    color: '#4B5563',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#246BFD',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: '#162447',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  link: {
    color: '#246BFD',
    fontWeight: '600',
  },
  result: {
    marginTop: 10,
    color: '#111827',
  },
  error: {
    color: '#B91C1C',
    marginBottom: 6,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    color: '#1F2937',
  },
});

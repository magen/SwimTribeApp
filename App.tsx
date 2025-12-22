/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StatusBar,
  StyleSheet,
  View,
  Platform,
  Pressable,
  Alert,
  Modal,
  Text,
  ScrollView,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';
import inAppMessaging from '@react-native-firebase/in-app-messaging';
import installations from '@react-native-firebase/installations';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SplashScreen } from './src/components/SplashScreen';
import { WebViewContent } from './src/components/WebViewContent';
import { QAScreen } from './src/screens/QAScreen';
import { GoogleFitQAScreen } from './src/screens/GoogleFitQAScreen';
import { HealthScreen } from './src/screens/HealthScreen';
import {
  requestUserPermission,
  createNotificationChannel,
  getFCMToken,
  displayNotification,
} from './src/services/notifications';
import { requestWorkoutPermissions, runAnchoredFetches } from './src/healthkit/service';

function AppInner() {
  const headerColor = '#0B1F3F'; // brand header/status color
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(true);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [showQAScreen, setShowQAScreen] = useState(false);
  const [showHealthScreen, setShowHealthScreen] = useState(false);
  const [planEntriesFromWeb, setPlanEntriesFromWeb] = useState<any[]>([]);
  const [hasWorkoutPermission, setHasWorkoutPermission] = useState<boolean>(false);
  const [shouldPromptHealthPermission, setShouldPromptHealthPermission] = useState<boolean>(false);
  const [hasDismissedHealthPrompt, setHasDismissedHealthPrompt] = useState<boolean>(false);
  const [workoutsFetched, setWorkoutsFetched] = useState<any[]>([]);
  const offeredWorkoutIdsRef = useRef<Record<string, boolean>>({});
  const [fetchingWorkouts, setFetchingWorkouts] = useState<boolean>(false);
  const [workoutsFetchedOnce, setWorkoutsFetchedOnce] = useState<boolean>(false);
  const [promptTriggeredThisSession, setPromptTriggeredThisSession] = useState<boolean>(false);
  const fetchingRef = useRef(false);
  const [matchCandidates, setMatchCandidates] = useState<any[]>([]);
  const [showMatchModal, setShowMatchModal] = useState<boolean>(false);
  const webViewRef = useRef<WebView | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const sendAppContextToWeb = useCallback(() => {
    // Send app context to webview
    console.log('Sending app context to webview', { isWebViewReady });
    if (webViewRef.current && isWebViewReady) {
      console.log('Posting APP_CONTEXT message to webview');
      webViewRef.current.postMessage(
        JSON.stringify({
          type: 'APP_CONTEXT',
          isMobileApp: true,
          platform: Platform.OS,
        }),
      );
    }
  }, [isWebViewReady]);

  const sendTokenToWeb = useCallback(
    (token: string) => {
      if (webViewRef.current && isWebViewReady) {
        webViewRef.current.postMessage(
          JSON.stringify({ type: 'FCM_TOKEN', token }),
        );
      }
    },
    [isWebViewReady],
  );

  useEffect(() => {
    AsyncStorage.getItem('@health/prompt_state')
      .then((val) => {
        if (val === 'dismissed') {
          setHasDismissedHealthPrompt(true);
        }
        if (val === 'granted') {
          setHasWorkoutPermission(true);
          setHasDismissedHealthPrompt(true);
        }
      })
      .catch(() => {});

    // Initialize notifications
    const initializeNotifications = async () => {
      try {
        // Request permissions
        const permissionGranted = await requestUserPermission();
        
        if (permissionGranted) {
          // Create notification channel for Android
          await createNotificationChannel();
          
          // Get FCM token
          const token = await getFCMToken();
          // print token to console
          console.log('Retrieved FCM Token:', token);

          if (token) {
            setFcmToken(token);
            sendTokenToWeb(token);
          }
          
          // Handle foreground messages
          const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
            console.log('Foreground message received:', remoteMessage);
            await displayNotification(remoteMessage);
          });
          
          // Handle notification that opened the app from killed state
          messaging()
            .getInitialNotification()
            .then(remoteMessage => {
              if (remoteMessage) {
                console.log('Notification caused app to open from quit state:', remoteMessage);
                // Handle navigation or action based on notification data
              }
            });
          
          // Handle notification that opened the app from background state
          messaging().onNotificationOpenedApp(remoteMessage => {
            console.log('Notification caused app to open from background state:', remoteMessage);
            // Handle navigation or action based on notification data            
            
          });
          
          return () => {
            unsubscribeForeground();
          };
        }
      } catch (error) {
        console.error('Error initializing notifications:', error);
      }
    };

    initializeNotifications();
    return undefined;
  }, [sendTokenToWeb]);

  useEffect(() => {
    const initInAppMessaging = async () => {
      try {
        await inAppMessaging().setAutomaticDataCollectionEnabled(true);
        await inAppMessaging().setMessagesDisplaySuppressed(false);

        const fid = await installations().getId();
        console.log('Firebase Installation ID:', fid);
      } catch (err) {
        console.warn('Failed to init in-app messaging', err);
      }
    };
    initInAppMessaging();
  }, []);

  useEffect(() => {
    // Send FCM token and app context to webview when ready
    console.log('App effect: fcmToken or isWebViewReady changed', { fcmToken, isWebViewReady });
    if (fcmToken) {
      sendTokenToWeb(fcmToken);
    }
    // Send app context when webview is ready
    console.log('Checking to send app context to webview', { isWebViewReady });
    if (isWebViewReady) {
      sendAppContextToWeb();
    }
  }, [fcmToken, isWebViewReady, sendAppContextToWeb, sendTokenToWeb]);

  const sendMatchConfirmationToWeb = useCallback(
    (candidate: any) => {
      if (!webViewRef.current || !isWebViewReady) {
        console.warn('[WEBVIEW] not ready to send match confirmation');
        return;
      }
      const workout = workoutsFetched[candidate.workoutIdx];
      const payload = {
        planId: candidate.planId,
        planTitle: candidate.planTitle,
        planStart: candidate.planStart,
        trainingDate: candidate.planTrainingDateIso,
        workoutIdx: candidate.workoutIdx,
        workoutStart: candidate.workoutStart,
        distanceMeters: candidate.distanceMeters,
        durationSeconds: candidate.durationSeconds,
        energyKcal: candidate.energyKcal,
        strokeCount: candidate.strokeCount,
        swolfApprox: candidate.swolfApprox,
        reason: candidate.reason,
        workout,
      };
      console.log('workout', workout);
      console.log('[WEBVIEW] sending MATCH_CONFIRMED', payload);
      webViewRef.current.postMessage(
        JSON.stringify({
          type: 'MATCH_CONFIRMED',
          payload,
        }),
      );
    },
    [isWebViewReady, workoutsFetched],
  );

  const handleConfirmCandidate = useCallback(
    (idx: number) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMatchCandidates(prev => {
        if (!prev[idx]) return prev;
        const candidate = prev[idx];
        sendMatchConfirmationToWeb(candidate);
        const next = prev.filter((_, i) => i !== idx);
        if (next.length === 0) {
          setShowMatchModal(false);
        }
        return next;
      });
    },
    [sendMatchConfirmationToWeb],
  );

  // Prompt for workouts permission once plan data arrives (unless dismissed/granted)
  useEffect(() => {
    if (
      isWebViewReady &&
      planEntriesFromWeb.length > 0 &&
      !hasWorkoutPermission &&
      !hasDismissedHealthPrompt &&
      !promptTriggeredThisSession
    ) {
      setShouldPromptHealthPermission(true);
      setPromptTriggeredThisSession(true);
    }
  }, [
    isWebViewReady,
    planEntriesFromWeb.length,
    hasWorkoutPermission,
    hasDismissedHealthPrompt,
    promptTriggeredThisSession,
  ]);

  const fetchWorkouts = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setFetchingWorkouts(true);
      const result = await runAnchoredFetches();
      setWorkoutsFetched(result.workouts || []);
      offeredWorkoutIdsRef.current = {};
      setWorkoutsFetchedOnce(true);
      console.log('[HEALTH] auto anchored fetch complete', {
        workouts: result.workouts?.length || 0,
        anchors: result.nextAnchors,
      });
    } catch (err) {
      console.warn('[HEALTH] auto anchored fetch failed', err);
    } finally {
      fetchingRef.current = false;
      setFetchingWorkouts(false);
    }
  }, []);

  // Auto fetch workouts via anchored fetch once permission is granted and app is ready
  useEffect(() => {
    if (
      hasWorkoutPermission &&
      isWebViewReady &&
      planEntriesFromWeb.length > 0 &&
      !workoutsFetchedOnce &&
      !fetchingWorkouts
    ) {
      fetchWorkouts();
    }
  }, [
    hasWorkoutPermission,
    isWebViewReady,
    planEntriesFromWeb.length,
    workoutsFetchedOnce,
    fetchingWorkouts,
    fetchWorkouts,
  ]);

  // Build match candidates per session/batch; avoid re-offering the same workout within a batch
  useEffect(() => {
    if (planEntriesFromWeb.length > 0 && workoutsFetched.length > 0) {
      const { candidates, usedIds, debug } = matchWorkoutsToPlan(
        workoutsFetched,
        planEntriesFromWeb,
        offeredWorkoutIdsRef.current,
      );
      if (__DEV__) {
        console.log('[MATCH] evaluated', {
          planCount: planEntriesFromWeb.length,
          workoutCount: workoutsFetched.length,
          candidateCount: candidates.length,
          debug,
        });
      }
      if (usedIds.length > 0) {
        usedIds.forEach(id => {
          offeredWorkoutIdsRef.current[id] = true;
        });
      }
      setMatchCandidates(candidates);
      setShowMatchModal(candidates.length > 0);
    }
  }, [planEntriesFromWeb, workoutsFetched]);

  useHealthPermissionPrompt(
    shouldPromptHealthPermission,
    setShouldPromptHealthPermission,
    () => {
      setHasWorkoutPermission(true);
      setHasDismissedHealthPrompt(true);
      AsyncStorage.setItem('@health/prompt_state', 'granted').catch(() => {});
    },
    () => {
      setHasDismissedHealthPrompt(true);
      AsyncStorage.setItem('@health/prompt_state', 'dismissed').catch(() => {});
    },
  );

  return (
    <>
      <StatusBar
        barStyle={'light-content'}
        backgroundColor={headerColor}
        translucent={false}
      />
      <View style={{ height: insets.top, backgroundColor: headerColor }} />
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        {showSplash ? (
          <SplashScreen onFinish={() => setShowSplash(false)} />
        ) : showHealthScreen ? (
          <HealthScreen
            onExit={() => setShowHealthScreen(false)}
            planEntriesOverride={planEntriesFromWeb}
          />
        ) : showQAScreen ? (
          Platform.OS === 'ios' ? (
            <QAScreen
              onExit={() => setShowQAScreen(false)}
              onOpenHealth={() => setShowHealthScreen(true)}
            />
          ) : (
            <GoogleFitQAScreen onExit={() => setShowQAScreen(false)} />
          )
        ) : (
          <>
            {__DEV__ && (
              <Pressable
                accessibilityLabel="Open QA screen"
                onLongPress={() => setShowQAScreen(true)}
                style={styles.devHotspot}
              />
            )}
            <WebViewContent
              webViewRef={webViewRef}
              onWebViewReady={() => {
                setIsWebViewReady(true);
                sendAppContextToWeb();
                if (fcmToken) {
                  sendTokenToWeb(fcmToken);
                }
              }}
              onLog={(...args) => console.log('[WEBVIEW]', ...args)}
              onPlanTrainings={(trainings) => {
                console.log('[WEBVIEW] received planTrainings', trainings);
                try {
                  const mapped = (trainings || []).map((t: any) => ({
                    id: t.id,
                    title: t.title,
                    trainingDate: new Date(t.training_date),
                    estimatedMinutes: t.estimated_duration,
                  }));
                  setPlanEntriesFromWeb(mapped);
                } catch (err) {
                  console.warn('[WEBVIEW] failed to map planTrainings', err);
                }
              }}
            />
          </>
        )}
      </View>

      <Modal visible={showMatchModal} transparent animationType="slide" onRequestClose={() => setShowMatchModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Possible matches</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {matchCandidates.map((c, idx) => (
                <View key={`${c.planId}-${c.workoutId ?? idx}`} style={styles.modalItem}>
                  <View style={styles.matchRow}>
                    <View style={styles.matchCol}>
                      <Text style={styles.modalItemTitle}>Plan</Text>
                      <Text style={styles.modalItemText}>{c.planTitle}</Text>
                      <Text style={styles.modalItemTextSmall}>{c.planStart}</Text>
                    </View>
                    <View style={[styles.matchCol, styles.matchColRight]}>
                      <Text style={styles.modalItemTitle}>Workout</Text>
                      <Text style={styles.modalItemText}>{c.workoutStart}</Text>
                      {c.distanceMeters != null && (
                        <Text style={styles.modalItemTextSmall}>Distance: {c.distanceMeters.toFixed(0)} m</Text>
                      )}
                      {c.durationSeconds != null && (
                        <Text style={styles.modalItemTextSmall}>Duration: {(c.durationSeconds / 60).toFixed(1)} min</Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.modalReason}>Reason: {c.reason}</Text>
                  <Pressable
                    style={[styles.qaButton, { marginTop: 8 }]}
                    onPress={() => handleConfirmCandidate(idx)}
                  >
                    <Text style={styles.qaButtonText}>Confirm</Text>
                  </Pressable>
                </View>
              ))}
              {matchCandidates.length === 0 && (
            <Text style={styles.modalItemText}>No candidates found.</Text>
          )}
        </ScrollView>
        <View style={styles.modalActions}>
          <Pressable style={[styles.qaButton, styles.qaSecondaryButton]} onPress={() => setShowMatchModal(false)}>
            <Text style={styles.qaButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
    </>
  );
}

// Prompt for HealthKit workouts permission with business context
function useHealthPermissionPrompt(
  shouldPrompt: boolean,
  setShouldPrompt: (v: boolean) => void,
  onGranted: () => void,
  onDismissed: () => void,
) {
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (!shouldPrompt) {
      hasShownRef.current = false;
      return;
    }
    if (hasShownRef.current) return;
    hasShownRef.current = true;
    Alert.alert(
      'Connect your workouts',
      'We use your recent swim workouts to match them with your training plan. Connect Health to keep your log accurate.',
      [
        {
          text: 'Not now',
          style: 'cancel',
          onPress: () => {
            setShouldPrompt(false);
            onDismissed();
          },
        },
        {
          text: 'Connect',
          onPress: async () => {
            setShouldPrompt(false);
            try {
              await requestWorkoutPermissions();
              console.log('[HEALTH] workout permission request completed');
              onGranted();
            } catch (err) {
              console.warn('[HEALTH] workout permission request failed', err);
              onDismissed();
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [shouldPrompt, setShouldPrompt, onGranted, onDismissed]);
}

function getWorkoutId(w: any): string | null {
  const uuid = (w as any).uuid;
  if (uuid) return uuid;
  const id = (w as any).id;
  if (id) return id;
  const sessionId = (w as any).sessionId;
  if (sessionId) return sessionId;
  const start = (w as any).startDate ?? (w as any).start;
  const end = (w as any).endDate ?? (w as any).end;
  const activity = (w as any).workoutActivityType ?? (w as any).activityType ?? '';
  if (start && end) {
    return `${start}-${end}-${activity}`;
  }
  return null;
}

function matchWorkoutsToPlan(
  workouts: any[],
  plans: any[],
  offeredIds: Record<string, boolean>,
) {
  const WINDOW_MS = 4 * 60 * 60 * 1000; // ±4h
  const debug = {
    skippedNonSwim: 0,
    skippedNoId: 0,
    skippedAlreadyOffered: 0,
    skippedOutsideDay: 0,
    skippedOutsideWindow: 0,
    skippedOther: 0,
  };

  const normalizeDistanceMeters = (w: any) => {
    const rawDistance = (w as any).totalDistance as number | undefined;
    const rawUnit = (w as any).totalDistanceUnit as string | undefined;
    if (rawDistance == null) return undefined;
    if (rawUnit === 'm') return rawDistance;
    if (rawUnit === 'km') return rawDistance * 1000;
    return rawDistance;
  };

  const normalizeEnergyKcal = (w: any) => {
    console.log('Normalizing energy for workout', w);
    console.log('Raw totalEnergyBurned:', (w as any).totalEnergyBurned);
    console.log('Raw totalEnergyBurnedUnit:', (w as any).totalEnergyBurnedUnit);
    const rawEnergy = (w as any).totalEnergyBurned as number | undefined;
    const rawUnit = (w as any).totalEnergyBurnedUnit as string | undefined;
    if (rawEnergy == null) return undefined;
    if (rawUnit === 'kcal') return rawEnergy;
    if (rawUnit === 'cal') return rawEnergy / 1000;
    return rawEnergy;
  };

  const normalizeStrokeCount = (w: any) => {
    const raw = (w as any).totalSwimmingStrokeCount as number | undefined;
    if (raw == null) return undefined;
    return raw;
  };

  const candidates: any[] = [];
  const usedIds: string[] = [];

  plans.forEach((plan: any) => {
    const planDate = new Date(plan.trainingDate);
    const planStartMs = planDate.getTime();
    const dayStart = new Date(planDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    workouts.forEach((w, idx) => {
      if ((w as any).workoutActivityType !== 46) {
        debug.skippedNonSwim += 1;
        return; // swimming only
      }
      const workoutId = getWorkoutId(w);
      if (!workoutId) {
        debug.skippedNoId += 1;
        return;
      }
      if (offeredIds[workoutId]) {
        debug.skippedAlreadyOffered += 1;
        return;
      }
      const startMs = new Date((w as any).startDate ?? 0).getTime();
      if (startMs < dayStart.getTime() || startMs > dayEnd.getTime()) {
        debug.skippedOutsideDay += 1;
        return;
      }
      const delta = Math.abs(startMs - planStartMs);
      if (delta > WINDOW_MS) {
        debug.skippedOutsideWindow += 1;
        return;
      }

      const durationSeconds = (w as any).duration?.quantity as number | undefined;
      const distanceMeters = normalizeDistanceMeters(w);
      const energyKcal = normalizeEnergyKcal(w);
      const strokeCount = normalizeStrokeCount(w);
      const reasonParts = [`Δtime ${(delta / (60 * 1000)).toFixed(0)} min`];
      if (plan.estimatedMinutes && durationSeconds) {
        const diff = Math.abs(durationSeconds / 60 - plan.estimatedMinutes);
        reasonParts.push(`Δduration ${diff.toFixed(1)} min`);
      }
      if (distanceMeters != null) {
        reasonParts.push(`distance ${distanceMeters.toFixed(0)} m`);
      }
      let swolfApprox: number | undefined;
      if (strokeCount && distanceMeters && distanceMeters > 0 && durationSeconds) {
        const strokesPer100m = (strokeCount / distanceMeters) * 100;
        swolfApprox = (durationSeconds / distanceMeters) * 100 + strokesPer100m;
      }

      candidates.push({
         planId: plan.id,
         planTitle: plan.title,
         planStart: planDate.toLocaleString(),
         planTrainingDateIso: planDate.toISOString(),
         workoutIdx: idx,
         workoutStart: new Date((w as any).startDate).toLocaleString(),
         distanceMeters,
         durationSeconds,
         energyKcal,
         strokeCount,
         swolfApprox,
         reason: reasonParts.join(', '),
         workoutId,
      });
      usedIds.push(workoutId);
    });
  });

  return { candidates, usedIds, debug };
}

function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  devHotspot: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 44,
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111827',
  },
  modalItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  modalItemText: {
    fontSize: 13,
    color: '#4B5563',
  },
  modalItemTextSmall: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalReason: {
    fontSize: 12,
    color: '#374151',
    marginTop: 6,
  },
  matchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  matchCol: {
    flex: 1,
  },
  matchColRight: {
    alignItems: 'flex-end',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
});

export default App;

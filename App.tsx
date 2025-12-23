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

      <Modal
        visible={showMatchModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMatchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.matchSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Match your swim</Text>
                <Text style={styles.modalSubtitle}>
                  We found workouts that line up with your training plan. Confirm to sync.
                </Text>
              </View>
              <Pressable style={styles.iconButton} onPress={() => setShowMatchModal(false)}>
                <Text style={styles.iconButtonText}>X</Text>
              </Pressable>
            </View>
            <ScrollView
              style={{ maxHeight: 440 }}
              contentContainerStyle={styles.candidatesList}
              showsVerticalScrollIndicator={false}
            >
              {matchCandidates.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No matches yet</Text>
                  <Text style={styles.emptyCaption}>Finish a swim and we will surface it here.</Text>
                </View>
              ) : (
                matchCandidates.map((c, idx) => (
                  <View key={`${c.planId}-${c.workoutId ?? idx}`} style={styles.candidateCard}>
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.badgeRow}>
                        <Text style={[styles.pill, styles.planPill]}>Plan</Text>
                        <Text style={styles.cardTitle}>{c.planTitle}</Text>
                      </View>
                      <Text style={styles.metaText}>{c.planStart}</Text>
                    </View>

                    <View style={styles.timelineRow}>
                      <View style={[styles.timelineDot, styles.planDot]} />
                      <View style={styles.timelineLine} />
                      <View style={[styles.timelineDot, styles.workoutDot]} />
                    </View>

                    <View style={styles.cardBodyRow}>
                      <View style={styles.cardColumn}>
                        <Text style={styles.label}>Planned</Text>
                        <Text style={styles.value}>{c.planStart}</Text>
                      </View>
                      <View style={styles.cardColumn}>
                        <Text style={styles.label}>Workout</Text>
                        <Text style={styles.value}>{c.workoutStart}</Text>
                        {c.distanceMeters != null && (
                          <Text style={styles.metaText}>
                            Distance: {c.distanceMeters.toFixed(0)} m
                          </Text>
                        )}
                        {c.durationSeconds != null && (
                          <Text style={styles.metaText}>
                            Duration: {(c.durationSeconds / 60).toFixed(1)} min
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={styles.reasonBadge}>
                      <Text style={styles.reasonText}>{c.reason}</Text>
                    </View>

                    <Pressable
                      style={styles.confirmButton}
                      onPress={() => handleConfirmCandidate(idx)}
                    >
                      <Text style={styles.confirmButtonText}>Confirm match</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.dismissButton} onPress={() => setShowMatchModal(false)}>
                <Text style={styles.dismissButtonText}>Close</Text>
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
  const WINDOW_MS = 10 * 60 * 60 * 1000; // ±4h
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
    backgroundColor: 'rgba(4, 14, 34, 0.65)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  matchSheet: {
    backgroundColor: '#0B1F3F',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1F2F50',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#D6E1FF',
    lineHeight: 18,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#12294F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  candidatesList: {
    paddingVertical: 4,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#0F2449',
    borderRadius: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  emptyCaption: {
    marginTop: 6,
    color: '#C7D5FF',
    fontSize: 13,
  },
  candidateCard: {
    backgroundColor: '#0F2449',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1F2F50',
    gap: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#112B52',
    color: '#C7D5FF',
    fontSize: 11,
    fontWeight: '700',
  },
  planPill: {
    backgroundColor: '#0EA5E9',
    color: '#0B1F3F',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  metaText: {
    color: '#A6B7D6',
    fontSize: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0EA5E9',
  },
  planDot: {
    backgroundColor: '#0EA5E9',
  },
  workoutDot: {
    backgroundColor: '#7C9BFF',
  },
  timelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#1F3B68',
    borderRadius: 4,
  },
  cardBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardColumn: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: '#C7D5FF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  reasonBadge: {
    backgroundColor: '#112B52',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  reasonText: {
    color: '#C7D5FF',
    fontSize: 12,
  },
  confirmButton: {
    marginTop: 4,
    backgroundColor: '#0EA5E9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#0B1F3F',
    fontWeight: '800',
    fontSize: 15,
  },
  modalActions: {
    marginTop: 12,
  },
  dismissButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1F3B68',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#0F2449',
  },
  dismissButtonText: {
    color: '#C7D5FF',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default App;

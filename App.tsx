/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View, ActivityIndicator, Platform, Alert, Pressable, Text, ScrollView, Linking } from 'react-native';
import * as healthkit from '@kingstinct/react-native-healthkit';
import {
  AuthorizationStatus,
  AuthorizationRequestStatus,
  type ObjectTypeIdentifier,
  type SampleTypeIdentifierWriteable,
} from '@kingstinct/react-native-healthkit/types';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Video from 'react-native-video';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import LottieView from 'lottie-react-native';
import inAppMessaging from '@react-native-firebase/in-app-messaging';
import installations from '@react-native-firebase/installations';

// Request notification permissions
async function requestUserPermission() {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

  if (enabled) {
    console.log('Authorization status:', authStatus);
  }

  return enabled;
}

// Get FCM token
async function getFCMToken() {
  try {
    // On iOS, we must register for remote messages before getting the token
    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages();
    }
    const token = await messaging().getToken();
    if (!token) {
      console.warn('FCM token is null');
    } else{
      console.log('FCM Token:', token);
      }
    
    // TODO: Send token to your backend server
    return token;
  } catch (error) {
    console.error('Error getting FCM token:', error);
    return null;
  }
}

// Create Android notification channel
async function createNotificationChannel() {
  if (Platform.OS === 'android') {
    await notifee.createChannel({
      id: 'default',
      name: 'Default Channel',
      sound: 'default',
      importance: AndroidImportance.HIGH,
    });
  }
}

// Display local notification for foreground messages
async function displayNotification(remoteMessage: any) {
  const { notification, data } = remoteMessage;
  
  if (Platform.OS === 'android') {
    await notifee.displayNotification({
      title: notification?.title || 'New Notification',
      body: notification?.body || '',
      android: {
        channelId: 'default',
        smallIcon: 'ic_stat_swimtribe',
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'default',
        },
      },
      data: data || {},
    });
  } else {
    // iOS handles notifications automatically when app is in foreground
    // but we can still show an alert if needed
    if (notification?.title) {
      Alert.alert(notification.title, notification.body || '');
    }
  }
}

function AppInner() {
  const isDarkMode = useColorScheme() === 'dark';
  const headerColor = '#0B1F3F'; // brand header/status color
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(true);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [showQAScreen, setShowQAScreen] = useState(false);
  const webViewRef = useRef<WebView | null>(null);

  const sendAppContextToWeb = useCallback(() => {
    if (webViewRef.current && isWebViewReady) {
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
    if (fcmToken) {
      sendTokenToWeb(fcmToken);
    }
    if (isWebViewReady) {
      sendAppContextToWeb();
    }
  }, [fcmToken, isWebViewReady, sendAppContextToWeb, sendTokenToWeb]);

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
        ) : showQAScreen ? (
          <QAScreen onExit={() => setShowQAScreen(false)} />
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
            />
          </>
        )}
      </View>
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function SplashScreen({ onFinish }: { onFinish: () => void }) {
  return (
    <SafeAreaView style={styles.splashContainer} edges={['bottom']}>
      <View style={styles.splashContent}>
        <Video
          source={require('./assets/animations/splashAnimation_mov.mp4')}
          style={styles.video}
          resizeMode="cover"
          muted
          onEnd={onFinish}
          onError={e => {
            console.warn('Splash video error', e);
            onFinish();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function WebViewContent({
  webViewRef,
  onWebViewReady,
}: {
  webViewRef: React.RefObject<WebView | null>;
  onWebViewReady: () => void;
}) {
  const solidHeaderScript = `
    (function() {
      try {
        const style = document.createElement('style');
        style.innerHTML = 'header{background-color:#0B1F3F !important;backdrop-filter:none !important;}';
        document.head.appendChild(style);
      } catch (e) {
        console.log('header style inject failed', e);
      }
    })();
    true;
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'log') {
        console.log('[WEBVIEW]', ...data.payload);
      }
    } catch (err) {
      console.warn('Bad message from webview', err);
    }
  };

  return (
    <SafeAreaView style={styles.webviewContainer} edges={['bottom']}>
      <WebView
        ref={webViewRef}
        source={{ uri: 'http://192.168.1.25:5173/login' }}
        style={styles.webview}
        startInLoadingState={true}
        onLoadEnd={onWebViewReady}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={solidHeaderScript}
        injectedJavaScript={solidHeaderScript}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <LottieView
              source={require('./assets/animations/loading-animation.json')}
              autoPlay
              loop
              style={styles.lottie}
            />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

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

function QAScreen({ onExit }: { onExit: () => void }) {
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
  container: {
    flex: 1,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  splashContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  lottie: {
    width: 220,
    height: 220,
  },
  video: {
    width: 240,
    height: 240,
  },
  devHotspot: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 44,
    zIndex: 10,
  },
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
    marginTop: 8,
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

export default App;

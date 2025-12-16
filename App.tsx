/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StatusBar, StyleSheet, View, Platform, Pressable } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';
import inAppMessaging from '@react-native-firebase/in-app-messaging';
import installations from '@react-native-firebase/installations';
import { SplashScreen } from './src/components/SplashScreen';
import { WebViewContent } from './src/components/WebViewContent';
import { QAScreen } from './src/screens/QAScreen';
import { HealthScreen } from './src/screens/HealthScreen';
import {
  requestUserPermission,
  createNotificationChannel,
  getFCMToken,
  displayNotification,
} from './src/services/notifications';

function AppInner() {
  const headerColor = '#0B1F3F'; // brand header/status color
  const insets = useSafeAreaInsets();
  const [showSplash, setShowSplash] = useState(true);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);
  const [showQAScreen, setShowQAScreen] = useState(false);
  const [showHealthScreen, setShowHealthScreen] = useState(false);
  const [planEntriesFromWeb, setPlanEntriesFromWeb] = useState<any[]>([]);
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
        ) : showHealthScreen ? (
          <HealthScreen
            onExit={() => setShowHealthScreen(false)}
            planEntriesOverride={planEntriesFromWeb}
          />
        ) : showQAScreen ? (
          <QAScreen
            onExit={() => setShowQAScreen(false)}
            onOpenHealth={() => setShowHealthScreen(true)}
          />
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
                  setShowHealthScreen(true);
                } catch (err) {
                  console.warn('[WEBVIEW] failed to map planTrainings', err);
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

const styles = StyleSheet.create({
  devHotspot: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 44,
    height: 44,
    zIndex: 10,
  },
});

export default App;

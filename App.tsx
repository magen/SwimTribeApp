/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View, ActivityIndicator, Platform, Alert } from 'react-native';
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
  const webViewRef = useRef<WebView | null>(null);

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
  }, [fcmToken, sendTokenToWeb]);

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
        ) : (
          <WebViewContent
            webViewRef={webViewRef}
            onWebViewReady={() => {
              setIsWebViewReady(true);
              if (fcmToken) {
                sendTokenToWeb(fcmToken);
              }
            }}
          />
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
          resizeMode="contain"
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
        source={{ uri: 'https://swim-tribe.com/' }}
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
});

export default App;

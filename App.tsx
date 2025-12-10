/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import LottieView from 'lottie-react-native';

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

function App() {
  const isDarkMode = useColorScheme() === 'dark';
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

    // Show splash screen for 2 seconds
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [sendTokenToWeb]);

  useEffect(() => {
    if (fcmToken) {
      sendTokenToWeb(fcmToken);
    }
  }, [fcmToken, sendTokenToWeb]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {showSplash ? (
        <SplashScreen />
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
    </SafeAreaProvider>
  );
}

function SplashScreen() {
  return (
    <SafeAreaView style={styles.splashContainer} edges={['top', 'bottom']}>
      <View style={styles.splashContent}>
        <LottieView
          source={require('./assets/animations/loading-animation.json')}
          autoPlay
          loop
          style={styles.lottie}
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
    <SafeAreaView style={styles.webviewContainer} edges={['top', 'bottom']}>
      <WebView
        ref={webViewRef}
        source={{ uri: 'http://192.168.68.104:5173/' }}
        style={styles.webview}
        startInLoadingState={true}
        onLoadEnd={onWebViewReady}
        onMessage={handleMessage}
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
});

export default App;

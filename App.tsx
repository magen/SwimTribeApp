/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, useColorScheme, View, Text, ActivityIndicator, Platform, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';

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
    console.log('FCM Token:', token);
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
          await getFCMToken();
          
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
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {showSplash ? (
        <SplashScreen />
      ) : (
        <WebViewContent />
      )}
    </SafeAreaProvider>
  );
}

function SplashScreen() {
  return (
    <SafeAreaView style={styles.splashContainer} edges={['top', 'bottom']}>
      <View style={styles.splashContent}>
        <Text style={styles.splashText}>Swim Tribe</Text>
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      </View>
    </SafeAreaView>
  );
}

function WebViewContent() {
  return (
    <SafeAreaView style={styles.webviewContainer} edges={['top', 'bottom']}>
      <WebView
        source={{ uri: 'https://swim-tribe.com/' }}
        style={styles.webview}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
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
  splashText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 20,
  },
  loader: {
    marginTop: 20,
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
});

export default App;

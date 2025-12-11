/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';

// Handle background notification events (e.g., press actions) when the app is killed
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS || type === EventType.PRESS) {
    console.log('Notification pressed in background', detail.notification?.id);
    // TODO: handle navigation based on detail.notification?.data if needed
  }
});

// Register background handler for notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
  const dataTitle = remoteMessage.data?.title;
  const dataBody = remoteMessage.data?.body;

  const channelId = await notifee.createChannel({
    id: 'default',
    name: 'Default Channel',
    importance: AndroidImportance.HIGH,
  });

  await notifee.displayNotification({
    title: remoteMessage.notification?.title || dataTitle || 'New Notification',
    body: remoteMessage.notification?.body || dataBody || '',
    data: remoteMessage.data || {},
    android: {
      channelId,
      smallIcon: 'ic_stat_swimtribe',
      importance: AndroidImportance.HIGH,
      pressAction: {
        id: 'default', // opens the app
      },
    },
  });
});

AppRegistry.registerComponent(appName, () => App);

/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';

// Register background handler for notifications
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('Message handled in the background!', remoteMessage);
  // You can perform background tasks here
  // Note: You cannot show UI or use React components here
});

AppRegistry.registerComponent(appName, () => App);

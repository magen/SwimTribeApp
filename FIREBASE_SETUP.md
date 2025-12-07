# Firebase Push Notifications Setup

## What Has Been Completed

✅ All code implementation is complete:
- Firebase dependencies installed (`@react-native-firebase/app`, `@react-native-firebase/messaging`, `@notifee/react-native`)
- iOS configuration (Info.plist, AppDelegate.swift, Podfile)
- Android configuration (build.gradle files, AndroidManifest.xml)
- Notification handlers implemented for all app states (foreground, background, killed)
- Background message handler configured in `index.js`

## Next Steps - Firebase Console Setup

### 1. Create Firebase Project
1. Go to https://console.firebase.google.com
2. Click "Add project" or select an existing project
3. Follow the setup wizard

### 2. Add iOS App
1. In Firebase Console, click "Add app" → iOS
2. Enter your bundle ID: `com.swimtribeapp`
3. Download `GoogleService-Info.plist`
4. Place it in: `ios/SwimTribeApp/GoogleService-Info.plist`

### 3. Configure APNs for iOS
1. In Firebase Console → Project Settings → Cloud Messaging
2. Upload your APNs Authentication Key or Certificate:
   - **Option A (Recommended)**: APNs Authentication Key (.p8 file)
     - Generate in Apple Developer Portal → Certificates, Identifiers & Profiles → Keys
     - Upload the .p8 file and enter Key ID and Team ID
   - **Option B**: APNs Certificate (.p12 file)
     - Generate in Apple Developer Portal
     - Upload the .p12 file

### 4. Add Android App
1. In Firebase Console, click "Add app" → Android
2. Enter your package name: `com.swimtribeapp`
3. Download `google-services.json`
4. Place it in: `android/app/google-services.json`

### 5. Test Notifications
1. After adding both apps and configuration files, rebuild the app:
   ```bash
   # iOS
   cd ios && pod install && cd ..
   npm run ios
   
   # Android
   npm run android
   ```
2. Check console logs for FCM token (it will be printed on app start)
3. In Firebase Console → Cloud Messaging → Send test message
4. Enter the FCM token and send a test notification

## Important Notes

- **FCM Token**: The token is logged to console on app start. You should send this token to your backend server to enable targeted notifications.
- **iOS**: Requires a paid Apple Developer account for APNs
- **Android**: No additional setup needed beyond the configuration file
- **Permissions**: The app will request notification permissions on first launch

## Troubleshooting

- **iOS build errors**: Make sure `GoogleService-Info.plist` is in the correct location and added to Xcode project
- **Android build errors**: Ensure `google-services.json` is in `android/app/` directory
- **Notifications not working**: Check that APNs is properly configured in Firebase Console for iOS
- **Token not generated**: Verify Firebase configuration files are correctly placed and app has notification permissions


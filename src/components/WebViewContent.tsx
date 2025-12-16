import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import LottieView from 'lottie-react-native';

type Props = {
  webViewRef: React.RefObject<WebView | null>;
  onWebViewReady: () => void;
  onLog?: (...args: any[]) => void;
  onPlanTrainings?: (trainings: any[]) => void;
};

export function WebViewContent({ webViewRef, onWebViewReady, onLog, onPlanTrainings }: Props) {
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
        onLog?.(...data.payload);
      } else if (data?.type === 'planTrainings') {
        console.log('Received planTrainings message', data.payload);
        onPlanTrainings?.(data.trainings || []);
      }
    } catch (err) {
      console.warn('Bad message from webview', err);
    }
  };

  return (
    <SafeAreaView style={styles.webviewContainer} edges={['bottom']}>
      <WebView
        ref={webViewRef}
        source={{ uri: 'http://192.168.68.110:5173/login' }}
        style={styles.webview}
        startInLoadingState={true}
        onLoadEnd={onWebViewReady}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={solidHeaderScript}
        injectedJavaScript={solidHeaderScript}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <LottieView
              source={require('../../assets/animations/loading-animation.json')}
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

import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import Video from 'react-native-video';

type Props = {
  onFinish: () => void;
};

export function SplashScreen({ onFinish }: Props) {
  return (
    <SafeAreaView style={styles.splashContainer} edges={['bottom']}>
      <View style={styles.splashContent}>
        <Video
          source={require('../../assets/animations/splashAnimation_mov.mp4')}
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

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  splashContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: 240,
    height: 240,
  },
});

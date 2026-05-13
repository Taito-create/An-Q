import { Slot } from 'expo-router';
import MiniPlayer from './miniPlayer';
import { ThemeProvider } from './theme';
import { AuthProvider } from './auth/authProvider';
import { BGMProvider } from './bgmContext';
import { SEProvider } from './seContext';
import { CustomBGMProvider } from './customBGMContext';
import { TutorialProvider } from './tutorial/tutorialContext';
import TutorialOverlay from './tutorial/TutorialOverlay';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordLogin } from './missions';
import { SoundManager } from './sound';

export default function RootLayout() {
  const [bgmReady, setBgmReady] = useState(false);

  useEffect(() => {
    // Initialize sounds (without playing BGM yet)
    const initializeSounds = async () => {
      try {
        await SoundManager.initialize();
        await SoundManager.initializeBGM();
        setBgmReady(true);
        console.log('BGM initialization completed');
      } catch (error) {
        console.error('BGM initialization failed:', error);
        setBgmReady(true);
      }
    };

    // Play BGM on first user interaction
    const handleFirstInteraction = async () => {
      try {
        await SoundManager.playBGM();
      } catch (error) {
        console.error('BGM play on interaction failed:', error);
      }
      // Remove listener after first interaction
      if (typeof document !== 'undefined') {
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('touchstart', handleFirstInteraction);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('click', handleFirstInteraction, { once: true });
      document.addEventListener('touchstart', handleFirstInteraction, { once: true });
    }
    
    // Migrate old timer keys to new unified key
    const migrateTimerKeys = async () => {
      try {
        const oldKey1 = await AsyncStorage.getItem('timerSetting');
        const oldKey2 = await AsyncStorage.getItem('CURRENT_TIMER_SETTING');
        
        if (oldKey1 && !await AsyncStorage.getItem('APP_TIMER_SETTING')) {
          await AsyncStorage.setItem('APP_TIMER_SETTING', oldKey1);
        }
        if (oldKey2 && !await AsyncStorage.getItem('APP_TIMER_SETTING')) {
          await AsyncStorage.setItem('APP_TIMER_SETTING', oldKey2);
        }
        
        // Remove old keys
        await AsyncStorage.multiRemove(['timerSetting', 'CURRENT_TIMER_SETTING']);
      } catch (e) {
        console.error('Timer migration failed:', e);
      }
    };
    
    initializeSounds();
    migrateTimerKeys();
    recordLogin();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <BGMProvider>
          <SEProvider>
            <CustomBGMProvider>
              <TutorialProvider>
                <Slot />
                <MiniPlayer />
                <TutorialOverlay />
              </TutorialProvider>
            </CustomBGMProvider>
          </SEProvider>
        </BGMProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
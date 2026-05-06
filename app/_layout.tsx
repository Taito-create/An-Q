import { Slot } from 'expo-router';
import { ThemeProvider } from './theme';
import { SoundManager } from './sound';
import { BGMProvider } from './bgmContext';
import { CustomBGMProvider } from './customBGMContext';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordLogin } from './missions';
import MiniPlayer from './miniPlayer';

export default function RootLayout() {
  const [bgmReady, setBgmReady] = useState(false);

  useEffect(() => {
    // Initialize BGM when app starts
    const initializeBGM = async () => {
      try {
        await SoundManager.initialize();
        await SoundManager.initializeBGM();
        
        // Force BGM playback on app start
        console.log('Force starting BGM playback...');
        await SoundManager.playBGM();
        
        setBgmReady(true);
        console.log('BGM initialization completed');
      } catch (error) {
        console.error('BGM initialization failed:', error);
        setBgmReady(true); // Continue without BGM
      }
    };
    
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
    
    initializeBGM();
    migrateTimerKeys();
    recordLogin();
  }, []);

  return (
    <ThemeProvider>
      <BGMProvider>
        <CustomBGMProvider>
          <View style={{ flex: 1 }}>
            <MiniPlayer />
            <Slot />
          </View>
        </CustomBGMProvider>
      </BGMProvider>
    </ThemeProvider>
  );
}
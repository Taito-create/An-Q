import React, { ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ThemeProvider } from '../app/theme';
import { SoundManager } from '../app/sound';
import { BGMProvider } from '../app/bgmContext';
import { CustomBGMProvider } from '../app/customBGMContext';
import MiniPlayer from '../app/miniPlayer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordLogin } from '../app/missions';
import { useLocation } from 'react-router-dom';

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const [bgmReady, setBgmReady] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const initializeBGM = async () => {
      try {
        await SoundManager.initialize();
        await SoundManager.initializeBGM();
        console.log('Force starting BGM playback...');
        await SoundManager.playBGM();
        setBgmReady(true);
        console.log('BGM initialization completed');
      } catch (error) {
        console.error('BGM initialization failed:', error);
        setBgmReady(true);
      }
    };

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
            {children}
          </View>
        </CustomBGMProvider>
      </BGMProvider>
    </ThemeProvider>
  );
}
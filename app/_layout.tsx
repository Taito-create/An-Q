import { Outlet } from 'react-router-dom';
import { ThemeProvider, useTheme } from './theme';
import { SoundManager } from './sound';
import { BGMProvider } from './bgmContext';
import { CustomBGMProvider } from './customBGMContext';
import { QuestionsProvider } from './context/QuestionsContext';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordLogin } from './missions';
import MiniPlayer from './miniPlayer';

function RootLayoutInner() {
  const { colors, isCyberpunk } = useTheme();
  const [bgmReady, setBgmReady] = useState(false);

  useEffect(() => {
    // Initialize BGM when app starts (load only, no autoplay)
    const initializeBGM = async () => {
      try {
        await SoundManager.initialize();
        await SoundManager.initializeBGM();
        setBgmReady(true);
        console.log('SoundManager initialized');
      } catch (error) {
        console.error('SoundManager initialization failed:', error);
        setBgmReady(true);
      }
    };
    
    // ユーザーが初めてクリックした時にBGMを開始する
    const startBGMOnInteraction = () => {
      SoundManager.playBGM();
      document.removeEventListener('click', startBGMOnInteraction);
      document.removeEventListener('touchstart', startBGMOnInteraction);
    };
    document.addEventListener('click', startBGMOnInteraction);
    document.addEventListener('touchstart', startBGMOnInteraction);
    
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
    
    return () => {
      document.removeEventListener('click', startBGMOnInteraction);
      document.removeEventListener('touchstart', startBGMOnInteraction);
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <MiniPlayer />
      <Outlet />
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <BGMProvider>
        <CustomBGMProvider>
          <QuestionsProvider>
            <RootLayoutInner />
          </QuestionsProvider>
        </CustomBGMProvider>
      </BGMProvider>
    </ThemeProvider>
  );
}

import React, { ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import { ThemeProvider, useTheme } from '../app/theme';
import { SoundManager } from '../app/sound';
import { BGMProvider } from '../app/bgmContext';
import { SEProvider } from '../app/seContext';
import { CustomBGMProvider } from '../app/customBGMContext';
import { AuthProvider } from '../app/auth/AuthContext';
import { QuestionsProvider } from '../app/context/QuestionsContext';
import MiniPlayer from '../app/miniPlayer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordLogin } from '../app/missions';
import { useLocation } from 'react-router-dom';

function ThemedRoot({ children }: { children: ReactNode }) {
  const { colors } = useTheme();

  useEffect(() => {
    const apply = () => {
      document.body.style.setProperty('background-color', colors.background, 'important');
      document.documentElement.style.setProperty('background-color', colors.background, 'important');
      const root = document.getElementById('root');
      if (root) {
        root.style.setProperty('background-color', colors.background, 'important');
        root.style.setProperty('min-height', '100vh', 'important');
      }
    };
    apply();
    // React Native for Web が後からスタイルを注入する場合があるため、
    // 少し遅らせてもう一度適用する
    const t = setTimeout(apply, 100);
    return () => clearTimeout(t);
  }, [colors.background]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background } as any}>
      {children}
    </View>
  );
}

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  const [bgmReady, setBgmReady] = useState(false);
  const location = useLocation();

  // スクリーンタイム計測
  useEffect(() => {
    const sessionStart = Date.now();
    const interval = setInterval(async () => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000 / 60);
      if (elapsed > 0) {
        try {
          const today = new Date().toISOString().split('T')[0];
          const key = `screen_time_${today}`;
          const current = await AsyncStorage.getItem(key);
          const total = (current ? parseInt(current, 10) : 0) + 1;
          await AsyncStorage.setItem(key, total.toString());
          // 週間合計も更新
          const weekKey = 'weekly_screen_time_minutes';
          const weekTotal = await AsyncStorage.getItem(weekKey);
          const newWeekTotal = (weekTotal ? parseInt(weekTotal, 10) : 0) + 1;
          await AsyncStorage.setItem(weekKey, newWeekTotal.toString());
        } catch (e) {
          // silent
        }
      }
    }, 60000); // 1分ごとに+1分
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const initializeSettings = async () => {
      // BGMのデフォルト値を設定（まだ存在しない場合のみ）
      const bgmSetting = await AsyncStorage.getItem('bgm_enabled');
      if (bgmSetting === null) {
        await AsyncStorage.setItem('bgm_enabled', 'false');
      }
      
      // 効果音のデフォルト値を設定
      const seSetting = await AsyncStorage.getItem('se_enabled');
      if (seSetting === null) {
        await AsyncStorage.setItem('se_enabled', 'false');
      }
    };

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
    
    initializeSettings();
    initializeBGM();
    migrateTimerKeys();
    recordLogin();
  }, []);

  return (
    <ThemeProvider>
      <BGMProvider>
        <SEProvider>
          <CustomBGMProvider>
            <AuthProvider>
              <QuestionsProvider>
                <ThemedRoot>
                  <MiniPlayer />
                  {children}
                </ThemedRoot>
              </QuestionsProvider>
            </AuthProvider>
          </CustomBGMProvider>
        </SEProvider>
      </BGMProvider>
    </ThemeProvider>
  );
}
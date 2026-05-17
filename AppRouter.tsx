import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './app/theme';
import { BGMProvider } from './app/bgmContext';
import { SEProvider } from './app/seContext';
import { CustomBGMProvider } from './app/customBGMContext';
import { TutorialProvider } from './app/tutorial/tutorialContext';
import TutorialOverlay from './app/tutorial/TutorialOverlay';
import MiniPlayer from './app/miniPlayer';
import { Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './app/sound';

// Screen imports
import HomeScreen from './app/index';
import QuizScreen from './app/quiz';
import TitleScreen from './app/title';
import SettingsScreen from './app/settings';
import BrowseScreen from './app/browse';
import CalendarScreen from './app/calendar';
import CreateScreen from './app/create';
import CreditsScreen from './app/credits';
import FeedbackScreen from './app/feedback';
import ManageScreen from './app/manage';
import MissionScreen from './app/mission';
import MusicScreen from './app/music';
import ResultsScreen from './app/results';
import ShopScreen from './app/shop';
import DevModeScreen from './app/devmode';
import AppSettingsScreen from './app/appSettings';
import MissionScreenComponent from './app/missionScreen';

function AppInitializer({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      // GitHub Pages ハッシュルーティング対応（Webプラットフォームのみ）
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const base = '/An-Q';
        const pathname = window.location.pathname;
        const hash = window.location.hash;

        // ハッシュがなく、ルートパスでない場合はハッシュルーティングに変換
        if (!hash && pathname !== base && pathname !== base + '/') {
          const subPath = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
          if (subPath.startsWith('/')) {
            const newPath = base + '/#/' + subPath.slice(1);
            window.history.replaceState(null, '', newPath);
          }
        }
      }

      // Initialize sounds (without playing BGM yet)
      try {
        await SoundManager.initialize();
        if (typeof (SoundManager as any).initializeBGM === 'function') {
          await (SoundManager as any).initializeBGM();
        }
        console.log('BGM initialization completed');
      } catch (error) {
        console.error('BGM initialization failed:', error);
      }

      // Play BGM on first user interaction
      const handleFirstInteraction = async () => {
        try {
          if (typeof (SoundManager as any).playBGM === 'function') {
            await (SoundManager as any).playBGM();
          }
        } catch (error) {
          console.error('BGM play on interaction failed:', error);
        }
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

      setIsLoading(false);
    };

    initialize();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function AppRouter() {
  return (
    <HashRouter basename="/An-Q">
      <AppInitializer>
        <ThemeProvider>
          <BGMProvider>
            <SEProvider>
              <CustomBGMProvider>
                <TutorialProvider>
                  <Routes>
                    <Route path="/" element={<HomeScreen />} />
                    <Route path="/index" element={<Navigate to="/" replace />} />
                    <Route path="/quiz" element={<QuizScreen />} />
                    <Route path="/title" element={<TitleScreen />} />
                    <Route path="/settings" element={<SettingsScreen />} />
                    <Route path="/browse" element={<BrowseScreen />} />
                    <Route path="/calendar" element={<CalendarScreen />} />
                    <Route path="/create" element={<CreateScreen />} />
                    <Route path="/credits" element={<CreditsScreen />} />
                    <Route path="/feedback" element={<FeedbackScreen />} />
                    <Route path="/manage" element={<ManageScreen />} />
                    <Route path="/mission" element={<MissionScreen />} />
                    <Route path="/music" element={<MusicScreen />} />
                    <Route path="/results" element={<ResultsScreen />} />
                    <Route path="/shop" element={<ShopScreen />} />
                    <Route path="/devmode" element={<DevModeScreen />} />
                    <Route path="/appSettings" element={<AppSettingsScreen />} />
                    <Route path="/missionScreen" element={<MissionScreenComponent />} />
                    
                    {/* 404 fallback */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  <MiniPlayer />
                  <TutorialOverlay />
                </TutorialProvider>
              </CustomBGMProvider>
            </SEProvider>
          </BGMProvider>
        </ThemeProvider>
      </AppInitializer>
    </HashRouter>
  );
}

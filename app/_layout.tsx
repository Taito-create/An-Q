import { Outlet } from 'react-router-dom';
import { ThemeProvider, useTheme } from './theme';
import { SoundManager } from './sound';
import { BGMProvider } from './bgmContext';
import { CustomBGMProvider } from './customBGMContext';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordLogin } from './missions';
import MiniPlayer from './miniPlayer';
import { STORAGE_KEYS } from './constants/storageKeys';
import { useExternalAudioDetector, useAdaptiveSoundVolume } from './externalAudioDetector';

/**
 * 外部音楽検知ブリッジ（設定で ON のときのみマウントされる）。
 * 検知フック自体がマウント時にマイク許可を求めるため、
 * OFF 時はこのコンポーネントごと描画しないことで許可ダイアログを出さない。
 */
function ExternalAudioBridge() {
  const externalAudio = useExternalAudioDetector();
  const { soundMultiplier } = useAdaptiveSoundVolume(externalAudio.isPlaying, externalAudio.detectedApp);

  useEffect(() => {
    SoundManager.setGlobalVolumeMultiplier(soundMultiplier);
  }, [soundMultiplier]);

  return null;
}

function RootLayoutInner() {
  const { colors, isCyberpunk } = useTheme();
  const [bgmReady, setBgmReady] = useState(false);
  // 外部音楽検知の ON/OFF（デフォルト OFF。マイク許可が必要なため）
  const [externalAudioDetectionEnabled, setExternalAudioDetectionEnabled] = useState(false);

  // 設定画面でトグルされた値を反映するため、マウント時とフォーカス復帰時に読み直す
  useEffect(() => {
    let cancelled = false;
    const loadFlag = async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEYS.EXTERNAL_AUDIO_DETECTION_ENABLED);
        if (!cancelled) setExternalAudioDetectionEnabled(v === 'true');
      } catch (e) {
        console.warn('Failed to load external audio detection flag:', e);
      }
    };
    loadFlag();
    const onFocus = () => { loadFlag(); };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    // Initialize BGM when app starts (load only, no autoplay)
    const initializeBGM = async () => {
      try {
        await SoundManager.initialize();
        await SoundManager.initializeBGM();
        setBgmReady(true);
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
      {externalAudioDetectionEnabled && <ExternalAudioBridge />}
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
          <RootLayoutInner />
        </CustomBGMProvider>
      </BGMProvider>
    </ThemeProvider>
  );
}

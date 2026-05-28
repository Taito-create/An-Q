import React, { createContext, useContext, useState, useEffect } from 'react';
import { SoundManager, BGMType } from './sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface BGMContextType {
  bgmEnabled: boolean;
  toggleBGM: (enabled: boolean) => Promise<void>;
  refreshBGM: () => Promise<void>;
  currentBGM: string;
}

const BGMContext = createContext<BGMContextType | undefined>(undefined);

export const useBGM = () => {
  const context = useContext(BGMContext);
  if (!context) {
    throw new Error('useBGM must be used within a BGMProvider');
  }
  return context;
};

export const BGMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bgmEnabled, setBgmEnabled] = useState(false);
  const [currentBGM, setCurrentBGM] = useState('BGM1');

  // BGM設定を読み込む関数
  const refreshBGM = async () => {
    try {
      const saved = await AsyncStorage.getItem('bgm_enabled');
      const enabled = saved === 'true';
      setBgmEnabled(enabled);
      console.log('BGM refreshed:', enabled);
    } catch (error) {
      console.error('Failed to refresh BGM:', error);
    }
  };

  // 初期読み込み
  useEffect(() => {
    refreshBGM();

    // ストレージ変更を監視
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'bgm_enabled') {
        const enabled = e.newValue === 'true';
        setBgmEnabled(enabled);
        console.log('BGM changed via storage:', enabled);
      }
    };

    // 他の画面からの変更を監視
    const handleCustomEvent = (e: CustomEvent) => {
      const { enabled } = e.detail;
      setBgmEnabled(enabled);
      console.log('BGM changed via event:', enabled);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('bgmStateChanged', handleCustomEvent as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('bgmStateChanged', handleCustomEvent as EventListener);
      }
    };
  }, []);

  const toggleBGM = async (enabled: boolean) => {
    console.log('toggleBGM called:', enabled);
    setBgmEnabled(enabled);
    
    // BGMのON/OFFを実際に切り替える
    const currentPreset = currentBGM || 'BGM1';
    if (enabled) {
      await SoundManager.updateBGMSetting(true, currentPreset as any);
      await SoundManager.playBGM();
    } else {
      await SoundManager.updateBGMSetting(false);
      await SoundManager.pauseBGM();
    }
    
    await AsyncStorage.setItem('bgm_enabled', enabled ? 'true' : 'false');
    
    // グローバルイベントを発火
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bgmStateChanged', { detail: { enabled } }));
    }
  };

  return (
    <BGMContext.Provider value={{ bgmEnabled, toggleBGM, refreshBGM, currentBGM }}>
      {children}
    </BGMContext.Provider>
  );
};
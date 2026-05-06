import React, { createContext, useContext, useState, useEffect } from 'react';
import { SoundManager, BGMType } from './sound';

interface BGMContextType {
  bgmEnabled: boolean;
  currentBGM: BGMType;
  toggleBGM: (enabled: boolean) => Promise<void>;
  updateBGM: (enabled: boolean, bgmType?: BGMType) => Promise<void>;
  isPlaying: boolean;
  bgmRate: number;
  setBGMRate: (rate: number) => Promise<void>;
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
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [currentBGM, setCurrentBGM] = useState<BGMType>('bgm');
  const [isPlaying, setIsPlaying] = useState(false);
  const [bgmRate, setBgmRateState] = useState(1.0);

  // Initialize BGM settings
  useEffect(() => {
    const initializeBGM = async () => {
      try {
        const bgmSettings = await SoundManager.getBGMSettings();
        setBgmEnabled(bgmSettings.enabled);
        setCurrentBGM(bgmSettings.currentBGM as BGMType);
        setIsPlaying(bgmSettings.enabled);
      } catch (error) {
        console.error('Failed to initialize BGM context:', error);
      }
    };
    initializeBGM();

    // カスタムBGMからBGM ON/OFFを制御できるようにコールバック登録
    if (typeof window !== 'undefined') {
      (window as any).__setBGMEnabled = (enabled: boolean) => {
        setBgmEnabled(enabled);
        setIsPlaying(enabled);
      };
      // SoundManagerも含めて完全にOFFにするコールバック
      (window as any).__bgmToggleOff = async () => {
        setBgmEnabled(false);
        setIsPlaying(false);
        await SoundManager.updateBGMSetting(false, undefined);
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__setBGMEnabled;
        delete (window as any).__bgmToggleOff;
      }
    };
  }, []);

  // Listen for BGM status changes
  useEffect(() => {
    const interval = setInterval(() => {
      const status = SoundManager.getBGMStatus();
      setIsPlaying(status.isPlaying);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const toggleBGM = async (enabled: boolean) => {
    try {
      setBgmEnabled(enabled);
      if (enabled) {
        // BGMをONにする際、カスタムBGMが再生中なら停止する
        if (typeof window !== 'undefined' && (window as any).__customBGMPlaying) {
          // カスタムBGM停止のイベントを発火
          (window as any).__stopCustomBGM?.();
          (window as any).__customBGMPlaying = false;
        }
        await SoundManager.updateBGMSetting(true, currentBGM);
      } else {
        await SoundManager.updateBGMSetting(false, currentBGM);
      }
      setIsPlaying(enabled);
    } catch (error) {
      console.error('Failed to toggle BGM:', error);
    }
  };

  const updateBGM = async (enabled: boolean, bgmType?: BGMType) => {
    try {
      setBgmEnabled(enabled);
      if (bgmType) {
        setCurrentBGM(bgmType);
      }
      await SoundManager.updateBGMSetting(enabled, bgmType || currentBGM);
      setIsPlaying(enabled);
    } catch (error) {
      console.error('Failed to update BGM:', error);
    }
  };

  const setBGMRate = async (rate: number) => {
    setBgmRateState(rate);
    await SoundManager.setBGMRate(rate);
  };

  const value: BGMContextType = {
    bgmEnabled,
    currentBGM,
    toggleBGM,
    updateBGM,
    isPlaying,
    bgmRate,
    setBGMRate,
  };

  return <BGMContext.Provider value={value}>{children}</BGMContext.Provider>;
};

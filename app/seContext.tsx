import React, { createContext, useContext, useState, useEffect } from 'react';
import { SoundManager } from './sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SEContextType {
  seEnabled: boolean;
  toggleSE: (enabled: boolean) => Promise<void>;
  refreshSE: () => Promise<void>;
}

const SEContext = createContext<SEContextType | undefined>(undefined);

export const useSE = () => {
  const context = useContext(SEContext);
  if (!context) {
    throw new Error('useSE must be used within a SEProvider');
  }
  return context;
};

export const SEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [seEnabled, setSeEnabled] = useState(false);

  // 効果音設定を読み込む関数
  const refreshSE = async () => {
    try {
      const saved = await AsyncStorage.getItem('se_enabled');
      const enabled = saved === 'true';
      setSeEnabled(enabled);
      await SoundManager.setSEEnabled(enabled);
      console.log('SE refreshed:', enabled);
    } catch (error) {
      console.error('Failed to refresh SE:', error);
    }
  };

  // 初期読み込み
  useEffect(() => {
    refreshSE();

    // ストレージ変更を監視（別タブなどでの変更に対応）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'se_enabled') {
        const enabled = e.newValue === 'true';
        setSeEnabled(enabled);
        SoundManager.setSEEnabled(enabled);
        console.log('SE changed via storage:', enabled);
      }
    };

    // 他の画面からの変更を監視
    const handleCustomEvent = (e: CustomEvent) => {
      const { enabled } = e.detail;
      setSeEnabled(enabled);
      SoundManager.setSEEnabled(enabled);
      console.log('SE changed via event:', enabled);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('seStateChanged', handleCustomEvent as EventListener);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('seStateChanged', handleCustomEvent as EventListener);
      }
    };
  }, []);

  const toggleSE = async (enabled: boolean) => {
    console.log('toggleSE called:', enabled);
    setSeEnabled(enabled);
    await SoundManager.setSEEnabled(enabled);
    await AsyncStorage.setItem('se_enabled', enabled ? 'true' : 'false');
    
    // グローバルイベントを発火
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('seStateChanged', { detail: { enabled } }));
    }
  };

  return (
    <SEContext.Provider value={{ seEnabled, toggleSE, refreshSE }}>
      {children}
    </SEContext.Provider>
  );
};
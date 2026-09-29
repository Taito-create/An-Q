import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SoundManager, BGMType, BGM_SETTINGS_KEY, LEGACY_BGM_ENABLED_KEY } from './sound';

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
  // ※ 保存先は SoundManager が扱う localStorage の `bgm_settings` に統一。
  //   旧キー `bgm_enabled` しか無い場合は SoundManager 側で移行される。
  const refreshBGM = useCallback(async () => {
    try {
      const settings = await SoundManager.getBGMSettings();
      setBgmEnabled(settings.enabled);
      setCurrentBGM(settings.currentBGM || 'BGM1');
    } catch (error) {
      console.error('Failed to refresh BGM:', error);
    }
  }, []);

  // 初期読み込み
  useEffect(() => {
    refreshBGM();

    // ストレージ変更を監視（別タブなどでの変更に対応）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === BGM_SETTINGS_KEY || e.key === LEGACY_BGM_ENABLED_KEY) {
        refreshBGM();
      }
    };

    // 他の画面からの変更を監視
    const handleCustomEvent = (e: CustomEvent) => {
      const { enabled } = (e.detail || {}) as { enabled?: boolean };
      if (typeof enabled === 'boolean') setBgmEnabled(enabled);
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
  }, [refreshBGM]);

  const toggleBGM = async (enabled: boolean) => {
    // 楽観更新（スイッチの即時反映）
    setBgmEnabled(enabled);

    try {
      // 保存も再生/停止も SoundManager 経由（キーを bgm_settings に統一）
      const settings = await SoundManager.getBGMSettings();
      const preset = (settings.currentBGM as BGMType) || 'BGM1';
      // ON にするときだけプリセットを読み込み直す（OFF 時は音源を作らない）
      await SoundManager.updateBGMSetting(enabled, enabled ? preset : undefined);
    } catch (error) {
      console.error('Failed to toggle BGM:', error);
    } finally {
      // 実際の状態を SoundManager から確定させる
      const status = SoundManager.getBGMStatus();
      setBgmEnabled(status.enabled);
      setCurrentBGM(status.currentBGM);

      // グローバルイベントを発火
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bgmStateChanged', { detail: { enabled: status.enabled } }));
      }
    }
  };

  return (
    <BGMContext.Provider value={{ bgmEnabled, toggleBGM, refreshBGM, currentBGM }}>
      {children}
    </BGMContext.Provider>
  );
};

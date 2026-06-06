import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 後方互換性のため、useLocale は locale の文字列を直接返す
export const useLocale = (): 'ja' | 'en' => {
  const [locale, setLocale] = useState<'ja' | 'en'>('ja');

  useEffect(() => {
    loadLocale();

    // AsyncStorage の変更を監視（リアルタイム）
    const interval = setInterval(() => {
      loadLocale();
    }, 100);  // 100ms ごとにチェック

    return () => clearInterval(interval);
  }, []);

  const loadLocale = async () => {
    try {
      const saved = await AsyncStorage.getItem('user_language');
      const newLocale = (saved as 'ja' | 'en') || 'ja';
      setLocale(newLocale);
    } catch (error) {
      console.error('Failed to load locale:', error);
    }
  };

  return locale;
};

// 言語を設定するためのヘルパー関数
export const setUserLanguage = async (lang: 'ja' | 'en') => {
  await AsyncStorage.setItem('user_language', lang);
};

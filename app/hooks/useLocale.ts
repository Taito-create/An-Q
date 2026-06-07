import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useLocale() {
  const [locale, setLocale] = useState<'ja' | 'en'>('ja');

  useEffect(() => {
    // 初期読み込み
    const loadLocale = async () => {
      try {
        const saved = await AsyncStorage.getItem('user_language');
        if (saved === 'ja' || saved === 'en') {
          setLocale(saved);
        } else {
          setLocale('ja');
        }
      } catch (error) {
        console.error('Failed to load locale:', error);
        setLocale('ja');
      }
    };

    loadLocale();

    // ✅ AsyncStorage の変更をリアルタイムで監視（重要）
    const checkLocaleChange = setInterval(async () => {
      try {
        const saved = await AsyncStorage.getItem('user_language');
        if (saved === 'ja' || saved === 'en') {
          setLocale(saved);
        }
      } catch (error) {
        console.error('Failed to check locale:', error);
      }
    }, 100);  // 100ms ごとにチェック

    return () => clearInterval(checkLocaleChange);
  }, []);

  return locale;
}

// 言語を設定するためのヘルパー関数
export const setUserLanguage = async (lang: 'ja' | 'en') => {
  await AsyncStorage.setItem('user_language', lang);
};

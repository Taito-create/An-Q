import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useLocale() {
  const [locale, setLocale] = useState<'ja' | 'en'>('ja');

  useEffect(() => {
    const loadLocale = async () => {
      const saved = await AsyncStorage.getItem('user_language');
      if (saved === 'ja' || saved === 'en') {
        setLocale(saved);
      }
    };
    loadLocale();
  }, []);

  return locale;
}
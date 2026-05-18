import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language } from '../translations';

export function useLocale(): Language {
  const [locale, setLocale] = useState<Language>('ja');
  
  useEffect(() => {
    AsyncStorage.getItem('user_language').then(lang => {
      if (lang === 'ja' || lang === 'en') {
        setLocale(lang);
      }
    });
  }, []);
  
  return locale;
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { SoundManager } from './sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SEContextType {
  seEnabled: boolean;
  toggleSE: (enabled: boolean) => Promise<void>;
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
  const [seEnabled, setSeEnabled] = useState(true);

  // Initialize SE settings
  useEffect(() => {
    const loadSESettings = async () => {
      try {
        const saved = await AsyncStorage.getItem('se_enabled');
        if (saved !== null) {
          setSeEnabled(saved !== 'false');
        }
      } catch (error) {
        console.error('Failed to load SE settings:', error);
      }
    };
    loadSESettings();
  }, []);

  const toggleSE = async (enabled: boolean) => {
    setSeEnabled(enabled);
    try {
      await AsyncStorage.setItem('se_enabled', enabled ? 'true' : 'false');
      // SoundManager.setSEEnabled is not available, SE is controlled by individual play calls
    } catch (error) {
      console.error('Failed to save SE settings:', error);
    }
  };

  return (
    <SEContext.Provider value={{ seEnabled, toggleSE }}>
      {children}
    </SEContext.Provider>
  );
};

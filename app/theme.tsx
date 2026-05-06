import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Theme color presets
const themePresets = {
  blue: {
    name: 'Blue',
    primary: '#007AFF',
    secondary: '#5AC8FA',
    background: '#F8F9FA',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#E0E0E0',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  green: {
    name: 'Green',
    primary: '#4CAF50',
    secondary: '#8BC34A',
    background: '#F1F8E9',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#C8E6C9',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  orange: {
    name: 'Orange',
    primary: '#FF9500',
    secondary: '#FFCC02',
    background: '#FFF8F0',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#FFE0B2',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  pink: {
    name: 'Pink',
    primary: '#FF69B4',
    secondary: '#FFB6C1',
    background: '#FFF0F5',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#FFB6C1',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  sakura: {
    name: 'Sakura',
    primary: '#E91E63',
    secondary: '#F48FB1',
    background: '#FFF5F7',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#F8BBD0',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  purple: {
    name: 'Purple',
    primary: '#9C27B0',
    secondary: '#BA68C8',
    background: '#F3E5F5',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#E1BEE7',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  red: {
    name: 'Red',
    primary: '#FF3B30',
    secondary: '#FF6B6B',
    background: '#FFF5F5',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#666666',
    border: '#FFCDD2',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  },
  dark: {
    name: 'Dark',
    primary: '#BB86FC',
    secondary: '#03DAC6',
    background: '#121212',
    card: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#AAAAAA',
    border: '#333333',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#CF6679',
  },
};

export type ThemeName = keyof typeof themePresets;
export type ThemeColors = typeof themePresets.blue;

export type FontSize = 'small' | 'medium' | 'large';
export type PatternType = 'none' | 'dots' | 'stripes' | 'grid' | 'waves' | 'diamonds';

export const fontSizeScale: Record<FontSize, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
};

interface ThemeContextType {
  currentTheme: ThemeName | 'custom';
  colors: ThemeColors;
  setTheme: (theme: ThemeName) => void;
  setCustomColor: (hex: string) => void;
  availableThemes: ThemeName[];
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  scale: number;
  customColor: string | null;
  pattern: PatternType;
  setPattern: (p: PatternType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  const fs = (base: number) => Math.round(base * context.scale);
  // プライマリカラーの上に乗せるテキスト色（明るい色→黒、暗い色→白）
  const lum = getLuminance(context.colors.primary);
  const onPrimary = lum > 150 ? '#1A1A1A' : '#FFFFFF';
  return { ...context, fs, onPrimary };
};

// HEXから明度を計算（0=暗い, 255=明るい）
function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// カスタムカラーからテーマを生成する
function buildCustomTheme(hex: string): ThemeColors {
  const lum = getLuminance(hex);
  const isDark = lum < 60;
  const isLight = lum > 180;

  // 背景・カード・テキストを明度に応じて調整
  const background = isDark ? '#1A1A2E' : isLight ? '#F0F0F0' : '#F8F9FA';
  const card = isDark ? '#2A2A3E' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#1A1A1A';
  const textSecondary = isDark ? '#AAAAAA' : '#666666';
  const border = isDark ? hex + '60' : hex + '40';

  return {
    name: 'Custom',
    primary: hex,
    secondary: hex + 'AA',
    background,
    card,
    text,
    textSecondary,
    border,
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  };
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('blue');
  const [customColor, setCustomColorState] = useState<string | null>(null);
  const [fontSize, setFontSizeState] = useState<FontSize>('medium');
  const [pattern, setPatternState] = useState<PatternType>('none');
  const [isLoading, setIsLoading] = useState(true);

  const colors = customColor ? buildCustomTheme(customColor) : themePresets[currentTheme];
  const availableThemes = Object.keys(themePresets) as ThemeName[];
  const scale = fontSizeScale[fontSize];

  const setTheme = async (theme: ThemeName) => {
    try {
      await AsyncStorage.setItem('selectedTheme', theme);
      await AsyncStorage.removeItem('customColor');
      setCurrentTheme(theme);
      setCustomColorState(null);
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  };

  const setCustomColor = async (hex: string) => {
    try {
      await AsyncStorage.setItem('customColor', hex);
      setCustomColorState(hex);
    } catch (error) {
      console.error('Failed to save custom color:', error);
    }
  };

  const setPattern = async (p: PatternType) => {
    try {
      await AsyncStorage.setItem('pattern', p);
      setPatternState(p);
    } catch (error) {
      console.error('Failed to save pattern:', error);
    }
  };

  const setFontSize = async (size: FontSize) => {
    try {
      await AsyncStorage.setItem('fontSize', size);
      setFontSizeState(size);
    } catch (error) {
      console.error('Failed to save font size:', error);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedCustom = await AsyncStorage.getItem('customColor');
        if (savedCustom) {
          setCustomColorState(savedCustom);
        } else {
          const savedTheme = await AsyncStorage.getItem('selectedTheme');
          if (savedTheme && Object.keys(themePresets).includes(savedTheme)) {
            setCurrentTheme(savedTheme as ThemeName);
          }
        }
        const savedFont = await AsyncStorage.getItem('fontSize');
        if (savedFont === 'small' || savedFont === 'medium' || savedFont === 'large') {
          setFontSizeState(savedFont);
        }
        const savedPattern = await AsyncStorage.getItem('pattern');
        if (savedPattern) setPatternState(savedPattern as PatternType);
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  if (isLoading) return null;

  return (
    <ThemeContext.Provider value={{ currentTheme: customColor ? 'custom' : currentTheme, colors, setTheme, setCustomColor, availableThemes, fontSize, setFontSize, scale, customColor, pattern, setPattern }}>
      {children}
    </ThemeContext.Provider>
  );
};

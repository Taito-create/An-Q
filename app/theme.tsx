import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Theme color presets
const themePresets = {
  blue: {
    name: 'Blue',
    primary: '#2563EB',
    secondary: '#60A5FA',
    background: '#F8FAFC',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  green: {
    name: 'Green',
    primary: '#16A34A',
    secondary: '#86EFAC',
    background: '#F7FAF7',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  orange: {
    name: 'Orange',
    primary: '#EA580C',
    secondary: '#FDBA74',
    background: '#FFFAF5',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  pink: {
    name: 'Pink',
    primary: '#DB2777',
    secondary: '#F9A8D4',
    background: '#FFF7FB',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  sakura: {
    name: 'Sakura',
    primary: '#E11D48',
    secondary: '#FDA4AF',
    background: '#FFF7F8',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  purple: {
    name: 'Purple',
    primary: '#7C3AED',
    secondary: '#C084FC',
    background: '#FAF7FF',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  red: {
    name: 'Red',
    primary: '#DC2626',
    secondary: '#F87171',
    background: '#FFF7F7',
    card: '#FFFFFF',
    text: '#1A1A1A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    success: '#4CAF50',
    warning: '#D97706',
    error: '#DC2626',
  },
  dark: {
    name: 'Dark',
    primary: '#60A5FA',
    secondary: '#93C5FD',
    background: '#0F172A',
    card: '#111827',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: '#334155',
    success: '#4CAF50',
    warning: '#F59E0B',
    error: '#F87171',
  },
  cyberpunk: {
    name: 'Cyberpunk',
    primary: '#00F0FF',
    secondary: '#FF00FF',
    background: '#0A0E1A',
    card: '#111827',
    text: '#E0E0E0',
    textSecondary: '#94A3B8',
    border: '#243042',
    success: '#00FF88',
    warning: '#FFB800',
    error: '#FF0055',
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
  isCyberpunk: boolean;
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
  const isCyberpunk = context.currentTheme === 'cyberpunk';
  return { ...context, fs, onPrimary, isCyberpunk };
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
  const textSecondary = isDark ? '#B6B6B6' : '#667085';
  const border = isDark ? hex + '55' : hex + '2E';

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
    <ThemeContext.Provider value={{ currentTheme: customColor ? 'custom' : currentTheme, colors, setTheme, setCustomColor, availableThemes, fontSize, setFontSize, scale, customColor, pattern, setPattern, isCyberpunk: currentTheme === 'cyberpunk' }}>
      {children}
    </ThemeContext.Provider>
  );
};

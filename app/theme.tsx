import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Theme color presets
// サイバーパンク・バリエーション（背景・カード・テキストは共通、primary のみ異なる）
const CYBER_BASE = {
  onPrimary: '#000000',
  secondary: '#58A6FF',
  background: '#0B0E14',
  card: '#161B22',
  text: '#E6EDF3',
  textSecondary: '#B0B8C0',
  border: '#4A5560',
  success: '#3FB950',
  warning: '#D29922',
  error: '#FF7B72',
} as const;

const themePresets = {
  cyan: {
    name: 'Cyan',
    ...CYBER_BASE,
    primary: '#00FFC8',
  },
  magenta: {
    name: 'Magenta',
    ...CYBER_BASE,
    primary: '#FF0080',
  },
  matrix: {
    name: 'Matrix',
    ...CYBER_BASE,
    primary: '#00FF41',
  },
  amber: {
    name: 'Amber',
    ...CYBER_BASE,
    primary: '#FFB000',
  },
  neonblue: {
    name: 'Neon Blue',
    ...CYBER_BASE,
    primary: '#58A6FF',
  },
  purple: {
    name: 'Purple',
    ...CYBER_BASE,
    primary: '#B794F6',
  },
  monochrome: {
    name: 'Monochrome',
    ...CYBER_BASE,
    primary: '#E6EDF3',
  },
};

export type ThemeName = keyof typeof themePresets;
export type ThemeColors = {
  name: string;
  primary: string;
  onPrimary: string;
  secondary: string;
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
};

export type FontSize = 'small' | 'medium' | 'large';
export type PatternType = 'none' | 'dots' | 'stripes' | 'grid' | 'waves' | 'diamonds';

// ─────────────────────────────────────────────
// 全画面共通デザイントークン（世界観統一）
// ─────────────────────────────────────────────
export const globalTokens = {
  background: '#0B0E14',
  card: '#161B22',
  border: '#4A5560',
  text: '#E6EDF3',
  textSecondary: '#B0B8C0',
  primary: '#00FFC8',
  onPrimary: '#000000',
  success: '#3FB950',
  warning: '#D29922',
  error: '#FF7B72',
  /** 全画面共通の角丸（鋭角化：Terminal/サイバー風） */
  borderRadius: 4,
  /** Typography スケール（P2：全画面共通のフォントサイズ段階） */
  typography: {
    heading: 20,     // 画面ヘッダー・大見出し
    subheading: 16,  // カードタイトル・セクション見出し
    body: 14,        // 本文
    caption: 12,     // 補足・キャプション
  },
} as const;

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
  // プライマリカラーの上に乗せるテキスト色
  // 各プリセットに定義した onPrimary を優先する。定義が無い場合は明度でフォールバック。
  const lum = getLuminance(context.colors.primary);
  const onPrimary = context.colors.onPrimary || (lum > 150 ? '#1A1A1A' : '#FFFFFF');
  const isCyberpunk = true; // 全7テーマがダーク系サイバーベースのため常にtrue
  // 全画面共通のボーダー半径（鋭角4px）
  const br = globalTokens.borderRadius;
  const typography = globalTokens.typography;
  return { ...context, fs, onPrimary, isCyberpunk, br, typography };
};

// HEXから明度を計算（0=暗い, 255=明るい）
function getLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// カスタムカラーからテーマを生成する（アクセントのみ変更・ダーク世界観を維持）
function buildCustomTheme(hex: string): ThemeColors {
  return {
    name: 'Custom',
    ...CYBER_BASE,
    primary: hex,
  };
}



export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>('cyan');
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
    <ThemeContext.Provider value={{ currentTheme: customColor ? 'custom' : currentTheme, colors, setTheme, setCustomColor, availableThemes, fontSize, setFontSize, scale, customColor, pattern, setPattern, isCyberpunk: true }}>
      {children}
    </ThemeContext.Provider>
  );
};

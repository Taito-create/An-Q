import { Platform, Dimensions } from 'react-native';

// デバイスの画面サイズを取得
const { width, height } = Dimensions.get('window');

// レスポンシブデザイン用のユーティリティ
export const responsive = {
  // 画面サイズに基づくブレークポイント
  breakpoints: {
    small: width < 375,    // iPhone SE
    medium: width < 768,   // タブレット
    large: width >= 768,    // デスクトップ
  },

  // フォントサイズ
  fontSize: {
    title: Platform.OS === 'web' ? 32 : width < 375 ? 24 : 28,
    subtitle: Platform.OS === 'web' ? 16 : width < 375 ? 12 : 14,
    body: Platform.OS === 'web' ? 16 : width < 375 ? 14 : 15,
    button: Platform.OS === 'web' ? 18 : width < 375 ? 16 : 17,
    caption: Platform.OS === 'web' ? 12 : width < 375 ? 10 : 11,
  },

  // パディング
  padding: {
    small: Platform.OS === 'web' ? 20 : width < 375 ? 12 : 16,
    medium: Platform.OS === 'web' ? 30 : width < 375 ? 20 : 24,
    large: Platform.OS === 'web' ? 40 : width < 375 ? 30 : 32,
  },

  // マージン
  margin: {
    small: Platform.OS === 'web' ? 8 : width < 375 ? 6 : 8,
    medium: Platform.OS === 'web' ? 15 : width < 375 ? 12 : 15,
    large: Platform.OS === 'web' ? 20 : width < 375 ? 16 : 20,
  },

  // ボタンサイズ
  button: {
    height: Platform.OS === 'web' ? 56 : width < 375 ? 48 : 52,
    minWidth: Platform.OS === 'web' ? 120 : width < 375 ? 100 : 110,
  },

  // カードサイズ
  card: {
    width: Platform.OS === 'web' ? '47%' : width < 375 ? '48%' : '49%',
    padding: Platform.OS === 'web' ? 20 : width < 375 ? 16 : 18,
    minHeight: Platform.OS === 'web' ? 120 : width < 375 ? 100 : 110,
  },

  // アイコンサイズ
  icon: {
    small: Platform.OS === 'web' ? 16 : width < 375 ? 14 : 15,
    medium: Platform.OS === 'web' ? 24 : width < 375 ? 20 : 22,
    large: Platform.OS === 'web' ? 48 : width < 375 ? 40 : 44,
  },
};

// 画面の向きを取得
export const getOrientation = () => {
  return width > height ? 'landscape' : 'portrait';
};

// デバイスタイプを判定
export const getDeviceType = () => {
  if (Platform.OS === 'web') {
    return width >= 1024 ? 'desktop' : width >= 768 ? 'tablet' : 'mobile';
  }
  return 'mobile';
};

// レスポンシブ対応のスタイル生成ヘルパー
export const createResponsiveStyle = (baseStyle: any, overrides?: any) => {
  const deviceType = getDeviceType();
  
  return {
    ...baseStyle,
    ...(overrides?.mobile && deviceType === 'mobile' && overrides.mobile),
    ...(overrides?.tablet && deviceType === 'tablet' && overrides.tablet),
    ...(overrides?.desktop && deviceType === 'desktop' && overrides.desktop),
  };
};

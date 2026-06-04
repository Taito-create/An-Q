import { Animated } from 'react-native';

export type AnimationLevel = 'none' | 'lite' | 'standard' | 'rich';

export const animationConfigs: Record<AnimationLevel, {
  label: string;
  description: string;
  features: string[];
}> = {
  none: {
    label: 'なし',
    description: 'アニメーションなし',
    features: [],
  },
  lite: {
    label: 'ライト',
    description: 'シンプルで軽量',
    features: ['背景スクロール', 'フェードイン'],
  },
  standard: {
    label: 'スタンダード',
    description: 'バランスの取れた動き',
    features: ['ボタンShake', '背景スクロール', 'パルス'],
  },
  rich: {
    label: 'リッチ',
    description: '豊かで華やかな動き',
    features: ['Shake', 'スクロール', 'パルス', 'バウンス'],
  },
};

// 背景アニメーション速度(ms)
export const bgDurationMap: Record<AnimationLevel, number> = {
  none: 0,        // アニメーションなし
  lite: 15000,    // 15秒（やや速い）
  standard: 12000, // 12秒（既定）
  rich: 10000,     // 10秒（速い）
};

export const createShakeAnimation = (intensity: number = 1) => {
  const translateX = new Animated.Value(0);

  Animated.loop(
    Animated.sequence([
      Animated.timing(translateX, {
        toValue: 10 * intensity,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -10 * intensity,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]),
    { iterations: -1 }
  ).start();

  return { transform: [{ translateX }] };
};

export const createBounceAnimation = () => {
  const scaleAnim = new Animated.Value(1);

  Animated.loop(
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.15,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]),
    { iterations: -1 }
  ).start();

  return { transform: [{ scale: scaleAnim }] };
};

export const createPulseAnimation = (intensity: number = 1.05) => {
  const scaleAnim = new Animated.Value(1);

  Animated.loop(
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: intensity,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]),
    { iterations: -1 }
  ).start();

  return { transform: [{ scale: scaleAnim }] };
};
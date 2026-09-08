import React, { useEffect, useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme';

// ─────────────────────────────────────────────
// 全画面共通の押下フィードバック付きボタン（P1-4）
// - Pressable ベース（Android: リップル / 全環境: scale 0.96）
// - ハプティクス: Web は navigator.vibrate（expo-haptics の Web 実装と同等）
//   ※ 本プロジェクトは Vite + react-native-web 構成のためネイティブ依存を追加しない
// - TouchableOpacity と同じ props 互換（onPress / onLongPress / delayLongPress /
//   onPressIn / onPressOut / disabled / style）で機械的置換可能
// ─────────────────────────────────────────────

/** 押下ハプティクス（Web: navigator.vibrate / ネイティブ: Vibration API 相当） */
export const triggerHaptic = (pattern: number | number[] = 10) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* noop */
  }
};

export interface PressableButtonProps {
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children?: React.ReactNode;
  /** 押下時の縮小率（デフォルト 0.96） */
  pressScale?: number;
  /** 押下時にハプティクス（振動）を発火するか（デフォルト true） */
  haptic?: boolean;
  /** Android リップル色 */
  rippleColor?: string;
  /** 最小タップターゲット 44x44 を強制（アクセシビリティ：Apple HIG準拠）。小型トグル等は false で無効化 */
  minTouchTarget?: boolean;
  /** Web でのホバーツールチップ（title 属性） */
  title?: string;
}

const PressableButton = ({
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  delayLongPress,
  disabled,
  hitSlop,
  style,
  children,
  pressScale = 0.96,
  haptic = true,
  rippleColor = '#00FFC820',
  minTouchTarget = true,
  title,
}: PressableButtonProps) => {
  const { br } = useTheme();
  void br; // 将来の共通角丸適用フック（現在は呼び出し側スタイルを優先）

  // Web（react-native-web）向け tooltip：Pressable は title prop を持たないため
  // DOM ノードに直接 title 属性を設定する（ネイティブでは何もしない）
  const pressableRef = useRef<View>(null);
  useEffect(() => {
    if (!title) return;
    const node = pressableRef.current as unknown as HTMLElement | null;
    if (node && typeof node === 'object' && 'setAttribute' in node) {
      node.setAttribute('title', title);
    }
  }, [title]);

  return (
    <Pressable
      ref={pressableRef}
      onPress={onPress}
      onPressIn={() => {
        if (haptic) triggerHaptic(8);
        onPressIn?.();
      }}
      onPressOut={() => onPressOut?.()}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop as any}
      android_ripple={{ color: rippleColor, borderless: false }}
      style={(state) => {
        const base = typeof style === 'function' ? style({ pressed: state.pressed }) : style;
        const scale = state.pressed ? pressScale : 1;
        // 最小タップターゲット 44x44（P1：押し間違え防止）
        const touchTarget = minTouchTarget ? { minWidth: 44, minHeight: 44 } : null;
        return [{ transform: [{ scale }] } as ViewStyle, touchTarget, base];
      }}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  reset: {
    // Pressable は TouchableOpacity と異なりデフォルトスタイルを持たないため空定義
  },
});

export default PressableButton;

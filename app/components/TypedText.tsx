import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { useTypewriter } from '../hooks/useTypewriter';

interface Props {
  text: string;
  /** 1文字あたりの ms。デフォルト 40 */
  speed?: number;
  startDelay?: number;
  enabled?: boolean;
  /** 完了時に呼ばれる（例: SoundManager.play('complete')） */
  onComplete?: () => void;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/**
 * タイプライター表示コンポーネント。
 * TerminalLog / BootScreen と同じ monospace フォントで1文字ずつ表示する。
 */
export default function TypedText({
  text,
  speed = 40,
  startDelay = 0,
  enabled = true,
  onComplete,
  style,
  numberOfLines,
}: Props) {
  const { colors } = useTheme();
  const { displayed, done } = useTypewriter(text, { speed, startDelay, enabled });

  // 完了通知は text ごとに1回だけ発火させる
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    firedRef.current = false;
  }, [text]);
  React.useEffect(() => {
    if (done && !firedRef.current && onComplete) {
      firedRef.current = true;
      onComplete();
    }
  }, [done, onComplete]);

  return (
    <Text
      style={[{ fontFamily: 'monospace', color: colors.text }, style]}
      numberOfLines={numberOfLines}
    >
      {displayed}
    </Text>
  );
}
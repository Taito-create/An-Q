import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { useTheme } from '../theme';

// ─────────────────────────────────────────────
// ブートアニメーション（起動演出）
// >>> BOOT フェードイン（500ms）→ タイプライターで1行ずつ表示（各1秒）→ onComplete
// Home のレンダリングは親（RootLayout の BootGate）がオーバーレイで制御する
// ─────────────────────────────────────────────

const BOOT_LINES = [
  'LOAD KERNEL...',
  'LOAD MODULE: MEMORY...',
  'STATUS: ONLINE',
];
const FADE_IN_MS = 500;
const START_DELAY_MS = 700;
const LINE_INTERVAL_MS = 1000;
const DONE_DELAY_MS = 300;

interface BootScreenProps {
  /** 全行表示完了後に呼ばれる（親がフェードアウト→アンマウントする） */
  onComplete?: () => void;
}

export default function BootScreen({ onComplete }: BootScreenProps) {
  const { colors } = useTheme();
  const [lineCount, setLineCount] = useState(0);
  const bootOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // >>> BOOT フェードイン（500ms）
    Animated.timing(bootOpacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    const timers: ReturnType<typeof setTimeout>[] = [];
    // タイプライター表示（各1秒）
    BOOT_LINES.forEach((_line, i) => {
      timers.push(
        setTimeout(() => setLineCount(i + 1), START_DELAY_MS + i * LINE_INTERVAL_MS)
      );
    });
    // 完了通知
    timers.push(
      setTimeout(
        () => onComplete?.(),
        START_DELAY_MS + BOOT_LINES.length * LINE_INTERVAL_MS + DONE_DELAY_MS
      )
    );
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: colors.background, opacity: bootOpacity }]}
      pointerEvents="auto"
    >
      <Text style={[styles.bootText, { color: colors.primary }]}>{'>>> BOOT'}</Text>
      <View style={[styles.logBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {BOOT_LINES.slice(0, lineCount).map((line, idx) => (
          <Text key={idx} style={[styles.line, { color: colors.textSecondary }]}>
            {`$ ${line}`}
          </Text>
        ))}
        <Text style={[styles.cursor, { color: colors.primary }]}>█</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  bootText: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  logBox: {
    width: '80%',
    maxWidth: 420,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  line: {
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 22,
  },
  cursor: {
    fontSize: 14,
    fontFamily: 'monospace',
    lineHeight: 22,
  },
});

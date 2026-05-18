import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PatternType } from './theme';

interface Props {
  pattern: PatternType;
  color: string;
  children: React.ReactNode;
  style?: object;
}

// パターンごとの絵文字・記号タイル
const PATTERN_CHARS: Record<PatternType, string> = {
  none: '',
  dots: '·',
  stripes: '/',
  grid: '+',
  waves: '~',
  diamonds: '◇',
};

const PATTERN_SIZES: Record<PatternType, number> = {
  none: 0,
  dots: 18,
  stripes: 16,
  grid: 20,
  waves: 18,
  diamonds: 22,
};

export default function PatternBackground({ pattern, color, children, style }: Props) {
  if (pattern === 'none') {
    return <View style={[styles.container, style]}>{children}</View>;
  }

  const char = PATTERN_CHARS[pattern];
  const size = PATTERN_SIZES[pattern];
  const cols = 20;
  const rows = 40;
  const tiles = Array.from({ length: cols * rows });

  return (
    <View style={[styles.container, style]}>
      {/* Pattern overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.patternWrap}>
          {tiles.map((_, i) => (
            <Text
              key={i}
              style={{
                width: size,
                height: size,
                fontSize: size * 0.6,
                color: color + '25',
                textAlign: 'center',
                lineHeight: size,
              }}
            >
              {char}
            </Text>
          ))}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  patternWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
});

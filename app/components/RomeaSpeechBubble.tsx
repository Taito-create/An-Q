import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { IMAGES } from '../constants/images';

interface RomeaSpeechBubbleProps {
  message: string;
  romeaSize?: number;
  style?: object;
}

export default function RomeaSpeechBubble({
  message,
  romeaSize = 80,
  style,
}: RomeaSpeechBubbleProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      {/* 左：ロメア */}
      <Image
        source={IMAGES.romea}
        style={{ width: romeaSize, height: romeaSize, resizeMode: 'contain' }}
      />

      {/* 右：吹き出し（左側に三角のしっぽ） */}
      <View style={styles.bubbleWrapper}>
        {/* 三角のしっぽ（吹き出しの左辺中央付近を指す） */}
        <View
          style={[
            styles.tail,
            {
              borderRightColor: colors.primary,
              top: romeaSize * 0.35,
            },
          ]}
        />
        <View
          style={[
            styles.tailInner,
            {
              borderRightColor: colors.card,
              top: romeaSize * 0.35 + 2,
            },
          ]}
        />

        {/* 吹き出し本体 */}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: colors.card,
              borderColor: colors.primary,
              borderRadius: 8,
            },
          ]}
        >
          <Text
            style={[
              styles.message,
              { color: colors.text, fontFamily: 'monospace' },
            ]}
          >
            {message}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12,
    paddingHorizontal: 4,
  },
  bubbleWrapper: {
    flex: 1,
    marginLeft: 16, // 三角のしっぽ分の余白
    position: 'relative',
  },
  bubble: {
    padding: 14,
    borderWidth: 2,
    minHeight: 60,
    justifyContent: 'center',
  },
  tail: {
    position: 'absolute',
    left: -14,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderBottomWidth: 10,
    borderRightWidth: 14,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    zIndex: 1,
  },
  tailInner: {
    position: 'absolute',
    left: -11,
    width: 0,
    height: 0,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    zIndex: 2,
  },
  message: {
    fontSize: 13,
    lineHeight: 20,
  },
});


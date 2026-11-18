import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { SoundManager } from '../sound';

// ─────────────────────────────────────────────
// LevelUpOverlay: レベルアップ演出 (約2.5秒 / タップでスキップ可)
// - 暗い背景 + シアン系ネオン + 「LEVEL UP!」+ 大きなレベル数字
// - 拡大リング + 少数の光点 (外部ライブラリ・手描き画像なし)
// - 複数レベル上昇時は fromLevel → toLevel を表示
// ─────────────────────────────────────────────

const DURATION_MS = 2500;
const NEON_CYAN = '#22D3EE';

interface LevelUpOverlayProps {
  visible: boolean;
  fromLevel: number;
  toLevel: number;
  onDone: () => void;
}

export default function LevelUpOverlay({ visible, fromLevel, toLevel, onDone }: LevelUpOverlayProps) {
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(0.6)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const dots = useRef(
    [0, 1, 2, 3, 4, 5].map((i) => ({
      drift: new Animated.Value(0),
      phase: (i * Math.PI * 2) / 6,
    }))
  ).current;
  const doneRef = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const anims = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (!visible) return;
    doneRef.current = false;
    SoundManager.play('correct');

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone();
    };

    const titleAnim = Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.12,
        duration: 320,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 280,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
    const glowAnim = Animated.timing(glow, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    const ringAnim = Animated.timing(ring, {
      toValue: 1,
      duration: 1600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    const dotAnims = dots.map((d) =>
      Animated.timing(d.drift, {
        toValue: 1,
        duration: 2000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    anims.current = [titleAnim, glowAnim, ringAnim, ...dotAnims];
    titleAnim.start();
    glowAnim.start();
    ringAnim.start();
    dotAnims.forEach((a) => a.start());

    timers.current.push(setTimeout(finish, DURATION_MS));

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      anims.current.forEach((a) => a.stop());
      anims.current = [];
      scale.setValue(0.6);
      glow.setValue(0);
      ring.setValue(0);
      dots.forEach((d) => d.drift.setValue(0));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const levelLabel = toLevel > fromLevel ? `Lv.${fromLevel} → Lv.${toLevel}` : `Lv.${toLevel}`;

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.2] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.5, 0] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.85] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="レベルアップ演出をスキップ"
      onPress={() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onDone();
      }}
      style={styles.overlay}
    >
      <View style={styles.center} pointerEvents="none">
        {/* 拡大リング */}
        <Animated.View
          style={[
            styles.ring,
            {
              borderColor: NEON_CYAN,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
        {/* 少数の光点 */}
        {dots.map((d, i) => {
          const dx = Math.cos(d.phase);
          const dy = Math.sin(d.phase);
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i % 2 === 0 ? NEON_CYAN : '#A5F3FC',
                  opacity: glowOpacity,
                  transform: [
                    { translateX: Animated.multiply(d.drift, dx * 90) },
                    { translateY: Animated.multiply(d.drift, dy * 70) },
                    { scale: d.drift.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                },
              ]}
            />
          );
        })}
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>
          <Text style={[styles.title, { color: NEON_CYAN }]}>LEVEL UP!</Text>
          <Text style={[styles.level, { color: colors.text }]}>{levelLabel}</Text>
          <Animated.Text style={[styles.hint, { color: colors.textSecondary, opacity: glowOpacity }]}>
            タップでスキップ
          </Animated.Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(2, 6, 16, 0.88)',
    zIndex: 9999,
    elevation: 20,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
  },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    textShadowColor: 'rgba(34, 211, 238, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  level: {
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
  },
  hint: {
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
});
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';

interface Props {
  variant?: 'load1' | 'load2' | 'load3' | 'load4';
  onRetry?: () => void;
  error?: string | null;
}

export default function LoadingScreen({ variant = 'load3', onRetry, error }: Props) {
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDotCount(d => (d + 1) % 4), 500);
    return () => clearInterval(id);
  }, []);

  const dots = '.'.repeat(dotCount);
  const loadingText = locale === 'ja' ? `読み込み中${dots}` : `Now Loading${dots}`;
  
  const errorText = error || (locale === 'ja' ? '通信環境が良い場所で再度お試しください' : 'Please try again in a better network environment');
  const retryText = locale === 'ja' ? '再試行' : 'Retry';

  // 8つのドットを生成（角度とサイズを計算）
  const dotsArray = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 360;
    const size = 6 + (i / 7) * 10; // 6px から 16px まで線形に変化
    return { angle, size };
  });

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      {/* スピナー */}
      <View style={styles.spinnerWrap}>
        <div className="spinner-ring">
          {dotsArray.map((dot, i) => {
            const radian = (dot.angle * Math.PI) / 180;
            const radius = 44;
            const x = 60 + radius * Math.cos(radian) - dot.size / 2;
            const y = 60 + radius * Math.sin(radian) - dot.size / 2;
            return (
              <div
                key={i}
                className="spinner-dot"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  width: `${dot.size}px`,
                  height: `${dot.size}px`,
                  background: colors.primary,
                }}
              />
            );
          })}
        </div>
      </View>

      {/* 右下Qくん */}
      <View style={styles.qArea}>
        <View style={[styles.bubble, { backgroundColor: colors.primary }]}>
          <Text style={[styles.bubbleText, { color: onPrimary }]}>
            {error ? errorText : loadingText}
          </Text>
        </View>
        <img src={`/${variant}.webp`} alt="Loading character" width={100} height={100} style={{ objectFit: 'contain' }} />
        
        {/* エラー時の再試行ボタン */}
        {error && onRetry && (
          <TouchableOpacity 
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={onRetry}
          >
            <Text style={[styles.retryButtonText, { color: onPrimary }]}>
              {retryText}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* スピナーのCSS */}
      <style>{`
        @keyframes spin-dots {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spinner-ring {
          width: 120px;
          height: 120px;
          position: relative;
          animation: spin-dots 1.2s linear infinite;
        }
        .spinner-dot {
          position: absolute;
          border-radius: 50%;
          transform-origin: 60px 60px;
        }
      `}</style>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerWrap: {
    width: 120,
    height: 120,
  },
  qArea: {
    position: 'absolute' as any,
    bottom: 24,
    right: 24,
    alignItems: 'flex-end',
    gap: 8,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    position: 'relative',
  },
  bubbleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 120,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

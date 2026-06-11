import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useCustomBGM } from './customBGMContext';
import { useBGM } from './bgmContext';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

const PRESET_NAMES: Record<string, { ja: string; en: string; icon: string }> = {
  bgm:  { ja: 'デフォルト',     en: 'Default',        icon: '🎵' },
  bgm2: { ja: '和の調べ',       en: 'Japanese Style',  icon: '🎋' },
  bgm3: { ja: 'テンションUP！', en: 'Hype Up!',        icon: '🔥' },
  bgm4: { ja: 'おしゃれカフェ', en: 'Stylish',         icon: '☕' },
};

export default function MiniPlayer() {
  const {
    tracks, currentTrack, isPlaying: customPlaying,
    togglePlay, next, prev, play, speed: customSpeed, setSpeed: setCustomSpeed,
  } = useCustomBGM();
  const {
    bgmEnabled, currentBGM,
    toggleBGM,
  } = useBGM();
  const { colors, onPrimary } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [locale] = useState<'ja' | 'en'>('ja');

  const hasCustom = tracks.length > 0;

  // カスタムBGMがある場合のみ表示（プリセットBGM時は非表示）
  if (!hasCustom) return null;

  // ─── カスタムBGMプレイヤー ───
  if (hasCustom) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* メインバー */}
        <View style={styles.row}>
          <TouchableOpacity style={styles.trackInfo} onPress={() => setExpanded(v => !v)}>
            <Text style={styles.noteIcon}>🎵</Text>
            <Text style={[styles.trackName, { color: colors.text }]} numberOfLines={1}>
              {currentTrack?.name ?? '—'}
            </Text>
            <Text style={[styles.expandIcon, { color: colors.textSecondary }]}>
              {expanded ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
          <View style={styles.controls}>
            <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: colors.background }]} onPress={prev} disabled={tracks.length <= 1}>
              <Text style={[styles.ctrlText, { color: tracks.length <= 1 ? colors.border : colors.primary }]}>⏮</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.playBtn, { backgroundColor: colors.primary }]} onPress={togglePlay}>
              <Text style={[styles.playText, { color: onPrimary }]}>{customPlaying ? '⏸' : '▶'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: colors.background }]} onPress={next} disabled={tracks.length <= 1}>
              <Text style={[styles.ctrlText, { color: tracks.length <= 1 ? colors.border : colors.primary }]}>⏭</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 展開時 */}
        {expanded && (
          <View style={[styles.expandedArea, { borderTopColor: colors.border }]}>
            {/* 速度 */}
            <View style={styles.speedRow}>
              {SPEED_OPTIONS.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.speedBtn, {
                    backgroundColor: customSpeed === s ? colors.primary : colors.background,
                    borderColor: customSpeed === s ? colors.primary : colors.border,
                  }]}
                  onPress={() => setCustomSpeed(s)}
                >
                  <Text style={[styles.speedText, { color: customSpeed === s ? onPrimary : colors.text }]}>{s}x</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* トラックリスト */}
            <View style={styles.trackList}>
              {tracks.map((t, i) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.trackItem, {
                    backgroundColor: currentTrack?.id === t.id && customPlaying ? colors.primary : 'transparent',
                    borderRadius: 4,
                  }]}
                  onPress={() => play(i)}
                >
                  <Text style={[styles.trackItemText, {
                    color: currentTrack?.id === t.id && customPlaying ? onPrimary : colors.text,
                    fontWeight: currentTrack?.id === t.id ? 'bold' : 'normal',
                  }]} numberOfLines={1}>
                    {currentTrack?.id === t.id && customPlaying ? '▶ ' : `${i + 1}. `}{t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  }

  // ─── プリセットBGMプレイヤー ───
  const preset = PRESET_NAMES[currentBGM] ?? PRESET_NAMES['bgm'];
  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* メインバー */}
      <View style={styles.row}>
        <TouchableOpacity style={styles.trackInfo} onPress={() => setExpanded(v => !v)}>
          <Text style={styles.noteIcon}>{preset.icon}</Text>
          <Text style={[styles.trackName, { color: colors.text }]} numberOfLines={1}>
            {locale === 'ja' ? preset.ja : preset.en}
          </Text>
          <Text style={[styles.presetBadge, { color: colors.textSecondary }]}>
            {locale === 'ja' ? 'プリセット' : 'Preset'}
          </Text>
          <Text style={[styles.expandIcon, { color: colors.textSecondary }]}>
            {expanded ? '▲' : '▼'}
          </Text>
        </TouchableOpacity>
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: bgmEnabled ? colors.primary : colors.border }]}
            onPress={async () => {
              if (bgmEnabled) {
                await SoundManager.pauseBGM();
                toggleBGM(false);
              } else {
                await SoundManager.playBGM();
                toggleBGM(true);
              }
            }}
          >
            <Text style={[styles.playText, { color: onPrimary }]}>{bgmEnabled ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 展開時の速度変更は SoundManager のメソッドがないため非表示 */}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderBottomWidth: 1, paddingHorizontal: 12, paddingVertical: 6, zIndex: 100 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  noteIcon: { fontSize: 13 },
  trackName: { flex: 1, fontSize: 12, fontWeight: '500' },
  expandIcon: { fontSize: 10 },
  presetBadge: { fontSize: 10 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ctrlBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ctrlText: { fontSize: 13 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  playText: { fontSize: 15 },
  expandedArea: { marginTop: 4, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  speedLabel: { fontSize: 11 },
  speedRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  speedBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  speedText: { fontSize: 11, fontWeight: 'bold' },
  trackList: { maxHeight: 120 },
  trackItem: { paddingVertical: 4, paddingHorizontal: 4 },
  trackItemText: { fontSize: 12 },
});

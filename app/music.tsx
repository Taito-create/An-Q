import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Platform, TextInput } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { loadStats } from './missions';
import { useCustomBGM } from './customBGMContext';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

export default function MusicScreen() {
  const { colors, onPrimary } = useTheme();
  const navigate = useNavigate();
  const locale = useLocale();
  const t = translations[locale];
  const {
    library, addFiles, removeFromLibrary,
    playlists, activePlaylistId, setActivePlaylistId,
    createPlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist, getActiveTracks,
    currentIndex, isPlaying, speed, play, pause, togglePlay, next, prev, setSpeed,
    currentTrack, duplicateWarning, clearDuplicateWarning,
  } = useCustomBGM();

  const [bgmPreset, setBgmPreset] = useState<string>('default');
  const [seType, setSeType] = useState<string>('effect1');
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewPlaylistInput, setShowNewPlaylistInput] = useState(false);

  const bgmPresets = {
    default:   { name: t.standardBgm,        icon: '🎵', desc: t.standardBgm,           file: 'bgm' },
    japanese:  { name: t.japaneseStyle,   icon: '🎋', desc: t.japaneseStyleDesc, file: 'bgm2' },
    energetic: { name: t.hypeUp,   icon: '🔥', desc: t.hypeUpDesc, file: 'bgm3' },
    stylish:   { name: t.stylishCafe,    icon: '☕', desc: t.stylishCafeDesc, file: 'bgm4' },
  };

  const seSets: Record<string, { name: string; icon: string; sound: string }> = {
    effect1: { name: locale === 'ja' ? 'エフェクト1' : 'Effect 1', icon: '✨', sound: 'decide' },
    effect2: { name: locale === 'ja' ? 'エフェクト2' : 'Effect 2', icon: '💫', sound: 'decide' },
    effect3: { name: locale === 'ja' ? 'エフェクト3' : 'Effect 3', icon: '⚡', sound: 'decide' },
    effect4: { name: locale === 'ja' ? 'エフェクト4' : 'Effect 4', icon: '🔊', sound: 'decide' },
  };

  // 試し聞きボタンの定義
  const soundTypes: { key: string; label: string }[] = [
    { key: 'select',   label: t.selectAction },
    { key: 'decide',   label: t.decideAction },
    { key: 'complete', label: t.complete },
    { key: 'correct',  label: t.correct },
    { key: 'wrong',    label: t.incorrect },
    { key: 'question', label: t.questionNumber },
  ];

  useEffect(() => {
    loadSettings();
    loadStats().then(stats => {
      setIsUnlocked(!!(stats.unlockedFeatures?.includes('custom_bgm')));
    });
  }, []);

  const loadSettings = async () => {
    try {
      const bp = await AsyncStorage.getItem('bgm_preset');
      if (bp) setBgmPreset(bp);
      const st = await AsyncStorage.getItem('se_type');
      if (st) {
        setSeType(st);
        await SoundManager.setSESet(st as any);
      }
      const be = await AsyncStorage.getItem('bgm_enabled');
      const enabled = be !== 'false'; // デフォルトtrue
      setBgmEnabled(enabled);
    } catch {}
  };

  // ファイル追加
  const pickFiles = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      addFiles(files);
    };
    input.click();
  };

  // プレイリスト作成
  const handleCreatePlaylist = () => {
    const name = newPlaylistName.trim() || `${t.playlists} ${playlists.length + 1}`;
    createPlaylist(name);
    setNewPlaylistName('');
    setShowNewPlaylistInput(false);
  };

  const activeTracks = getActiveTracks();
  const activePlaylist = playlists.find(p => p.id === activePlaylistId);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 重複警告バナー */}
      {duplicateWarning && duplicateWarning.length > 0 && (
        <View style={[styles.warningBanner, { backgroundColor: colors.warning }]}>
          <Text style={[styles.warningText, { color: colors.text }]}>
            {t.alreadySaved}: 
            {duplicateWarning.join(', ')}
          </Text>
          <TouchableOpacity style={[styles.closeWarning, { backgroundColor: colors.border }]} onPress={clearDuplicateWarning}>
            <Text style={[styles.closeWarningText, { color: colors.text }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainer}>

        {/* BGMプリセット */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.bgmPresets}</Text>
        <View style={styles.presetGrid}>
          {Object.entries(bgmPresets).map(([key, preset]) => (
            <TouchableOpacity
              key={key}
              style={[styles.presetCard, { backgroundColor: bgmPreset === key ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={async () => {
                setBgmPreset(key);
                await AsyncStorage.setItem('bgm_preset', key);
                // カスタムBGMを停止してからプリセットBGMに切り替え
                if (isPlaying) {
                  pause();
                }
                const fileKey = (preset as any).file || 'bgm';
                await SoundManager.updateBGMSetting(bgmEnabled, fileKey as any);
                SoundManager.play('decide');
              }}
            >
              <Text style={styles.presetIcon}>{preset.icon}</Text>
              <Text style={[styles.presetName, { color: bgmPreset === key ? onPrimary : colors.text }]}>{preset.name}</Text>
              <Text style={[styles.presetDesc, { color: bgmPreset === key ? onPrimary : colors.textSecondary }]}>{preset.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[styles.toggleRow, { backgroundColor: colors.card }]}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>BGM</Text>
          <Switch
            value={bgmEnabled}
            onValueChange={async v => {
              setBgmEnabled(v);
              await AsyncStorage.setItem('bgm_enabled', v.toString());
              // SoundManagerに即時反映
              const currentPreset = bgmPresets[bgmPreset as keyof typeof bgmPresets] as any;
              const fileKey = currentPreset?.file || 'bgm';
              await SoundManager.updateBGMSetting(v, fileKey as any);
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        {/* 効果音セット */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.soundEffectsTitle}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t.reorderModeActive}</Text>
        <View style={styles.presetGrid}>
          {Object.entries(seSets).map(([key, set]) => (
            <TouchableOpacity
              key={key}
              style={[styles.presetCard, { backgroundColor: seType === key ? colors.primary : colors.card, borderColor: colors.border, borderWidth: 1 }]}
              onPress={async () => {
                setSeType(key);
                await AsyncStorage.setItem('se_type', key);
                await SoundManager.setSESet(key as any);
                SoundManager.play('decide');
              }}
            >
              <Text style={styles.presetIcon}>{set.icon}</Text>
              <Text style={[styles.presetName, { color: seType === key ? onPrimary : colors.text }]}>{set.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 試し聞きボタン */}
        <View style={[styles.subSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.subTitle, { color: colors.text }]}>
            🔊 {t.previewSounds}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {t.currentSet}: {seSets[seType]?.name ?? seType}
          </Text>
          <View style={styles.soundTestGrid}>
            {soundTypes.map(st => (
              <TouchableOpacity
                key={st.key}
                style={[styles.soundTestBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}
                onPress={() => SoundManager.play(st.key as any)}
              >
                <Text style={[styles.soundTestBtnText, { color: colors.primary }]}>
                  {st.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* カスタムBGM */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.customBgm}</Text>
        {!isUnlocked ? (
          <View style={[styles.lockedBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={styles.lockEmoji}>🔒</Text>
            <Text style={styles.chainEmoji}>⛓️⛓️⛓️</Text>
            <Text style={[styles.lockedText, { color: colors.textSecondary }]}>
              {t.unlockBgmMsg}
            </Text>
          </View>
        ) : (
          <>
            {/* ライブラリ */}
            <View style={[styles.subSection, { backgroundColor: colors.card }]}>
              <View style={styles.subHeader}>
                <Text style={[styles.subTitle, { color: colors.text }]}>📂 {t.library}</Text>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary }]} onPress={pickFiles}>
                  <Text style={[styles.smallBtnText, { color: onPrimary }]}>+ {t.addMusic}</Text>
                </TouchableOpacity>
              </View>
              {library.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t.addAudioFiles}
                </Text>
              ) : (
                library.map(file => (
                  <View key={file.id} style={[styles.trackRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.trackName, { color: colors.text }]} numberOfLines={1}>🎵 {file.name}</Text>
                    <View style={styles.trackActions}>
                      {activePlaylistId && (
                        <TouchableOpacity
                          style={[styles.addToPlBtn, { backgroundColor: colors.success }]}
                          onPress={() => addTrackToPlaylist(activePlaylistId, file.id)}
                        >
                          <Text style={styles.tinyBtnText}>
                            {t.addToPlaylist}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.tinyBtn, { backgroundColor: colors.error }]} onPress={() => removeFromLibrary(file.id)}>
                        <Text style={styles.tinyBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* プレイリスト */}
            <View style={[styles.subSection, { backgroundColor: colors.card }]}>
              <View style={styles.subHeader}>
                <Text style={[styles.subTitle, { color: colors.text }]}>🎶 {t.playlists}</Text>
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary }]} onPress={() => setShowNewPlaylistInput(v => !v)}>
                  <Text style={[styles.smallBtnText, { color: onPrimary }]}>+ {t.newPlaylist}</Text>
                </TouchableOpacity>
              </View>

              {showNewPlaylistInput && (
                <View style={styles.newPlaylistRow}>
                  <TextInput
                    style={[styles.nameInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                    value={newPlaylistName}
                    onChangeText={setNewPlaylistName}
                    placeholder={t.playlistName}
                    placeholderTextColor={colors.textSecondary}
                  />
                  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.success }]} onPress={handleCreatePlaylist}>
                    <Text style={[styles.smallBtnText, { color: '#fff' }]}>OK</Text>
                  </TouchableOpacity>
                </View>
              )}

              {playlists.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  {t.createPlaylistPrompt}
                </Text>
              ) : (
                playlists.map(pl => (
                  <TouchableOpacity
                    key={pl.id}
                    style={[styles.playlistRow, { backgroundColor: activePlaylistId === pl.id ? colors.primary + '20' : colors.background, borderColor: activePlaylistId === pl.id ? colors.primary : colors.border }]}
                    onPress={() => setActivePlaylistId(pl.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.playlistName, { color: activePlaylistId === pl.id ? colors.primary : colors.text }]}>
                        {activePlaylistId === pl.id ? '▶ ' : ''}{pl.name}
                      </Text>
                      <Text style={[styles.trackCount, { color: colors.textSecondary }]}>
                        {pl.trackIds.length} {t.tracks}
                      </Text>
                    </View>
                    <TouchableOpacity style={[styles.tinyBtn, { backgroundColor: colors.error }]} onPress={() => deletePlaylist(pl.id)}>
                      <Text style={styles.tinyBtnText}>🗑️</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* アクティブプレイリストの中身 */}
            {activePlaylist && activeTracks.length > 0 && (
              <View style={[styles.subSection, { backgroundColor: colors.card }]}>
                <Text style={[styles.subTitle, { color: colors.text }]}>📋 {activePlaylist.name}</Text>
                {activeTracks.map((track, i) => {
                  const isCurrent = i === currentIndex && isPlaying;
                  return (
                  <View key={track.id} style={[styles.trackRow, {
                    borderBottomColor: colors.border,
                    backgroundColor: isCurrent ? colors.primary : 'transparent',
                    borderRadius: isCurrent ? 6 : 0,
                  }]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => play(i)}>
                      <Text style={[styles.trackName, { color: isCurrent ? onPrimary : colors.text, fontWeight: isCurrent ? 'bold' : 'normal' }]} numberOfLines={1}>
                        {isCurrent ? '▶ ' : `${i + 1}. `}{track.name}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.tinyBtn, { backgroundColor: isCurrent ? 'rgba(255,255,255,0.3)' : colors.error }]} onPress={() => removeTrackFromPlaylist(activePlaylistId!, track.id)}>
                      <Text style={styles.tinyBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  );
                })}

                {/* 再生コントロール */}
                <View style={styles.controls}>
                  <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: colors.border }]} onPress={prev}>
                    <Text style={styles.ctrlBtnText}>⏮</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.playBtn, { backgroundColor: isPlaying ? colors.error : colors.success }]} onPress={togglePlay}>
                    <Text style={styles.ctrlBtnText}>{isPlaying ? '⏸' : '▶'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.ctrlBtn, { backgroundColor: colors.border }]} onPress={next}>
                    <Text style={styles.ctrlBtnText}>⏭</Text>
                  </TouchableOpacity>
                </View>

                {/* 速度 */}
                <View style={styles.speedRow}>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(s => (
                    <TouchableOpacity key={s} style={[styles.speedBtn, { backgroundColor: speed === s ? colors.primary : colors.background, borderColor: colors.border }]} onPress={() => setSpeed(s)}>
                      <Text style={[styles.speedBtnText, { color: speed === s ? onPrimary : colors.text }]}>{s}x</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); navigate('/'); }}>
          <Text style={[styles.backButtonText, { color: onPrimary }]}>{ja ? '戻る' : 'Back'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flex: 1 },
  scrollContainer: { padding: 16, paddingBottom: 90 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  hint: { fontSize: 11, marginBottom: 6 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  presetCard: { width: '48%', padding: 10, borderRadius: 10, alignItems: 'center' },
  presetIcon: { fontSize: 20, marginBottom: 3 },
  presetName: { fontSize: 13, fontWeight: 'bold', marginBottom: 2, textAlign: 'center' },
  presetDesc: { fontSize: 11, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 4 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  lockedBox: { padding: 24, borderRadius: 12, alignItems: 'center', borderWidth: 1, gap: 6 },
  lockEmoji: { fontSize: 36 },
  chainEmoji: { fontSize: 18, letterSpacing: 4 },
  lockedText: { fontSize: 13, textAlign: 'center' },
  subSection: { borderRadius: 10, padding: 12, marginBottom: 10 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  subTitle: { fontSize: 14, fontWeight: 'bold' },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  smallBtnText: { fontSize: 12, fontWeight: 'bold' },
  emptyText: { fontSize: 12, textAlign: 'center', paddingVertical: 10 },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  trackName: { fontSize: 13, flex: 1 },
  trackActions: { flexDirection: 'row', gap: 4 },
  tinyBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tinyBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  addToPlBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  newPlaylistRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  nameInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 13 },
  playlistRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6 },
  playlistName: { fontSize: 13, fontWeight: '600' },
  trackCount: { fontSize: 11, marginTop: 2 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, marginBottom: 8 },
  ctrlBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  ctrlBtnText: { fontSize: 18 },
  speedRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  speedBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  speedBtnText: { fontSize: 12, fontWeight: 'bold' },
  warningBanner: { flexDirection: 'row', alignItems: 'center', padding: 12, margin: 16, marginBottom: 8, borderRadius: 8 },
  warningText: { flex: 1, fontSize: 13, marginRight: 8 },
  closeWarning: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  closeWarningText: { fontSize: 12, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  backButton: { padding: 14, borderRadius: 8, alignItems: 'center' },
  backButtonText: { fontSize: 16, fontWeight: 'bold' },
  soundTestGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  soundTestBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  soundTestBtnText: { fontSize: 13, fontWeight: '600' },
});
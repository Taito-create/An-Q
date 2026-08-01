import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { useBGM } from './bgmContext';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { STORAGE_KEYS } from './constants/storageKeys';
import {
  VoicePreset,
  voicePresetLabels,
  voicePresetDescriptions,
  getStoredVoicePreset,
  setStoredVoicePreset,
  speakText,
  logAvailableVoices,
  initSpeechVoices,
} from './utils/speechUtils';

const APP_VERSION = '1.0.0';

const VOICE_PRESET_ORDER: VoicePreset[] = ['standard', 'yukkuri', 'slow', 'energetic', 'calm', 'deep'];

export default function AppSettingsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, scale, isCyberpunk } = useTheme();
  const { bgmEnabled, toggleBGM } = useBGM();
  const locale = useLocale();
  const t = translations[locale];
  const fs = (n: number) => Math.round(n * scale);

  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const [seEnabled, setSeEnabled] = useState(true);
  const [voicePreset, setVoicePreset] = useState<VoicePreset>('standard');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.DEV_MODE_ENABLED).then(v => setDevModeEnabled(v === 'true'));
    AsyncStorage.getItem(STORAGE_KEYS.SE_ENABLED).then(v => setSeEnabled(v !== 'false'));
    getStoredVoicePreset().then(p => setVoicePreset(p));

    // 音声エンジンを初期化し、デバッグ用にボイス一覧を出力
    initSpeechVoices();
    logAvailableVoices();
  }, []);

  const handleLanguage = async (lang: 'ja' | 'en') => {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_LANGUAGE, lang);
    SoundManager.play('decide');
  };

  const handleDevMode = async (val: boolean) => {
    setDevModeEnabled(val);
    await AsyncStorage.setItem(STORAGE_KEYS.DEV_MODE_ENABLED, val ? 'true' : 'false');
    SoundManager.play('decide');
  };

  const handleSE = async (val: boolean) => {
    setSeEnabled(val);
    await AsyncStorage.setItem(STORAGE_KEYS.SE_ENABLED, val ? 'true' : 'false');
    SoundManager.play('decide');
  };

  const handleVoicePreset = async (preset: VoicePreset) => {
    setVoicePreset(preset);
    await setStoredVoicePreset(preset);
    SoundManager.play('decide');
  };

  const handleVoicePreview = (preset: VoicePreset) => {
    SoundManager.play('decide');
    speakText(t.voicePreviewText, 'ja-JP', preset);
  };

  const Row = ({ label, right }: { label: string; right: React.ReactNode }) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text, fontSize: fs(15) }]}>{label}</Text>
      <View style={styles.rowRight}>{right}</View>
    </View>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontSize: fs(12) }]}>{title}</Text>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fs(20) }]}>
          ⚙️ {t.appSettings}
        </Text>
        <TouchableOpacity
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: colors.primary,
            borderRadius: isCyberpunk ? 0 : 10,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 70,
          }}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
            {locale === 'ja' ? '戻る' : 'Back'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>

        {/* 言語 */}
        <SectionHeader title={locale === 'ja' ? '言語 / Language' : 'Language'} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Row
            label={t.displayLanguage}
            right={
              <View style={styles.langToggle}>
                <TouchableOpacity
                  style={[styles.langBtn, { backgroundColor: locale === 'ja' ? colors.primary : colors.background, borderColor: colors.border }]}
                  onPress={() => handleLanguage('ja')}
                >
                  <Text style={[styles.langBtnText, { color: locale === 'ja' ? onPrimary : colors.text }]}>日本語</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.langBtn, { backgroundColor: locale === 'en' ? colors.primary : colors.background, borderColor: colors.border }]}
                  onPress={() => handleLanguage('en')}
                >
                  <Text style={[styles.langBtnText, { color: locale === 'en' ? onPrimary : colors.text }]}>English</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>

        {/* サウンド */}
        <SectionHeader title={locale === 'ja' ? 'サウンド' : 'Sound'} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Row
            label={t.bgm}
            right={
              <Switch
                value={bgmEnabled}
                onValueChange={toggleBGM}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFF"
              />
            }
          />
          <Row
            label={t.soundEffects}
            right={
              <Switch
                value={seEnabled}
                onValueChange={handleSE}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFF"
              />
            }
          />
          <Row
            label={t.musicSettings}
            right={
              <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/music'); }}>
                <Text style={[styles.linkText, { color: colors.primary, fontSize: fs(14) }]}>
                  {t.details}
                </Text>
              </TouchableOpacity>
            }
          />
        </View>

        {/* ボイスプリセット */}
        <SectionHeader title={t.voicePreset} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <View style={[styles.row, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
            <Text style={[styles.rowLabel, { color: colors.text, fontSize: fs(15), marginBottom: 8 }]}>
              {t.voicePresetDesc}
            </Text>
            <View style={styles.voicePresetList}>
              {VOICE_PRESET_ORDER.map((preset) => (
                <View key={preset} style={styles.voicePresetItem}>
                  <TouchableOpacity
                    style={[
                      styles.voicePresetBtn,
                      {
                        backgroundColor: voicePreset === preset ? colors.primary : colors.background,
                        borderColor: voicePreset === preset ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => handleVoicePreset(preset)}
                  >
                    <Text
                      style={[
                        styles.voicePresetBtnText,
                        { color: voicePreset === preset ? onPrimary : colors.text },
                      ]}
                    >
                      {voicePresetLabels[preset]}
                    </Text>
                    <Text
                      style={[
                        styles.voicePresetDescText,
                        { color: voicePreset === preset ? onPrimary : colors.textSecondary },
                      ]}
                    >
                      {voicePresetDescriptions[preset]}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.previewBtn, { borderColor: colors.primary }]}
                    onPress={() => handleVoicePreview(preset)}
                  >
                    <Text style={[styles.previewBtnText, { color: colors.primary }]}>
                      🔊 {t.voicePreview}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* 外観 */}
        <SectionHeader title={t.appearance} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Row
            label={t.themeSetting}
            right={
              <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/settings'); }}>
                <Text style={[styles.linkText, { color: colors.primary, fontSize: fs(14) }]}>
                  {t.details}
                </Text>
              </TouchableOpacity>
            }
          />
        </View>

        {/* プロフィール */}
        <SectionHeader title={locale === 'ja' ? 'プロフィール' : 'Profile'} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Row
            label={locale === 'ja' ? 'プロフィール編集' : 'Edit Profile'}
            right={
              <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/profile'); }}>
                <Text style={[styles.linkText, { color: colors.primary, fontSize: fs(14) }]}>
                  {locale === 'ja' ? '編集' : 'Edit'}
                </Text>
              </TouchableOpacity>
            }
          />
        </View>

        {/* 開発者 */}
        <SectionHeader title={t.developer} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Row
            label={t.developerMode}
            right={
              <Switch
                value={devModeEnabled}
                onValueChange={handleDevMode}
                trackColor={{ false: colors.border, true: colors.warning }}
                thumbColor="#FFF"
              />
            }
          />
          {devModeEnabled && (
            <Row
              label={t.openDevTools}
              right={
                <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/devmode'); }}>
                  <Text style={[styles.linkText, { color: colors.warning, fontSize: fs(14) }]}>
                    {t.details}
                  </Text>
                </TouchableOpacity>
              }
            />
          )}
        </View>

        {/* このアプリについて */}
        <SectionHeader title={t.aboutApp} />
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Row label={t.appName} right={<Text style={[styles.valueText, { color: colors.textSecondary, fontSize: fs(14) }]}>An-Q</Text>} />
          <Row label={t.version} right={<Text style={[styles.valueText, { color: colors.textSecondary, fontSize: fs(14) }]}>{APP_VERSION}</Text>} />
          <Row label={t.developer} right={<Text style={[styles.valueText, { color: colors.textSecondary, fontSize: fs(14) }]}>{t.developerName}</Text>} />
          <Row
            label={t.concept}
            right={<Text style={[styles.valueText, { color: colors.textSecondary, fontSize: fs(13) }]}>{t.conceptText}</Text>}
          />
          <Row
            label={t.musicCredits}
            right={
              <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/credits'); }}>
                <Text style={[styles.linkText, { color: colors.primary, fontSize: fs(14) }]}>
                  {t.details}
                </Text>
              </TouchableOpacity>
            }
          />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontWeight: 'bold' },
  list: { flex: 1 },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  section: { marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontWeight: '500', flex: 1 },
  rowRight: { marginLeft: 12 },
  langToggle: { flexDirection: 'row', gap: 6 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  langBtnText: { fontWeight: '600', fontSize: 13 },
  linkText: { fontWeight: '600' },
  valueText: { textAlign: 'right' },
  segmented: { flexDirection: 'row', gap: 6 },
  segBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  segBtnText: { fontWeight: '600' },
  voicePresetList: { flexDirection: 'column', gap: 8 },
  voicePresetItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voicePresetBtn: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5 },
  voicePresetBtnText: { fontWeight: '700', fontSize: 14 },
  voicePresetDescText: { fontSize: 11, marginTop: 2 },
  previewBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5 },
  previewBtnText: { fontWeight: '600', fontSize: 12 },
});
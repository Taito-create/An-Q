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
import { safeRender } from './utils/renderHelpers';
import {
  voicePresetLabels,
  voicePresetDescriptions,
  getStoredVoicePreset,
  setStoredVoicePreset,
  speakText,
  initSpeechVoices,
  VOICEVOX_SPEAKERS,
  speakWithVoicevox,
  speakWithVoicevoxProxy,
} from './utils/speechUtils';
import { Settings, Mic, Volume2, ChevronLeft } from 'lucide-react';

const APP_VERSION = '1.0.0';



export default function AppSettingsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, scale, isCyberpunk } = useTheme();
  const { bgmEnabled, toggleBGM } = useBGM();
  const locale = useLocale();
  const t = translations[locale];
  const fs = (n: number) => Math.round(n * scale);

  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const [seEnabled, setSeEnabled] = useState(true);
  const [voiceEngine, setVoiceEngine] = useState<'web' | 'voicevox'>('web');
  const [voicevoxSpeaker, setVoicevoxSpeaker] = useState<number>(3);
  const [voicevoxMode, setVoicevoxMode] = useState<'direct' | 'proxy'>('direct');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.DEV_MODE_ENABLED).then(v => setDevModeEnabled(v === 'true'));
    AsyncStorage.getItem(STORAGE_KEYS.SE_ENABLED).then(v => setSeEnabled(v !== 'false'));
    AsyncStorage.getItem(STORAGE_KEYS.VOICE_ENGINE).then(v => setVoiceEngine(v === 'voicevox' ? 'voicevox' : 'web'));
    AsyncStorage.getItem(STORAGE_KEYS.VOICEVOX_SPEAKER).then(v => setVoicevoxSpeaker(v ? parseInt(v, 10) : 3));
    AsyncStorage.getItem('voicevox_mode').then(v => setVoicevoxMode(v === 'proxy' ? 'proxy' : 'direct'));

    // 音声エンジンを初期化
    initSpeechVoices();
  }, []);

  const handleEngineChange = async (engine: 'web' | 'voicevox') => {
    setVoiceEngine(engine);
    await AsyncStorage.setItem(STORAGE_KEYS.VOICE_ENGINE, engine);
    SoundManager.play('decide');
  };

  const handleSpeakerChange = async (id: number) => {
    setVoicevoxSpeaker(id);
    await AsyncStorage.setItem(STORAGE_KEYS.VOICEVOX_SPEAKER, String(id));
    SoundManager.play('decide');
  };

  const handleVoicevoxModeChange = async (mode: 'direct' | 'proxy') => {
    setVoicevoxMode(mode);
    await AsyncStorage.setItem('voicevox_mode', mode);
    SoundManager.play('decide');
  };

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

  const handleVoicePreview = () => {
    SoundManager.play('decide');
    const text = locale === 'ja' ? 'こんにちは！テストです。' : 'Hello! This is a test.';
    if (voiceEngine === 'voicevox') {
      if (voicevoxMode === 'proxy') {
        speakWithVoicevoxProxy(text, voicevoxSpeaker);
      } else {
        speakWithVoicevox(text, voicevoxSpeaker);
      }
    } else {
      speakText(text, 'ja-JP');
    }
  };

  const Row = ({ label, right }: { label: string; right: React.ReactNode }) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text, fontSize: fs(15) }]}>{label}</Text>
      <View style={styles.rowRight}>{safeRender(right)}</View>
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
          <Settings size={24} color={colors.primary} style={{ marginRight: 8 }} />{t.appSettings}
        </Text>
        <TouchableOpacity
          style={{ paddingVertical: 10, paddingHorizontal: 14 }}
          onPress={() => { SoundManager.play('decide'); navigate('/sub'); }}
        >
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
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
          <Row
            label={locale === 'ja' ? '音声エンジン' : 'Voice Engine'}
            right={
              <View style={styles.engineToggle}>
                <TouchableOpacity
                  style={[styles.engineBtn, { backgroundColor: voiceEngine === 'web' ? colors.primary : colors.background, borderColor: colors.border }]}
                  onPress={() => handleEngineChange('web')}
                >
                  <Text style={{ color: voiceEngine === 'web' ? onPrimary : colors.text, fontWeight: '600', fontSize: 12 }}>Web Speech</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.engineBtn, { backgroundColor: voiceEngine === 'voicevox' ? colors.primary : colors.background, borderColor: colors.border }]}
                  onPress={() => handleEngineChange('voicevox')}
                >
                  <Text style={{ color: voiceEngine === 'voicevox' ? onPrimary : colors.text, fontWeight: '600', fontSize: 12 }}>VOICEVOX</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>

        {/* VOICEVOX 話者選択 */}
        {voiceEngine === 'voicevox' && (
          <>
            <SectionHeader title={locale === 'ja' ? 'VOICEVOX 話者' : 'VOICEVOX Speaker'} />
            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <Row
                label={locale === 'ja' ? '話者' : 'Speaker'}
                right={
                  <View style={styles.speakerList}>
                    {VOICEVOX_SPEAKERS.map((speaker) => (
                      <TouchableOpacity
                        key={speaker.id}
                        style={[styles.speakerBtn, {
                          backgroundColor: voicevoxSpeaker === speaker.id ? colors.primary : colors.background,
                          borderColor: voicevoxSpeaker === speaker.id ? colors.primary : colors.border,
                        }]}
                        onPress={() => handleSpeakerChange(speaker.id)}
                      >
                        <Text style={{ color: voicevoxSpeaker === speaker.id ? onPrimary : colors.text, fontSize: 11, fontWeight: '500' }}>
                          {locale === 'ja' ? speaker.nameJa : speaker.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                }
              />
              <Row
                label={locale === 'ja' ? '接続モード' : 'Connection'}
                right={
                  <View style={styles.engineToggle}>
                    <TouchableOpacity
                      style={[styles.engineBtn, { backgroundColor: voicevoxMode === 'direct' ? colors.primary : colors.background, borderColor: colors.border }]}
                      onPress={() => handleVoicevoxModeChange('direct')}
                    >
                      <Text style={{ color: voicevoxMode === 'direct' ? onPrimary : colors.text, fontWeight: '600', fontSize: 11 }}>
                        {locale === 'ja' ? '直接' : 'Direct'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.engineBtn, { backgroundColor: voicevoxMode === 'proxy' ? colors.primary : colors.background, borderColor: colors.border }]}
                      onPress={() => handleVoicevoxModeChange('proxy')}
                    >
                      <Text style={{ color: voicevoxMode === 'proxy' ? onPrimary : colors.text, fontWeight: '600', fontSize: 11 }}>
                        Proxy
                      </Text>
                    </TouchableOpacity>
                  </View>
                }
              />
              <Row
                label={locale === 'ja' ? 'テスト読み上げ' : 'Test Voice'}
                right={
                  <TouchableOpacity
                    style={[styles.previewBtn, { borderColor: colors.primary }]}
                    onPress={handleVoicePreview}
                  >
                    <Text style={[styles.previewBtnText, { color: colors.primary }]}>▶ {t.voicePreview}</Text>
                  </TouchableOpacity>
                }
              />
            </View>
          </>
        )}

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
  engineToggle: { flexDirection: 'row', gap: 6 },
  engineBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  speakerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 200 },
  speakerBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  previewBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  previewBtnText: { fontWeight: '600', fontSize: 13 },
});

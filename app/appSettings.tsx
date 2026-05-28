import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { useBGM } from './bgmContext';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

const APP_VERSION = '1.0.0';

export default function AppSettingsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, scale } = useTheme();
  const { bgmEnabled, toggleBGM } = useBGM();
  const locale = useLocale();
  const t = translations[locale];
  const fs = (n: number) => Math.round(n * scale);

  const [devModeEnabled, setDevModeEnabled] = useState(false);
  const [seEnabled, setSeEnabled] = useState(true);
  const [homeNavMode, setHomeNavMode] = useState<'compact' | 'bigGrid'>('compact');

  useEffect(() => {
    AsyncStorage.getItem('dev_mode_enabled').then(v => setDevModeEnabled(v === 'true'));
    AsyncStorage.getItem('se_enabled').then(v => setSeEnabled(v !== 'false'));
    AsyncStorage.getItem('home_nav_mode').then(v => { if (v === 'bigGrid') setHomeNavMode('bigGrid'); });
  }, []);

  const handleLanguage = async (lang: 'ja' | 'en') => {
    await AsyncStorage.setItem('user_language', lang);
    SoundManager.play('decide');
  };

  const handleDevMode = async (val: boolean) => {
    setDevModeEnabled(val);
    await AsyncStorage.setItem('dev_mode_enabled', val ? 'true' : 'false');
    SoundManager.play('decide');
  };

  const handleSE = async (val: boolean) => {
    setSeEnabled(val);
    await AsyncStorage.setItem('se_enabled', val ? 'true' : 'false');
    SoundManager.play('decide');
  };

  const handleHomeNavMode = async (mode: 'compact' | 'bigGrid') => {
    setHomeNavMode(mode);
    await AsyncStorage.setItem('home_nav_mode', mode);
    SoundManager.play('decide');
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
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fs(20) }]}>
          ⚙️ {t.appSettings}
        </Text>
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
          <Row
            label={t.homeUiMode}
            right={
              <View style={styles.segmented}>
                <TouchableOpacity
                  style={[styles.segBtn, { backgroundColor: homeNavMode === 'compact' ? colors.primary : colors.background, borderColor: colors.border }]}
                  onPress={() => handleHomeNavMode('compact')}
                >
                  <Text style={[styles.segBtnText, { color: homeNavMode === 'compact' ? onPrimary : colors.text, fontSize: fs(12) }]}>
                    {t.compactMode}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segBtn, { backgroundColor: homeNavMode === 'bigGrid' ? colors.primary : colors.background, borderColor: colors.border }]}
                  onPress={() => handleHomeNavMode('bigGrid')}
                >
                  <Text style={[styles.segBtnText, { color: homeNavMode === 'bigGrid' ? onPrimary : colors.text, fontSize: fs(12) }]}>
                    {t.bigGridMode}
                  </Text>
                </TouchableOpacity>
              </View>
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

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary, fontSize: fs(16) }]}>
          {t.back}
        </Text>
      </TouchableOpacity>
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
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: 'bold' },
});

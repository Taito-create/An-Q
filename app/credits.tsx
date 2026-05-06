import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { SoundManager } from './sound';

// 利用楽曲・効果音のクレジット情報
const CREDITS = {
  bgm: [
    {
      title: 'デフォルト',
      titleEn: 'Default',
      composer: 'Amacha Music',
      site: 'Amacha Music Studio',
      url: 'https://amachamusic.chagasi.com/music_natsuironocampus.html',
      license: '個人・商用利用可。クレジット表記推奨。',
      licenseEn: 'Free for personal and commercial use. Credit appreciated.',
    },
    {
      title: '和の調べ',
      titleEn: 'Japanese Style',
      composer: 'Story Invention',
      site: 'Story Invention Music',
      url: 'https://music.storyinvention.com/yumehanabi/',
      license: '個人・商用利用可。クレジット表記推奨。',
      licenseEn: 'Free for personal and commercial use. Credit appreciated.',
    },
    {
      title: 'テンションUP！',
      titleEn: 'Hype Up!',
      composer: 'OYU',
      site: 'OYU BGM',
      url: 'https://oyu-bgm.com/control/',
      license: '商用・非商用問わず無料で使用可。クレジット表記推奨。',
      licenseEn: 'Free for commercial and non-commercial use. Credit appreciated.',
    },
    {
      title: 'おしゃれカフェ',
      titleEn: 'Stylish',
      composer: 'DOVA-SYNDROME',
      site: 'DOVA-SYNDROME',
      url: 'https://dova-s.jp/bgm/detail/1984',
      license: '商用・非商用問わず無料で使用可。著作権はDOVA-SYNDROMEに帰属。',
      licenseEn: 'Free for commercial and non-commercial use. Copyright belongs to DOVA-SYNDROME.',
    },
  ],
  se: [
    {
      title: '効果音（スタンダード・エレクトロニック・和風・レトロ）',
      titleEn: 'Sound Effects (Standard / Electronic / Japanese / Retro)',
      composer: '効果音ラボ / 魔王魂',
      site: '効果音ラボ・魔王魂',
      url: 'https://soundeffect-lab.info/',
      license: '商用・非商用問わず無料で使用可。',
      licenseEn: 'Free for commercial and non-commercial use.',
    },
  ],
};

export default function CreditsScreen() {
  const router = useRouter();
  const { colors, onPrimary } = useTheme();
  const [locale, setLocale] = useState<'ja' | 'en'>('ja');

  useEffect(() => {
    AsyncStorage.getItem('user_language').then(l => { if (l === 'en') setLocale('en'); });
  }, []);

  const ja = locale === 'ja';

  const openURL = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const Section = ({ title, items }: { title: string; items: typeof CREDITS.bgm }) => (
    <View style={[styles.section, { backgroundColor: colors.card }]}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {items.map((item, i) => (
        <View key={i} style={[styles.item, { borderBottomColor: colors.border }]}>
          <Text style={[styles.itemTitle, { color: colors.text }]}>
            🎵 {ja ? item.title : item.titleEn}
          </Text>
          <Text style={[styles.itemComposer, { color: colors.textSecondary }]}>
            {ja ? '作曲者・提供元' : 'Composer / Source'}: {item.composer}
          </Text>
          <TouchableOpacity onPress={() => openURL(item.url)}>
            <Text style={[styles.itemLink, { color: colors.primary }]}>
              🔗 {item.site}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.itemLicense, { color: colors.textSecondary }]}>
            {ja ? '利用規約' : 'License'}: {ja ? item.license : item.licenseEn}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {ja ? '🎼 引用BGM・効果音' : '🎼 Music & Sound Credits'}
        </Text>
      </View>

      <ScrollView style={styles.list}>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          {ja
            ? 'このアプリで使用しているBGMおよび効果音の提供元です。各サイトの利用規約に従って使用しています。'
            : 'Credits for BGM and sound effects used in this app. Used in accordance with each site\'s terms of use.'}
        </Text>

        <Section title={ja ? 'BGM' : 'Background Music'} items={CREDITS.bgm} />
        <Section title={ja ? '効果音' : 'Sound Effects'} items={CREDITS.se} />

        <View style={{ height: 20 }} />
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary }]}
          onPress={() => { SoundManager.play('decide'); router.canGoBack() ? router.back() : router.replace('/'); }}
        >
          <Text style={[styles.backButtonText, { color: onPrimary }]}>
            {ja ? '戻る' : 'Back'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  list: { flex: 1, padding: 16 },
  note: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  section: { borderRadius: 12, padding: 14, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  item: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemComposer: { fontSize: 12 },
  itemLink: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  itemLicense: { fontSize: 11, lineHeight: 16 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12 },
  backButton: { padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: 'bold', fontSize: 16 },
});

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { TITLE_BADGES, loadStats, saveStats, UserStats } from './missions';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function TitleScreen() {
  const router = useRouter();
  const { colors, onPrimary, scale } = useTheme();
  const fs = (n: number) => Math.round(n * scale);

  const [locale, setLocale] = useState<'ja' | 'en'>('ja');
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('user_language').then(l => { if (l === 'en') setLocale('en'); });
    loadStats().then(setStats);
  }, []);

  const ja = locale === 'ja';

  const equipTitle = async (id: string) => {
    if (!stats) return;
    const updated = { ...stats, equippedTitle: stats.equippedTitle === id ? '' : id };
    setStats(updated);
    await saveStats(updated);
    SoundManager.play('decide');
  };

  const unlockedCount = stats?.unlockedTitles.length ?? 0;
  const totalCount = TITLE_BADGES.length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text, fontSize: fs(20) }]}>
            {ja ? '🏅 称号' : '🏅 Titles'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary, fontSize: fs(12) }]}>
            {unlockedCount} / {totalCount} {ja ? '解除済み' : 'unlocked'}
          </Text>
        </View>
        {stats?.equippedTitle && (
          <View style={[styles.equippedBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
            <Text style={[styles.equippedText, { color: colors.primary, fontSize: fs(12) }]}>
              {TITLE_BADGES.find(b => b.id === stats.equippedTitle)?.icon}{' '}
              {ja
                ? TITLE_BADGES.find(b => b.id === stats.equippedTitle)?.titleJa
                : TITLE_BADGES.find(b => b.id === stats.equippedTitle)?.titleEn}
            </Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.list}>
        {/* Stats summary */}
        {stats && (
          <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statsTitle, { color: colors.text, fontSize: fs(14) }]}>
              {ja ? '📊 あなたの記録' : '📊 Your Stats'}
            </Text>
            <View style={styles.statsGrid}>
              {[
                { labelJa: 'クイズ回数', labelEn: 'Quizzes', value: stats.quizPlayed },
                { labelJa: '正解数', labelEn: 'Correct', value: stats.correctAnswers },
                { labelJa: '問題作成', labelEn: 'Created', value: stats.questionsCreated },
                { labelJa: 'ログイン日数', labelEn: 'Login Days', value: stats.loginDays },
                { labelJa: '最長連続', labelEn: 'Max Streak', value: stats.maxStreak },
                { labelJa: '所持本', labelEn: 'Books', value: stats.totalBooks },
              ].map(item => (
                <View key={item.labelEn} style={[styles.statItem, { backgroundColor: colors.background }]}>
                  <Text style={[styles.statValue, { color: colors.primary, fontSize: fs(18) }]}>{item.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fs(11) }]}>
                    {ja ? item.labelJa : item.labelEn}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Title badges */}
        {TITLE_BADGES.map(badge => {
          const unlocked = stats?.unlockedTitles.includes(badge.id) ?? false;
          const equipped = stats?.equippedTitle === badge.id;

          return (
            <TouchableOpacity
              key={badge.id}
              style={[
                styles.badgeCard,
                {
                  backgroundColor: unlocked ? colors.card : colors.background,
                  borderColor: equipped ? colors.primary : colors.border,
                  borderWidth: equipped ? 2 : 1,
                  opacity: unlocked ? 1 : 0.5,
                }
              ]}
              onPress={() => unlocked && equipTitle(badge.id)}
              disabled={!unlocked}
            >
              <Text style={styles.badgeIcon}>{badge.icon}</Text>
              <View style={{ flex: 1 }}>
                <View style={styles.badgeTop}>
                  <Text style={[styles.badgeTitle, { color: unlocked ? colors.text : colors.textSecondary, fontSize: fs(15) }]}>
                    {ja ? badge.titleJa : badge.titleEn}
                  </Text>
                  {equipped && (
                    <View style={[styles.equippingTag, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.equippingTagText, { color: onPrimary, fontSize: fs(10) }]}>
                        {ja ? '装備中' : 'Equipped'}
                      </Text>
                    </View>
                  )}
                  {!unlocked && (
                    <Text style={[styles.lockIcon, { fontSize: fs(14) }]}>🔒</Text>
                  )}
                </View>
                <Text style={[styles.badgeDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>
                  {ja ? badge.descJa : badge.descEn}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? router.back() : router.replace("/"); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary, fontSize: fs(16) }]}>
          {ja ? '戻る' : 'Back'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontWeight: 'bold' },
  headerSub: { marginTop: 2 },
  equippedBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  equippedText: { fontWeight: 'bold' },
  list: { flex: 1, padding: 16 },
  statsCard: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  statsTitle: { fontWeight: 'bold', marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statItem: { width: '30%', padding: 10, borderRadius: 8, alignItems: 'center' },
  statValue: { fontWeight: 'bold' },
  statLabel: { marginTop: 2, textAlign: 'center' },
  badgeCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 10, gap: 12 },
  badgeIcon: { fontSize: 28 },
  badgeTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  badgeTitle: { fontWeight: 'bold' },
  equippingTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  equippingTagText: { fontWeight: 'bold' },
  lockIcon: {},
  badgeDesc: { lineHeight: 18 },
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: 'bold' },
});

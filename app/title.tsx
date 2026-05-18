import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { TITLE_BADGES, loadStats, saveStats, UserStats } from './missions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

export default function TitleScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, scale } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const fs = (n: number) => Math.round(n * scale);

  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    loadStats().then(setStats);
  }, []);

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
            {t.titlesTitle}
          </Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary, fontSize: fs(12) }]}>
            {unlockedCount} / {totalCount} {t.unlockedLabel}
          </Text>
        </View>
        {stats?.equippedTitle && (
          <View style={[styles.equippedBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
            <Text style={[styles.equippedText, { color: colors.primary, fontSize: fs(12) }]}>
              {TITLE_BADGES.find(b => b.id === stats.equippedTitle)?.icon}{' '}
              {locale === 'ja'
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
              {t.yourStats}
            </Text>
            <View style={styles.statsGrid}>
              {[
                { label: t.quizzes, value: stats.quizPlayed },
                { label: t.correctAnswers, value: stats.correctAnswers },
                { label: t.questionsCreated, value: stats.questionsCreated },
                { label: t.loginDays, value: stats.loginDays },
                { label: t.maxStreak, value: stats.maxStreak },
                { label: t.books, value: stats.totalBooks },
              ].map(item => (
                <View key={item.label} style={[styles.statItem, { backgroundColor: colors.background }]}>
                  <Text style={[styles.statValue, { color: colors.primary, fontSize: fs(18) }]}>{item.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fs(11) }]}>
                    {item.label}
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
                    {locale === 'ja' ? badge.titleJa : badge.titleEn}
                  </Text>
                  {equipped && (
                    <View style={[styles.equippingTag, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.equippingTagText, { color: onPrimary, fontSize: fs(10) }]}>
                        {t.equipped}
                      </Text>
                    </View>
                  )}
                  {!unlocked && (
                    <Text style={[styles.lockIcon, { fontSize: fs(14) }]}>🔒</Text>
                  )}
                </View>
                <Text style={[styles.badgeDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>
                  {locale === 'ja' ? badge.descJa : badge.descEn}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
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

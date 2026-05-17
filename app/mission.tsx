import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import {
  MISSIONS, Mission, MissionPeriod,
  loadStats, loadProgress, saveStats, saveProgress,
  getMissionProgress, UserStats, MissionProgress,
} from './missions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

export default function MissionScreen() {
  const router = useNavigate();
  const { colors, onPrimary, scale } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const fs = (n: number) => Math.round(n * scale);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [progress, setProgress] = useState<MissionProgress[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<MissionPeriod>('daily');
  const [claimMessage, setClaimMessage] = useState('');

  useEffect(() => {
    loadStats().then(setStats);
    loadProgress().then(setProgress);
  }, []);

  const filteredMissions = MISSIONS.filter(m => m.period === selectedPeriod);

  const claimReward = async (mission: Mission) => {
    if (!stats) return;
    const p = getMissionProgress(mission, progress, stats);
    if (!p.completed || p.claimedAt) return;

    const updatedProgress = progress.map(pr =>
      pr.missionId === mission.id ? { ...pr, claimedAt: new Date().toISOString() } : pr
    );
    const updatedStats = { ...stats, totalBooks: stats.totalBooks + mission.reward };

    setProgress(updatedProgress);
    setStats(updatedStats);
    await saveProgress(updatedProgress);
    await saveStats(updatedStats);
    SoundManager.play('complete');
    setClaimMessage(locale === 'ja' ? `📚 ${mission.reward}${t.booksEarned}` : `📚 ${t.gotBooks} ${mission.reward} ${t.booksEarned}`);
    setTimeout(() => setClaimMessage(''), 2500);
  };

  const periods: MissionPeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];
  const periodLabels: Record<MissionPeriod, string> = {
    daily: t.daily,
    weekly: t.weekly,
    monthly: t.monthly,
    yearly: t.yearly,
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fs(20) }]}>
          {t.missionsTitle}
        </Text>
        {stats && (
          <Text style={[styles.books, { color: colors.primary, fontSize: fs(14) }]}>
            📚 {stats.totalBooks}
          </Text>
        )}
      </View>

      {/* Claim message */}
      {claimMessage ? (
        <View style={[styles.claimBanner, { backgroundColor: colors.success }]}>
          <Text style={[styles.claimBannerText, { fontSize: fs(14) }]}>{claimMessage}</Text>
        </View>
      ) : null}

      {/* Period tabs */}
      <View style={[styles.tabs, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {periods.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.tab, selectedPeriod === p && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => { setSelectedPeriod(p); SoundManager.play('select'); }}
          >
            <Text style={[styles.tabText, { color: selectedPeriod === p ? colors.primary : colors.textSecondary, fontSize: fs(13) }]}>
              {periodLabels[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.list}>
        {filteredMissions.map(mission => {
          const p = stats ? getMissionProgress(mission, progress, stats) : null;
          const current = p?.current ?? 0;
          const pct = Math.min((current / mission.goal) * 100, 100);
          const completed = p?.completed ?? false;
          const claimed = !!p?.claimedAt;

          return (
            <View key={mission.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.missionTitle, { color: colors.text, fontSize: fs(15) }]}>
                    {locale === 'ja' ? mission.titleJa : mission.titleEn}
                  </Text>
                  <Text style={[styles.missionDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>
                    {locale === 'ja' ? mission.descJa : mission.descEn}
                  </Text>
                </View>
                <View style={[styles.rewardBadge, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.rewardText, { color: colors.primary, fontSize: fs(12) }]}>
                    📚 +{mission.reward}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: completed ? colors.success : colors.primary }]} />
              </View>
              <Text style={[styles.progressText, { color: colors.textSecondary, fontSize: fs(11) }]}>
                {current} / {mission.goal}
              </Text>

              {/* Claim button */}
              {completed && !claimed && (
                <TouchableOpacity
                  style={[styles.claimButton, { backgroundColor: colors.success }]}
                  onPress={() => claimReward(mission)}
                >
                  <Text style={[styles.claimButtonText, { fontSize: fs(13) }]}>
                    {t.claim}
                  </Text>
                </TouchableOpacity>
              )}
              {claimed && (
                <Text style={[styles.claimedText, { color: colors.textSecondary, fontSize: fs(12) }]}>
                  {t.claimed}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? navigate(-1) : navigate("/"); }}
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
  books: { fontWeight: 'bold' },
  claimBanner: { padding: 10, alignItems: 'center' },
  claimBannerText: { color: '#fff', fontWeight: 'bold' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontWeight: '600' },
  list: { flex: 1, padding: 16 },
  card: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  missionTitle: { fontWeight: 'bold', marginBottom: 3 },
  missionDesc: { lineHeight: 18 },
  rewardBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginLeft: 8 },
  rewardText: { fontWeight: 'bold' },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { marginBottom: 8 },
  claimButton: { padding: 10, borderRadius: 8, alignItems: 'center' },
  claimButtonText: { color: '#fff', fontWeight: 'bold' },
  claimedText: { textAlign: 'center', paddingVertical: 6 },
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: 'bold' },
});

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';

export default function StatisticsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const [stats, setStats] = useState({
    screenTime: 0,          // 分単位
    questionsCreated: 0,
    quizPlayed: 0,
    correctRate: 0,         // パーセンテージ
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadWeeklyStats();
  }, []);

  const loadWeeklyStats = async () => {
    try {
      const screenTimeRaw = await AsyncStorage.getItem('weekly_screen_time_minutes');
      const screenTime = screenTimeRaw ? parseInt(screenTimeRaw, 10) : 0;

      const questionsRaw = await AsyncStorage.getItem('quiz_questions');
      const allQuestions = questionsRaw ? JSON.parse(questionsRaw) : [];
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const questionsCreated = allQuestions.filter((q: any) => q.createdAt > weekAgo).length;

      const historyRaw = await AsyncStorage.getItem('quizHistory');
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const quizPlayed = history.filter((h: any) => new Date(h.date).getTime() > weekAgo).length;

      const resultsRaw = await AsyncStorage.getItem('quizResults');
      const allResults = resultsRaw ? JSON.parse(resultsRaw) : [];
      const weekResults = allResults.filter((r: any) => new Date(r.date || Date.now()).getTime() > weekAgo);
      const correctCount = weekResults.filter((r: any) => r.isCorrect).length;
      const correctRate = weekResults.length > 0 ? Math.round((correctCount / weekResults.length) * 100) : 0;

      setStats({
        screenTime,
        questionsCreated,
        quizPlayed,
        correctRate,
      });
    } catch (error) {
      console.error('Failed to load weekly stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          📊 {locale === 'ja' ? '週間統計' : 'Weekly Stats'}
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary }]}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={[styles.backButtonText, { color: onPrimary }]}>
            {t.back}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* スクリーンタイムグラフ */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            ⏱ {locale === 'ja' ? 'スクリーンタイム' : 'Screen Time'}
          </Text>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: 36 }]}>
              {stats.screenTime}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {locale === 'ja' ? '分' : 'minutes'}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { 
              width: `${Math.min((stats.screenTime / 300) * 100, 100)}%`,
              backgroundColor: colors.primary 
            }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.textSecondary, fontSize: 12 }]}>
            {locale === 'ja' ? '目標: 300分/週' : 'Goal: 300 min/week'}
          </Text>
        </View>

        {/* 問題作成数 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            ✏️ {locale === 'ja' ? '作成した問題数' : 'Problems Created'}
          </Text>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: 36 }]}>
              {stats.questionsCreated}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {locale === 'ja' ? '問' : 'problems'}
            </Text>
          </View>
        </View>

        {/* クイズプレイ数 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            🎮 {locale === 'ja' ? 'クイズ実施回数' : 'Quiz Plays'}
          </Text>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.primary, fontSize: 36 }]}>
              {stats.quizPlayed}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {locale === 'ja' ? '回' : 'times'}
            </Text>
          </View>
        </View>

        {/* 正答率 */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            📈 {locale === 'ja' ? '正答率' : 'Correct Rate'}
          </Text>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: colors.success, fontSize: 36 }]}>
              {stats.correctRate}%
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>
              {locale === 'ja' ? '今週の平均' : 'This week'}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { 
              width: `${stats.correctRate}%`,
              backgroundColor: colors.success 
            }]} />
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  backButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  backButtonText: { fontWeight: 'bold', fontSize: 14 },
  content: { padding: 16 },
  section: { borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e0e0e0' },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  statBox: { alignItems: 'center', marginBottom: 12 },
  statValue: { fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 4 },
  progressBar: { width: '100%', height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { marginTop: 8, textAlign: 'center' },
});
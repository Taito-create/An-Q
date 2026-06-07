import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { STORAGE_KEYS } from './constants/storageKeys';
import { useQuestions } from './hooks/useQuestions';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function StatisticsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { questions: allQuestions } = useQuestions();

  const [stats, setStats] = useState({
    screenTime: 0,
    questionsCreated: 0,
    quizPlayed: 0,
    correctRate: 0,
  });
  const [screenTimeData, setScreenTimeData] = useState<number[]>([]);
  const [questionsCreatedData, setQuestionsCreatedData] = useState<number[]>([]);
  const [quizPlaysData, setQuizPlaysData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 5000);
    return () => clearInterval(interval);
  }, []);

  const getWeekLabels = () => {
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(locale === 'ja'
        ? ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
      );
    }
    return days;
  };

  const loadAllData = async () => {
    setIsLoading(true);
    await Promise.all([
      loadWeeklyStats(),
      loadWeeklyScreenTimeHistory(),
      loadWeeklyQuestionsHistory(),
      loadWeeklyQuizHistory(),
    ]);
    setIsLoading(false);
  };

  const loadWeeklyStats = async () => {
    try {
      const screenTimeRaw = await AsyncStorage.getItem(STORAGE_KEYS.WEEKLY_SCREEN_TIME);
      const screenTime = screenTimeRaw ? parseInt(screenTimeRaw, 10) : 0;

      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const questionsCreated = allQuestions.filter(q => (q.createdAt ?? 0) > weekAgo).length;

      const historyRaw = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_HISTORY);
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const quizPlayed = history.filter((h: any) => new Date(h.date).getTime() > weekAgo).length;

      const resultsRaw = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_RESULTS);
      const allResults = resultsRaw ? JSON.parse(resultsRaw) : [];
      const weekResults = allResults.filter((r: any) => new Date(r.date || Date.now()).getTime() > weekAgo);
      const correctCount = weekResults.filter((r: any) => r.isCorrect).length;
      const correctRate = weekResults.length > 0 ? Math.round((correctCount / weekResults.length) * 100) : 0;

      setStats({ screenTime, questionsCreated, quizPlayed, correctRate });
    } catch (error) {
      console.error('Failed to load weekly stats:', error);
    }
  };

  const loadWeeklyScreenTimeHistory = async () => {
    try {
      const days: number[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const minutes = await AsyncStorage.getItem(`screen_time_${dateStr}`);
        days.push(minutes ? parseInt(minutes, 10) : 0);
      }
      setScreenTimeData(days);
    } catch (e) {
      console.error('Failed to load screen time history:', e);
    }
  };

  const loadWeeklyQuestionsHistory = async () => {
    try {
      const days: number[] = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStart = date.getTime();
        const dateEnd = dateStart + 86400000;
        const count = allQuestions.filter(q => (q.createdAt ?? 0) >= dateStart && (q.createdAt ?? 0) < dateEnd).length;
        days.push(count);
      }
      setQuestionsCreatedData(days);
    } catch (e) {
      console.error('Failed to load questions history:', e);
    }
  };

  const loadWeeklyQuizHistory = async () => {
    try {
      const days: number[] = [];
      const now = new Date();
      const history = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_HISTORY) || '[]');
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStart = date.toISOString().split('T')[0];
        const count = history.filter((h: any) => h.date?.startsWith(dateStart)).length;
        days.push(count);
      }
      setQuizPlaysData(days);
    } catch (e) {
      console.error('Failed to load quiz history:', e);
    }
  };

  const weekLabels = getWeekLabels();

  // recharts 用データ変換
  const screenTimeChartData = weekLabels.map((label, i) => ({
    day: label,
    time: screenTimeData[i] || 0,
  }));

  const questionsChartData = weekLabels.map((label, i) => ({
    day: label,
    count: questionsCreatedData[i] || 0,
  }));

  const quizPlaysChartData = weekLabels.map((label, i) => ({
    day: label,
    plays: quizPlaysData[i] || 0,
  }));

  const tooltipStyle = {
    backgroundColor: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
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
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          📊 {locale === 'ja' ? '週間統計' : 'Weekly Stats'}
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary }]}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={[styles.backButtonText, { color: onPrimary }]}>{t.back}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* スクリーンタイム推移（折れ線グラフ） */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            ⏱ {locale === 'ja' ? 'スクリーンタイム推移' : 'Screen Time History'}
          </Text>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={screenTimeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="day" stroke={colors.textSecondary} tick={{ fontSize: 12 }} />
              <YAxis stroke={colors.textSecondary} tick={{ fontSize: 12 }} label={{ value: locale === 'ja' ? '分' : 'min', angle: -90, position: 'insideLeft', style: { fill: colors.textSecondary } }} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: colors.text }} />
              <Legend />
              <Line type="monotone" dataKey="time" stroke={colors.primary} strokeWidth={2} dot={{ fill: colors.primary, r: 5 }} activeDot={{ r: 7 }} name={locale === 'ja' ? 'スクリーンタイム' : 'Screen Time'} />
            </LineChart>
          </ResponsiveContainer>
          <Text style={[styles.statDetail, { color: colors.textSecondary }]}>
            {locale === 'ja' ? '今週平均' : 'Weekly avg'}: {screenTimeData.length > 0 ? Math.round(screenTimeData.reduce((a, b) => a + b, 0) / 7) : 0}{locale === 'ja' ? '分' : 'min'}
          </Text>
        </View>

        {/* 問題作成数の推移（棒グラフ） */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            ✏️ {locale === 'ja' ? '作成問題数の推移' : 'Problems Created'}
          </Text>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={questionsChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="day" stroke={colors.textSecondary} tick={{ fontSize: 12 }} />
              <YAxis stroke={colors.textSecondary} tick={{ fontSize: 12 }} label={{ value: locale === 'ja' ? '問' : '', angle: -90, position: 'insideLeft', style: { fill: colors.textSecondary } }} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: colors.text }} />
              <Legend />
              <Bar dataKey="count" fill={colors.success} radius={[8, 8, 0, 0]} name={locale === 'ja' ? '作成問題数' : 'Created'} />
            </BarChart>
          </ResponsiveContainer>
          <Text style={[styles.statDetail, { color: colors.textSecondary }]}>
            {locale === 'ja' ? '今週作成' : 'This week'}: {questionsCreatedData.reduce((a, b) => a + b, 0)}{locale === 'ja' ? '問' : ' problems'}
          </Text>
        </View>

        {/* クイズプレイ回数の推移（棒グラフ） */}
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            🎮 {locale === 'ja' ? 'クイズプレイ回数の推移' : 'Quiz Plays'}
          </Text>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={quizPlaysChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
              <XAxis dataKey="day" stroke={colors.textSecondary} tick={{ fontSize: 12 }} />
              <YAxis stroke={colors.textSecondary} tick={{ fontSize: 12 }} label={{ value: locale === 'ja' ? '回' : '', angle: -90, position: 'insideLeft', style: { fill: colors.textSecondary } }} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: colors.text }} />
              <Legend />
              <Bar dataKey="plays" fill={colors.primary} radius={[8, 8, 0, 0]} name={locale === 'ja' ? 'プレイ回数' : 'Plays'} />
            </BarChart>
          </ResponsiveContainer>
          <Text style={[styles.statDetail, { color: colors.textSecondary }]}>
            {locale === 'ja' ? '今週実施' : 'This week'}: {quizPlaysData.reduce((a, b) => a + b, 0)}{locale === 'ja' ? '回' : ' times'}
          </Text>
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
            <View style={[styles.progressFill, { width: `${stats.correctRate}%`, backgroundColor: colors.success }]} />
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
  statDetail: { fontSize: 12, marginTop: 8, textAlign: 'center' },
  progressBar: { width: '100%', height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
});
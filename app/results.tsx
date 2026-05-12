import React, { useState, useEffect } from 'react';
import {
  StyleSheet, ScrollView, TouchableOpacity,
  Alert, Text, View
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { loadStats, UserStats } from './missions';

// Type definitions
interface QuizResult {
  questionId: number;
  question: string;
  yourAnswer: boolean | number | string;
  correctAnswer: boolean | number | string;
  isCorrect: boolean;
  timeSpent?: number;
}

interface HistoryEntry {
  date: string;
  score: number;
  total: number;
  percentage: number;
}

export default function ResultsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const [results, setResults] = useState<QuizResult[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    loadData();
    loadStats().then(setStats);
  }, []);

  const loadData = async () => {
    try {
      const [resultsRaw, historyRaw] = await Promise.all([
        AsyncStorage.getItem('quizResults'),
        AsyncStorage.getItem('quizHistory'),
      ]);

      if (resultsRaw) {
        const loadedResults: QuizResult[] = JSON.parse(resultsRaw);
        setResults(loadedResults);
      }

      if (historyRaw) {
        setHistory(JSON.parse(historyRaw));
      }
    } catch (e) {
      console.error('ResultsScreen loadData error:', e);
    }
  };

  const clearResults = async () => {
    Alert.alert(t.confirmClear, t.confirmClearMsg, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.deleteAction,
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['quizResults', 'quizHistory']);
          setResults([]);
          setHistory([]);
          Alert.alert(t.complete, t.historyCleared);
        },
      },
    ]);
  };

  // Statistics calculation
  const total = results.length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const incorrectCount = total - correctCount;
  const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const totalTime = results.reduce((s, r) => s + (r.timeSpent || 0), 0);
  const avgTime = total > 0 ? Math.round(totalTime / total) : 0;

  const wrongResults = results.filter(r => !r.isCorrect);

  const getGrade = () => {
    if (pct >= 90) return { label: t.gradeExcellent, color: '#4CAF50' };
    if (pct >= 70) return { label: t.gradeGood, color: '#8BC34A' };
    if (pct >= 50) return { label: t.gradeFair, color: '#FF9800' };
    return { label: t.gradePoor, color: '#F44336' };
  };
  const grade = getGrade();

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (total === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t.noQuizResults}</Text>
        <TouchableOpacity style={styles.startBtn} onPress={() => router.push('/quiz')}>
          <Text style={styles.startBtnText}>{t.takeQuizChallenge}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/')}>
          <Text style={styles.homeLinkText}>{t.backHome}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t.quizResults}</Text>

      {/* Score Card */}
      <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
        <View style={styles.bigScore}>
          <Text style={styles.bigScoreNum}>{correctCount}</Text>
          <Text style={styles.bigScoreSlash}>/</Text>
          <Text style={styles.bigScoreTotal}>{total}</Text>
        </View>
        <Text style={styles.pctText}>{pct}% {t.correct}</Text>
        <Text style={[styles.gradeText, { color: grade.color }]}>{grade.label}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{formatTime(totalTime)}</Text>
            <Text style={styles.statLbl}>{t.timeSpent}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{avgTime}s</Text>
            <Text style={styles.statLbl}>{t.avgTimePerQuestion}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={[styles.statVal, { color: '#F44336' }]}>{incorrectCount}</Text>
            <Text style={styles.statLbl}>{t.mistakes}</Text>
          </View>
        </View>
      </View>

      {/* Wrong Questions */}
      {wrongResults.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={styles.sectionTitle}> ⚠️ {t.questionsToReview}</Text>
          {wrongResults.map((r, i) => (
            <View key={i} style={styles.wrongCard}>
              <Text style={styles.wrongQuestion}>{r.question}</Text>
              <Text style={styles.correctHint}>
                {t.correctAnswer}: {typeof r.correctAnswer === 'boolean' ? (r.correctAnswer ? '○' : '✕') : String(r.correctAnswer)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* All Answers Detail */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <TouchableOpacity style={styles.toggleHeader} onPress={() => setShowAll(!showAll)}>
          <Text style={styles.sectionTitle}>{t.viewAllAnswers}</Text>
          <Text style={styles.toggleArrow}>{showAll ? `▲ ${t.hide}` : `▼ ${t.expand}`}</Text>
        </TouchableOpacity>

        {showAll && results.map((r, i) => (
          <View key={i} style={[styles.resultItem, r.isCorrect ? styles.resultCorrect : styles.resultWrong]}>
            <Text style={styles.resultQuestion}>Q{i+1}: {r.question}</Text>
            <Text style={[styles.resultStatus, { color: r.isCorrect ? '#4CAF50' : '#F44336' }]}>
              {r.isCorrect 
                ? `${t.correct} ○` 
                : `${t.incorrect} ✕ (${t.correctAnswer}: ${typeof r.correctAnswer === 'boolean' ? (r.correctAnswer ? '○' : '✕') : String(r.correctAnswer)})`}
            </Text>
          </View>
        ))}
      </View>

      {/* Tag Performance */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={styles.sectionTitle}>🏷️ {t.tagPerformance}</Text>
        {stats && Object.keys(stats.tagStats || {}).length > 0 ? (
          Object.entries(stats.tagStats).map(([tag, data]) => {
            const tagPct = Math.round((data.correct / data.total) * 100);
            return (
              <View key={tag} style={styles.historyRow}>
                <Text style={[styles.historyDate, { color: colors.text }]} numberOfLines={1}>{tag}</Text>
                <View style={styles.historyBar}>
                  <View style={[styles.historyFill, { width: `${tagPct}%`, backgroundColor: colors.primary }]} />
                </View>
                <Text style={[styles.historyPct, { color: colors.text }]}>{tagPct}% ({data.correct}/{data.total})</Text>
              </View>
            );
          })
        ) : (
          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{t.noTagStats}</Text>
        )}
      </View>

      {/* History Graph */}
      {history.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={styles.sectionTitle}> 📊 {t.progressHistory}</Text>
          {history.map((h, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.historyDate}>{h.date}</Text>
              <View style={styles.historyBar}>
                <View style={[styles.historyFill, { width: `${h.percentage}%` }]} />
              </View>
              <Text style={styles.historyPct}>{h.percentage}%</Text>
            </View>
          ))}
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/quiz')}>
          <Text style={styles.primaryBtnText}>{t.takeAgain}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push('/')}>
          <Text style={styles.secondaryBtnText}>{t.backHome}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dangerBtn} onPress={clearResults}>
          <Text style={styles.dangerBtnText}>{t.deleteAllHistory}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 50 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#1A1A1A' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, paddingTop: 100 },
  emptyEmoji: { fontSize: 60, marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#888', marginBottom: 20 },
  startBtn: { backgroundColor: '#4CAF50', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12, marginBottom: 20 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  homeLinkText: { color: '#007AFF', fontSize: 14 },
  summaryCard: { 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 25, 
    marginBottom: 20, 
    alignItems: 'center', 
    elevation: 5, 
  },
  bigScore: { flexDirection: 'row', alignItems: 'baseline' },
  bigScoreNum: { fontSize: 60, fontWeight: 'bold', color: '#007AFF' },
  bigScoreSlash: { fontSize: 30, color: '#CCC', marginHorizontal: 5 },
  bigScoreTotal: { fontSize: 30, color: '#999' },
  pctText: { fontSize: 22, fontWeight: '600', color: '#444' },
  gradeText: { fontSize: 18, fontWeight: 'bold', marginVertical: 10, textAlign: 'center' },
  statsRow: { flexDirection: 'row', marginTop: 20, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 20, width: '100%', justifyContent: 'space-around' },
  statBox: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: 'bold' },
  statLbl: { fontSize: 12, color: '#888' },
  statDivider: { width: 1, height: 30, backgroundColor: '#EEE' },
  section: { backgroundColor: '#fff', borderRadius: 15, padding: 15, marginBottom: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  wrongCard: { backgroundColor: '#FFF5F5', padding: 12, borderRadius: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#F44336' },
  wrongQuestion: { fontSize: 14, color: '#333', marginBottom: 5 },
  correctHint: { fontSize: 13, fontWeight: 'bold', color: '#F44336' },
  toggleHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  toggleArrow: { color: '#007AFF', fontWeight: 'bold' },
  resultItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  resultCorrect: { backgroundColor: '#F9FFF9' },
  resultWrong: { backgroundColor: '#FFF9F9' },
  resultQuestion: { fontSize: 14, color: '#444' },
  resultStatus: { fontSize: 12, fontWeight: 'bold', marginTop: 3 },
  historyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  historyDate: { fontSize: 10, color: '#888', width: 80 },
  historyBar: { flex: 1, height: 8, backgroundColor: '#EEE', borderRadius: 4, overflow: 'hidden', marginHorizontal: 10 },
  historyFill: { height: '100%', backgroundColor: '#007AFF' },
  historyPct: { fontSize: 12, fontWeight: 'bold', width: 35 },
  actions: { gap: 12 },
  primaryBtn: { backgroundColor: '#007AFF', padding: 18, borderRadius: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  secondaryBtn: { backgroundColor: '#4CAF50', padding: 18, borderRadius: 15, alignItems: 'center' },
  secondaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dangerBtn: { marginTop: 10, padding: 10, alignItems: 'center' },
  dangerBtnText: { color: '#FF3B30', fontSize: 13 },
});

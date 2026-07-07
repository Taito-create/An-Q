import React, { useState, useEffect } from 'react';
import {
  StyleSheet, ScrollView, TouchableOpacity,
  Alert, Text, View
} from 'react-native';
import { useNavigate, useLocation } from 'react-router-dom';
import { SoundManager } from './sound';
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
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const [results, setResults] = useState<QuizResult[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        await loadData();
        const loaded = await loadStats();
        if (isMounted) setStats(loaded);
      } finally {
        // 一瞬表示防止
        setTimeout(() => {
          if (isMounted) setIsLoading(false);
        }, 100);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, []);


  const appendHistory = async (loadedResults: QuizResult[], existingHistoryRaw: string | null) => {
    const total = loadedResults.length;
    const score = loadedResults.filter(r => r.isCorrect).length;
    const percentage = Math.round((score / total) * 100);
    const entry: HistoryEntry = {
      date: new Date().toLocaleDateString(),
      score,
      total,
      percentage,
    };
    const existing: HistoryEntry[] = existingHistoryRaw ? JSON.parse(existingHistoryRaw) : [];
    existing.push(entry);
    await AsyncStorage.setItem('quizHistory', JSON.stringify(existing));
    setHistory(existing);
  };

  const loadData = async () => {
    try {
      // ✅ location.state を優先
      if (location.state?.results) {
        const loadedResults: QuizResult[] = location.state.results;
        setResults(loadedResults);

        // history の更新
        const historyRaw = await AsyncStorage.getItem('quizHistory');
        await appendHistory(loadedResults, historyRaw);
        return;
      }

      // 従来の AsyncStorage 読み込み（フォールバック）
      const [resultsRaw, historyRaw] = await Promise.all([
        AsyncStorage.getItem('quizResults'),
        AsyncStorage.getItem('quizHistory'),
      ]);

      if (resultsRaw) {
        const parsed = JSON.parse(resultsRaw);
        // Support both old format (array) and new format ({ results, total, score })
        const loadedResults: QuizResult[] = Array.isArray(parsed) ? parsed : (parsed.results || []);
        setResults(loadedResults);
        if (loadedResults.length > 0) {
          await appendHistory(loadedResults, historyRaw);
        }
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

  // Statistics calculation (use state from navigation if available)
  const total = location.state?.total || results.length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const incorrectCount = results.length - correctCount;
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

  if (isLoading) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{'読み込み中...'}</Text>
      </View>
    );
  }

  if (total === 0) {

    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={styles.emptyEmoji}>📊</Text>
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t.noQuizResults}</Text>
        <TouchableOpacity style={styles.startBtn} onPress={() => navigate('/quiz')}>
          <Text style={styles.startBtnText}>{t.takeQuizChallenge}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigate('/')}>
          <Text style={[styles.homeLinkText, { color: colors.primary }]}>{t.backHome}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t.quizResults}</Text>

      {/* Score Card */}
      <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
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
            <Text style={[styles.statLbl, { color: colors.textSecondary }]}>{t.timeSpent}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statVal}>{avgTime}s</Text>
            <Text style={[styles.statLbl, { color: colors.textSecondary }]}>{t.avgTimePerQuestion}</Text>
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
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Text style={[styles.sectionTitle, { color: colors.text }]}> ⚠️ {t.questionsToReview}</Text>
          {wrongResults.map((r, i) => (
            <View key={i} style={[styles.wrongCard, { backgroundColor: colors.error + '15', borderLeftColor: colors.error, borderColor: colors.border }]}> 
              <Text style={styles.wrongQuestion}>{r.question}</Text>
              <Text style={styles.correctHint}>
                {t.correctAnswer}: {typeof r.correctAnswer === 'boolean' ? (r.correctAnswer ? '○' : '✕') : String(r.correctAnswer)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* All Answers Detail */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}> 
        <TouchableOpacity style={styles.toggleHeader} onPress={() => setShowAll(!showAll)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t.viewAllAnswers}</Text>
          <Text style={styles.toggleArrow}>{showAll ? `▲ ${t.hide}` : `▼ ${t.expand}`}</Text>
        </TouchableOpacity>

        {showAll && results.map((r, i) => (
          <View key={i} style={[styles.resultItem, { backgroundColor: r.isCorrect ? colors.success + '15' : colors.error + '15', borderColor: colors.border }]}> 
            <Text style={styles.resultQuestion}>Q{i+1}: {r.question}</Text>
            <Text style={[styles.resultStatus, { color: r.isCorrect ? '#4CAF50' : '#F44336' }]}>
              {r.isCorrect 
                ? `${t.correct} ○` 
                : `${t.incorrect} ✕ (${t.correctAnswer}: ${typeof r.correctAnswer === 'boolean' ? (r.correctAnswer ? '○' : '✕') : String(r.correctAnswer)})`}
            </Text>
          </View>
        ))}
      </View>

      {/* アクションボタン */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]} 
          onPress={() => {
            SoundManager.play('decide');
            navigate('/quiz');
          }}
        >
          <Text style={[styles.primaryBtnText, { color: onPrimary }]}>
            {locale === 'ja' ? 'もういちどプレイする' : 'Play Again'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.secondaryBtn, { backgroundColor: colors.primary }]} 
          onPress={() => {
            SoundManager.play('decide');
            navigate('/');
          }}
        >
          <Text style={[styles.secondaryBtnText, { color: onPrimary }]}>{t.backHome}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 32, gap: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, letterSpacing: 0.2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  emptyEmoji: { fontSize: 60, marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#888', marginBottom: 20, textAlign: 'center' },
  startBtn: { paddingVertical: 16, paddingHorizontal: 40, borderRadius: 14, marginBottom: 16, minWidth: 180, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  homeLinkText: { fontSize: 14 },
  summaryCard: { 
    borderRadius: 22, 
    padding: 24, 
    marginBottom: 6, 
    alignItems: 'center', 
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5, 
  },
  bigScore: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  bigScoreNum: { fontSize: 64, fontWeight: 'bold', color: '#2563EB' },
  bigScoreSlash: { fontSize: 30, color: '#CBD5E1', marginHorizontal: 6 },
  bigScoreTotal: { fontSize: 32, color: '#64748B', fontWeight: '600' },
  pctText: { fontSize: 22, fontWeight: '700', color: '#334155', marginBottom: 6 },
  gradeText: { fontSize: 18, fontWeight: 'bold', marginVertical: 12, textAlign: 'center' },
  statsRow: { flexDirection: 'row', marginTop: 18, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 18, width: '100%', justifyContent: 'space-around', gap: 10 },
  statBox: { alignItems: 'center', flex: 1, paddingHorizontal: 6 },
  statVal: { fontSize: 19, fontWeight: 'bold', textAlign: 'center' },
  statLbl: { fontSize: 12 },
  statDivider: { width: 1, height: 34, backgroundColor: '#E2E8F0' },
  section: { borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 14, letterSpacing: 0.2 },
  wrongCard: { padding: 16, borderRadius: 16, marginBottom: 12, borderLeftWidth: 4, borderWidth: 1 },
  wrongQuestion: { fontSize: 14, color: '#334155', marginBottom: 6, lineHeight: 21 },
  correctHint: { fontSize: 13, fontWeight: 'bold', color: '#F44336' },
  toggleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  toggleArrow: { color: '#007AFF', fontWeight: 'bold' },
  resultItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', borderRadius: 14, marginBottom: 10, borderWidth: 1 },
  resultCorrect: {},
  resultWrong: {},
  resultQuestion: { fontSize: 14, color: '#334155', lineHeight: 21, marginBottom: 4 },
  resultStatus: { fontSize: 12, fontWeight: 'bold', marginTop: 4 },
  actions: { gap: 14, paddingTop: 4 },
  primaryBtn: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', minHeight: 54 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  secondaryBtn: { paddingVertical: 16, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', minHeight: 54 },
  secondaryBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dangerBtn: { marginTop: 10, padding: 10, alignItems: 'center' },
  dangerBtnText: { color: '#FF3B30', fontSize: 13 },
});

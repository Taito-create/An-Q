import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, ScrollView, TouchableOpacity,
  Alert, Text, View, TextInput
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────
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

interface QuizFeedback {
  rating: number;
  memo: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timestamp: number;
}

// ──────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────
export default function FeedbackScreen() {
  const router = useNavigate();
  const { colors } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  
  const [results, setResults] = useState<QuizResult[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  
  const [rating, setRating] = useState(0);
  const [memo, setMemo] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  // ✅ useCallback でメモ化して無限ループを防止
  const loadData = useCallback(async () => {
    try {
      // データの読み込み
      const [resultsRaw, historyRaw] = await Promise.all([
        AsyncStorage.getItem('quizResults'),
        AsyncStorage.getItem('quizHistory'),
      ]);

      if (resultsRaw) {
        const loadedResults: QuizResult[] = JSON.parse(resultsRaw);
        setResults(loadedResults);

        // 履歴への追加処理（この画面が開かれた時に一度だけ実行）
        if (loadedResults.length > 0) {
          await appendHistory(loadedResults, historyRaw);
        }
      }

      if (historyRaw) {
        setHistory(JSON.parse(historyRaw));
      }
    } catch (e) {
      console.error('FeedbackScreen loadData error:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]); // ✅ 正しい依存配列

  const appendHistory = async (currentResults: QuizResult[], historyRaw: string | null) => {
    try {
      const history: HistoryEntry[] = historyRaw ? JSON.parse(historyRaw) : [];
      const correct = currentResults.filter(r => r.isCorrect).length;
      const total = currentResults.length;
      
      const now = new Date();
      // 時間まで含めると重複しにくいため、表示用とは別に管理
      const timestamp = now.getTime(); 
      const dateLabel = `${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      const pct = Math.round((correct / total) * 100);

      // 直近の履歴と同じ結果なら追加しない（リロード対策）
      if (history.length > 0 && 
          history[0].score === correct && 
          history[0].total === total &&
          history[0].date.includes(`${now.getMonth() + 1}/${now.getDate()}`)) {
        return;
      }

      const newHistory = [{ date: dateLabel, score: correct, total, percentage: pct }, ...history];
      const trimmed = newHistory.slice(0, 10); // 最新10件
      
      await AsyncStorage.setItem('quizHistory', JSON.stringify(trimmed));
      setHistory(trimmed);
    } catch (e) {
      console.error('appendHistory error:', e);
    }
  };

  const submitFeedback = async () => {
    if (rating === 0) {
      Alert.alert(t.pleaseRate, t.selectRating);
      return;
    }

    try {
      const feedback: QuizFeedback = {
        rating,
        memo,
        difficulty,
        timestamp: Date.now()
      };

      // Save feedback to AsyncStorage
      const existingFeedback = await AsyncStorage.getItem('quizFeedbacks');
      const feedbacks = existingFeedback ? JSON.parse(existingFeedback) : [];
      feedbacks.unshift(feedback);
      
      // Keep only last 50 feedbacks
      const trimmedFeedbacks = feedbacks.slice(0, 50);
      await AsyncStorage.setItem('quizFeedbacks', JSON.stringify(trimmedFeedbacks));

      setFeedbackSubmitted(true);
      setShowFeedbackForm(false);
      Alert.alert(t.thankYou, t.feedbackSaved, [
        { text: t.quizResults, onPress: () => navigate('/results') },
        { text: t.home, onPress: () => navigate('/') }
      ]);
    } catch (error) {
      console.error('Failed to save feedback:', error);
      Alert.alert(t.error, t.failedToSave);
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

  // ──── 統計計算 ────
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
        <Text style={styles.emptyEmoji}>📋</Text>
        <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{t.noResultsYet}</Text>
        <TouchableOpacity style={styles.startBtn} onPress={() => navigate('/quiz')}>
          <Text style={styles.startBtnText}>{t.takeQuizChallenge}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigate('/')}>
          <Text style={styles.homeLinkText}>{t.backHome}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>{t.quizPerformance}</Text>

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

      {/* Feedback Section */}
      {!feedbackSubmitted && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <TouchableOpacity 
            style={styles.feedbackToggle} 
            onPress={() => setShowFeedbackForm(!showFeedbackForm)}
          >
            <Text style={styles.feedbackToggleText}>{t.howWasQuiz}</Text>
            <Text style={styles.feedbackToggleArrow}>{showFeedbackForm ? t.hide : t.expand}</Text>
          </TouchableOpacity>

          {showFeedbackForm && (
            <View style={styles.feedbackForm}>
              <Text style={styles.feedbackTitle}>{t.rateThisQuiz}</Text>
              
              {/* Star Rating */}
              <View style={styles.starContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity
                    key={star}
                    onPress={() => setRating(star)}
                    style={styles.starButton}
                  >
                    <Text style={[
                      styles.starText,
                      star <= rating ? styles.starActive : styles.starInactive
                    ]}>
                      {star <= rating ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Difficulty Selection */}
              <Text style={styles.difficultyLabel}>{t.difficulty}</Text>
              <View style={styles.difficultyContainer}>
                {(['easy', 'medium', 'hard'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.difficultyButton,
                      difficulty === level && styles.difficultyActive
                    ]}
                    onPress={() => setDifficulty(level)}
                  >
                    <Text style={[
                      styles.difficultyText,
                      difficulty === level && styles.difficultyTextActive
                    ]}>
                      {level === 'easy' ? t.easy : level === 'medium' ? t.medium : t.hard}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Memo Input */}
              <Text style={styles.memoLabel}>{t.comments}</Text>
              <TextInput
                style={styles.memoInput}
                value={memo}
                onChangeText={setMemo}
                placeholder={t.tellUsThoughts}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Submit Button */}
              <TouchableOpacity 
                style={[styles.submitFeedbackBtn, rating === 0 && styles.submitFeedbackBtnDisabled]}
                onPress={submitFeedback}
                disabled={rating === 0}
              >
                <Text style={styles.submitFeedbackBtnText}>{t.submitFeedback}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {feedbackSubmitted && (
        <View style={styles.feedbackThankYou}>
          <Text style={styles.feedbackThankYouText}>{t.thankYouFeedback}</Text>
        </View>
      )}

      {wrongResults.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={styles.sectionTitle}>⚠️ {t.questionsToReview}</Text>
          {wrongResults.map((r, i) => (
            <View key={i} style={styles.wrongCard}>
              <Text style={styles.wrongQuestion}>{r.question}</Text>
              <Text style={styles.correctHint}>
                {t.correctAnswer}: {typeof r.correctAnswer === 'boolean' ? (r.correctAnswer ? '○' : '×') : String(r.correctAnswer)}
              </Text>
            </View>
          ))}
        </View>
      )}

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
                : `${t.incorrect} × (${t.correctAnswer}: ${typeof r.correctAnswer === 'boolean' ? (r.correctAnswer ? '○' : '×') : String(r.correctAnswer)})`}
            </Text>
          </View>
        ))}
      </View>

      {history.length > 0 && (
        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <Text style={styles.sectionTitle}>📈 {t.progressHistory}</Text>
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

      {/* ボタン */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigate('/quiz')}>
          <Text style={styles.primaryBtnText}>{t.takeAgain}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigate('/')}>
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
  
  // Feedback Form Styles
  feedbackToggle: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 15, 
    backgroundColor: '#F0F8FF', 
    borderRadius: 10 
  },
  feedbackToggleText: { fontSize: 16, fontWeight: '600', color: '#007AFF' },
  feedbackToggleArrow: { fontSize: 14, color: '#007AFF', fontWeight: 'bold' },
  feedbackForm: { padding: 20, backgroundColor: '#FAFAFA', borderRadius: 10, marginTop: 10 },
  feedbackTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#333' },
  starContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 20 },
  starButton: { padding: 5, marginHorizontal: 5 },
  starText: { fontSize: 30 },
  starActive: { color: '#FFD700' },
  starInactive: { color: '#DDD' },
  difficultyLabel: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: '#333' },
  difficultyContainer: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  difficultyButton: { 
    paddingVertical: 8, 
    paddingHorizontal: 20, 
    borderRadius: 20, 
    backgroundColor: '#E0E0E0' 
  },
  difficultyActive: { backgroundColor: '#007AFF' },
  difficultyText: { fontSize: 14, fontWeight: '600', color: '#666' },
  difficultyTextActive: { color: '#FFF' },
  memoLabel: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: '#333' },
  memoInput: { 
    borderWidth: 1, 
    borderColor: '#DDD', 
    borderRadius: 8, 
    padding: 12, 
    fontSize: 14, 
    backgroundColor: '#FFF', 
    minHeight: 80, 
    marginBottom: 20 
  },
  submitFeedbackBtn: { 
    backgroundColor: '#007AFF', 
    padding: 15, 
    borderRadius: 10, 
    alignItems: 'center' 
  },
  submitFeedbackBtnDisabled: { backgroundColor: '#CCC' },
  submitFeedbackBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  feedbackThankYou: { 
    padding: 20, 
    backgroundColor: '#E8F5E8', 
    borderRadius: 10, 
    alignItems: 'center' 
  },
  feedbackThankYouText: { 
    fontSize: 16, 
    color: '#4CAF50', 
    textAlign: 'center', 
    fontWeight: '600' 
  },
});

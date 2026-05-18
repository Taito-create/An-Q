import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, TouchableOpacity, Alert,
  ScrollView, Text, View, Animated, TextInput
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { incrementStat, recordQuizAnswers } from './missions';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────
interface Question {
  id: number;
  question: string;
  answer: boolean;
  enabled: boolean;
  tags: string[];
  mistakeCount: number;
  createdAt: number;
  answerType: 'descriptive' | 'truefalse' | 'multiple';
  descriptiveAnswer?: string;
  trueFalseAnswer?: boolean;
  multipleChoice?: {
    options: string[];
    correctAnswer: number;
  };
  topic?: string;
  source?: string;
}

interface QuizResult {
  questionId: number;
  question: string;
  yourAnswer: boolean | number | string;
  correctAnswer: boolean | number | string;
  isCorrect: boolean;
  timeSpent: number;
}

interface UserAnswer {
  question: string;
  yourAnswer: boolean | number | string;
  correctAnswer: boolean | number | string;
  isCorrect: boolean;
}

// ──────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────
export default function QuizScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  // クイズ全体の状態
  const [quizStarted, setQuizStarted] = useState(false);
  const [enabledQuestions, setEnabledQuestions] = useState<Question[]>([]);
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [answered, setAnswered] = useState(false); // 二度押し防止
  const [results, setResults] = useState<QuizResult[]>([]);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isAnswered, setIsAnswered] = useState(false);
  const [userDescriptiveAnswer, setUserDescriptiveAnswer] = useState('');

  // タイマー
  const [timerLimit, setTimerLimit] = useState(180); // 秒
  const [timeLeft, setTimeLeft] = useState(180);
  const [isTimerActive, setIsTimerActive] = useState(false);

  // 問題ごとのストップウォッチ
  const questionStartTime = useRef<number>(Date.now());

  // フィードバックアニメ
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ──────────────────────────────────────────────
  // 初期ロード
  // ──────────────────────────────────────────────
  useEffect(() => {
    loadQuestions();
    loadTimerSetting();
    SoundManager.initialize();
  }, []);

  const loadQuestions = async () => {
    try {
      const raw = await AsyncStorage.getItem('quiz_questions');
      if (raw) {
        const all: any[] = JSON.parse(raw);
        // CreateQuestionScreenで保存されたデータ構造に対応
        const processedQuestions = all
          .filter((q: any) => {
            // Filter out old format questions
            if (!q.answerType) {
              console.log('Skipping old format question:', q);
              return false;
            }
            return true;
          })
          .map((q: any) => {
            let answer: boolean;
            if (q.answerType === 'truefalse') {
              answer = q.trueFalseAnswer;
            } else if (q.answerType === 'multiple') {
              answer = q.multipleChoice?.correctAnswer === 0;
            } else {
              answer = true; // descriptive case
            }
            return { 
              ...q, 
              answer,
              tags: q.tags || [],
              mistakeCount: q.mistakeCount || 0,
              createdAt: q.createdAt || Date.now(),
              source: q.source,
              topic: q.topic,
              answerType: q.answerType,
              descriptiveAnswer: q.descriptiveAnswer,
              trueFalseAnswer: q.trueFalseAnswer,
              multipleChoice: q.multipleChoice
            };
          });
        setEnabledQuestions(processedQuestions.filter(q => q.enabled !== false));
      } else {
        // Initial sample questions
        setEnabledQuestions([
          { 
            id: 1, 
            question: 'Earth orbits around the Sun.', 
            answer: true, 
            enabled: true,
            tags: ['Science', 'Basic'],
            mistakeCount: 0,
            createdAt: Date.now(),
            answerType: 'truefalse',
            trueFalseAnswer: true
          },
          { 
            id: 2, 
            question: 'Sound travels through vacuum.', 
            answer: false, 
            enabled: true,
            tags: ['Science', 'Physics'],
            mistakeCount: 0,
            createdAt: Date.now(),
            answerType: 'truefalse',
            trueFalseAnswer: false
          },
          { 
            id: 3, 
            question: 'JavaScript is a programming language.', 
            answer: true, 
            enabled: true,
            tags: ['Programming', 'Basic'],
            mistakeCount: 0,
            createdAt: Date.now(),
            answerType: 'truefalse',
            trueFalseAnswer: true
          },
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTimerSetting = async () => {
    try {
      const saved = await AsyncStorage.getItem('APP_TIMER_SETTING');
      if (saved) {
        const minutes = parseInt(saved);
        const secs = minutes * 60;
        setTimerLimit(secs);
        setTimeLeft(secs);
      }
    } catch (e) {
      console.error('Failed to load timer setting:', e);
    }
  };

  // ──────────────────────────────────────────────
  // カウントダウンタイマー
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerActive) return;
    if (timeLeft <= 0) {
      setIsTimerActive(false);
      handleTimeUp();
      return;
    }
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [isTimerActive, timeLeft]);

  const handleTimeUp = () => {
    setIsTimerActive(false);
    setShowReview(true);
    Alert.alert(
      '⏰ ' + t.timeUp, 
      `${t.currentScore}: ${score} / ${shuffledQuestions.length}`,
      [
        { text: t.viewDetails, onPress: () => setShowReview(true) },
        { text: t.home, onPress: () => navigate('/') },
      ]
    );
  };

  // ──────────────────────────────────────────────
  // クイズ開始
  // ──────────────────────────────────────────────
  const startQuiz = () => {
    if (enabledQuestions.length === 0) {
      SoundManager.play('select');
      Alert.alert('問題がありません', '「問題を作る」から問題を追加してください。', [
        { text: 'OK' },
      ]);
      return;
    }
    SoundManager.play('decide');
    const shuffled = [...enabledQuestions].sort(() => Math.random() - 0.5);
    setShuffledQuestions(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setResults([]);
    setUserAnswers([]);
    setShowFeedback(false);
    setAnswered(false);
    setTimeLeft(timerLimit);
    setQuizStarted(true);
    setIsTimerActive(true);
    setShowReview(false);
    questionStartTime.current = Date.now();
  };

  // ──────────────────────────────────────────────
  // 回答処理
  // ──────────────────────────────────────────────
  const handleAnswer = async (answer: boolean | number | string) => {
    if (answered) return; 
    setAnswered(true);

    const elapsed = Math.round((Date.now() - questionStartTime.current) / 1000);
    const currentQuestion = shuffledQuestions[currentIndex];
    
    let actualCorrectAnswer: boolean | number | string = currentQuestion.answer;
    let correct: boolean;
    switch (currentQuestion.answerType) {
      case 'truefalse':
        correct = answer === currentQuestion.trueFalseAnswer;
        actualCorrectAnswer = currentQuestion.trueFalseAnswer ?? false;
        break;
      case 'multiple':
        correct = answer === currentQuestion.multipleChoice?.correctAnswer;
        actualCorrectAnswer = currentQuestion.multipleChoice?.correctAnswer ?? 0;
        break;
      case 'descriptive':
        correct = ((answer as string).trim().toLowerCase() === 
                   currentQuestion.descriptiveAnswer?.toLowerCase());
        actualCorrectAnswer = currentQuestion.descriptiveAnswer ?? '';
        break;
    }

    // Play sound effect based on answer
    SoundManager.play(correct ? 'correct' : 'wrong');

    const newResult: QuizResult = {
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      yourAnswer: answer,
      correctAnswer: actualCorrectAnswer,
      isCorrect: correct,
      timeSpent: elapsed,
    };

    const updatedResults = [...results, newResult];
    setResults(updatedResults);
    
    // Add to user answers for review
    const answerData: UserAnswer = {
      question: currentQuestion.question,
      yourAnswer: answer,
      correctAnswer: actualCorrectAnswer,
      isCorrect: correct
    };
    setUserAnswers(prev => [...prev, answerData]);
    
    // Clear descriptive input after answering
    if (currentQuestion.answerType === 'descriptive') {
      setUserDescriptiveAnswer('');
    }
    
    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) setScore(s => s + 1);

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const isLast = currentIndex >= shuffledQuestions.length - 1;
    const delay = correct ? 1000 : 2500; // 不正解時は復習のために長く

    setTimeout(async () => {
      if (isLast) {
        setIsTimerActive(false);
        await finishQuiz(updatedResults, correct ? score + 1 : score);
      } else {
        setCurrentIndex(i => i + 1);
        setShowFeedback(false);
        setAnswered(false);
        questionStartTime.current = Date.now();
        // Play question sound for next question
        SoundManager.play('question');
      }
    }, delay);
  };

  // ──────────────────────────────────────────────
  // クイズ終了
  // ──────────────────────────────────────────────
  const finishQuiz = async (finalResults: QuizResult[], finalScore: number) => {
    try {
      await AsyncStorage.setItem('quizResults', JSON.stringify(finalResults));
      await updateStreak();

      // 連続正解・タグ別成績を記録
      const answers = finalResults.map(r => ({
        isCorrect: r.isCorrect,
        tags: shuffledQuestions.find(q => q.id === r.questionId)?.tags ?? [],
      }));
      await recordQuizAnswers(answers);

      const pct = Math.round((finalScore / shuffledQuestions.length) * 100);
      setShowReview(true);
      setIsTimerActive(false);

      Alert.alert(
        t.finished,
        `${t.score}: ${finalScore} / ${shuffledQuestions.length}（${pct}%）`,
        [
          { text: t.viewDetails, onPress: () => setShowReview(true) },
          { text: t.shareFeedback, onPress: () => navigate('/feedback') },
          { text: t.viewResults, onPress: () => navigate('/results') },
          { text: t.home, onPress: () => navigate('/') },
        ]
      );
    } catch (e) {
      console.error('finishQuiz error:', e);
      navigate('/');
    }
  };

  const updateStreak = async () => {
    try {
      const today = new Date().toDateString();
      const lastStudy = await AsyncStorage.getItem('lastStudyDate');
      const streakRaw = await AsyncStorage.getItem('streakCount');
      let streak = parseInt(streakRaw || '0');

      if (lastStudy === today) return;

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastStudy === yesterday.toDateString()) {
        streak += 1;
      } else {
        streak = 1;
      }

      await AsyncStorage.setItem('streakCount', String(streak));
      await AsyncStorage.setItem('lastStudyDate', today);
    } catch (e) {
      console.error('updateStreak error:', e);
    }
  };

  // ──────────────────────────────────────────────
  // UIパーツ
  // ──────────────────────────────────────────────// UI parts
  const timerColor = timeLeft > timerLimit * 0.4 ? '#4CAF50' : timeLeft > timerLimit * 0.2 ? '#FF9800' : '#F44336';
  const progressPercent = Math.round(((currentIndex) / shuffledQuestions.length) * 100);
  const timeMin = Math.floor(timeLeft / 60);
  const timeSec = timeLeft % 60;
  const currentQuestion = shuffledQuestions[currentIndex];

  // Play question sound when question changes
  useEffect(() => {
    if (currentQuestion && quizStarted) {
      SoundManager.play('question');
    }
  }, [currentIndex]);

  if (!quizStarted) {
    const minutes = Math.floor(timerLimit / 60);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>{t.availableQuestions}: {enabledQuestions.length}</Text>
        <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>{t.timeLimit}: {minutes}{t.minutes}</Text>
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t.questionCount}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{enabledQuestions.length} {locale === 'ja' ? '問' : ''}</Text></View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t.timeLimit}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{minutes} {t.minutes}</Text></View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.infoRow}><Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t.randomOrder}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{t.randomOrder}</Text></View>
        </View>
        <TouchableOpacity style={[styles.startButton, { backgroundColor: colors.primary }]} onPress={startQuiz}>
          <Text style={[styles.startButtonText, { color: onPrimary }]}>{t.startQuizButton}</Text>
        </TouchableOpacity>
        {/* 戻るボタン：フルワイド固定 */}
        <TouchableOpacity
          style={[styles.backButtonFull, { backgroundColor: colors.primary }]}
          onPress={() => navigate('/')}
        >
          <Text style={[styles.backButtonFullText, { color: onPrimary }]}>{t.back}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Review Screen
  if (showReview) {
    return (
      <ScrollView style={[styles.quizContainer, { backgroundColor: colors.background }]} contentContainerStyle={styles.quizContent}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewTitle}>{t.review}</Text>
          <TouchableOpacity 
            style={[styles.backButtonFull, { backgroundColor: colors.primary }]}
            onPress={() => navigate('/')}
          >
            <Text style={[styles.backButtonFullText, { color: onPrimary }]}>{t.backToHome}</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.reviewList}>
          {userAnswers.map((answer, index) => (
            <View key={index} style={[
              styles.reviewItem,
              { backgroundColor: answer.isCorrect ? '#E8F5E8' : '#FFEBEE' }
            ]}>
              <View style={styles.reviewItemHeader}>
                <Text style={styles.reviewQuestionNumber}>{t.questionNumber} {index + 1}</Text>
                <Text style={[
                  styles.reviewResult,
                  { color: answer.isCorrect ? '#4CAF50' : '#F44336' }
                ]}>
                  {answer.isCorrect ? t.correct : t.incorrect}
                </Text>
              </View>
              
              <Text style={styles.reviewQuestionText}>{answer.question}</Text>
              
              <View style={styles.reviewAnswers}>
                <View style={styles.reviewAnswerItem}>
                  <Text style={styles.reviewAnswerLabel}>{t.yourAnswer}:</Text>
                  <Text style={styles.reviewAnswerValue}>{String(answer.yourAnswer)}</Text>
                </View>
                <View style={styles.reviewAnswerItem}>
                  <Text style={styles.reviewAnswerLabel}>{t.correctAnswer}:</Text>
                  <Text style={styles.reviewAnswerValue}>{String(answer.correctAnswer)}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={[styles.quizContainer, { backgroundColor: colors.background }]} contentContainerStyle={styles.quizContent}>
      <View style={styles.topBar}>
        <Text style={[styles.timer, { color: timerColor }]}>{timeMin}:{String(timeSec).padStart(2, '0')}</Text>        <TouchableOpacity style={styles.pauseBtn} onPress={() => {
          SoundManager.play('decide');
          setIsTimerActive(a => !a);
        }}>
          <Text style={[styles.pauseBtnText, { pointerEvents: 'auto' }]}>{isTimerActive ? t.pause : t.resume}</Text>
        </TouchableOpacity>
        <Text style={[styles.questionCounter, { color: colors.textSecondary }]}>{currentIndex + 1} / {shuffledQuestions.length}</Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: colors.primary }]} />
      </View>

      <View style={[styles.questionBox, { backgroundColor: colors.primary + '15', borderColor: colors.border }]}>
        {currentQuestion.topic && <Text style={[styles.topicBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{currentQuestion.topic}</Text>}
        <Text style={[styles.questionText, { color: colors.text }]}>{currentQuestion.question}</Text>
      </View>

      {showFeedback && (
        <Animated.View style={[styles.feedbackBox, { opacity: fadeAnim }]}>
          <Text style={[styles.feedbackMain, { color: isCorrect ? '#4CAF50' : '#F44336' }]}>
            {isCorrect ? `○ ${t.correct}!` : `× ${t.incorrect}...`}
          </Text>
          {!isCorrect && (
            <Text style={styles.feedbackSub}>{t.wasCorrectAnswer.replace('{answer}', currentQuestion.answer ? '○' : '×')}</Text>
          )}
        </Animated.View>
      )}
      <View style={styles.answerRow}>
        {currentQuestion.answerType === 'truefalse' && (
          <TouchableOpacity
            style={[styles.answerBtn, { backgroundColor: colors.success }, answered && styles.btnDisabled]}
            onPress={() => handleAnswer(true)}
            disabled={answered}
          >
            <Text style={styles.answerBtnText}>○</Text>
          </TouchableOpacity>
        )}
        {currentQuestion.answerType === 'multiple' && (
          <>
            {currentQuestion.multipleChoice?.options.map((option, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.answerBtn, answered && styles.btnDisabled]}
                onPress={() => handleAnswer(i)}
                disabled={answered}
              >
                <Text style={styles.answerBtnText}>{option}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
        {currentQuestion.answerType === 'descriptive' && (
          <>
            <TextInput
              style={styles.descriptiveInput}
              value={userDescriptiveAnswer}
              onChangeText={setUserDescriptiveAnswer}
              placeholder={t.enterQuestion}
              multiline
              editable={!answered}
            />
            <TouchableOpacity
              style={[styles.answerBtn, styles.descriptiveBtn, answered && styles.btnDisabled]}
              onPress={() => handleAnswer(userDescriptiveAnswer)}
              disabled={answered}
            >
              <Text style={styles.answerBtnText}>{t.checkAnswer}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.quitBtn} onPress={() => Alert.alert(t.quitQuiz + '?', '', [{ text: t.cancel, style: 'cancel' },{ text: t.quitQuiz, style: 'destructive', onPress: () => navigate('/') }])}>
        <Text style={styles.quitBtnText}>{t.quitQuiz}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 30, color: '#1A1A1A' },
  infoSubtitle: { fontSize: 16, color: '#666', marginBottom: 8 },
  infoBox: { width: '100%', backgroundColor: '#F7F8FA', borderRadius: 14, padding: 16, marginBottom: 30, borderWidth: 1, borderColor: '#EFEFEF' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { fontSize: 14, color: '#666' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#EFEFEF' },
  startButton: { backgroundColor: '#4CAF50', paddingVertical: 16, paddingHorizontal: 50, borderRadius: 14, marginBottom: 12 },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  backButton: { padding: 12 },
  backButtonText: { color: '#888', fontSize: 15 },
  backButtonFull: { width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  backButtonFullText: { fontSize: 16, fontWeight: 'bold' },
  quizContainer: { flex: 1, backgroundColor: '#fff' },
  quizContent: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timer: { fontSize: 22, fontWeight: 'bold', minWidth: 60 },
  pauseBtn: { backgroundColor: '#F0F0F0', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  pauseBtnText: { fontSize: 12, color: '#555', fontWeight: '600' },
  questionCounter: { fontSize: 14, fontWeight: '600' },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 20, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#007AFF', borderRadius: 3 },
  questionBox: { backgroundColor: '#F0F4FF', borderRadius: 16, padding: 24, marginBottom: 20, minHeight: 150, justifyContent: 'center' },
  topicBadge: { fontSize: 11, color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 10, fontWeight: '600' },
  questionText: { fontSize: 22, textAlign: 'center', color: '#1A1A1A', lineHeight: 32 },
  feedbackBox: { backgroundColor: '#F8F8F8', borderRadius: 12, padding: 16, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#EFEFEF' },
  feedbackMain: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  feedbackSub: { fontSize: 14, color: '#F44336', marginBottom: 4 },
  answerRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 },
  answerBtn: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  trueBtn: { backgroundColor: '#4CAF50' },
  falseBtn: { backgroundColor: '#F44336' },
  btnDisabled: { opacity: 0.4 },
  answerBtnText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  quitBtn: { alignItems: 'center', paddingVertical: 20 },
  quitBtnText: { color: '#CCC', fontSize: 13 },
  // Review styles
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  reviewTitle: { fontSize: 24, fontWeight: 'bold', color: '#1A1A1A' },
  reviewList: { gap: 16 },
  reviewItem: { borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#EFEFEF' },
  reviewItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reviewQuestionNumber: { fontSize: 16, fontWeight: 'bold', color: '#666' },
  reviewResult: { fontSize: 14, fontWeight: 'bold' },
  reviewQuestionText: { fontSize: 16, color: '#1A1A1A', marginBottom: 12, lineHeight: 24 },
  reviewAnswers: { gap: 8 },
  reviewAnswerItem: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewAnswerLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  reviewAnswerValue: { fontSize: 14, color: '#1A1A1A', fontWeight: 'bold' },
  descriptiveInput: { height: 100, borderColor: 'gray', borderWidth: 1, padding: 10 },
  descriptiveBtn: { backgroundColor: '#4CAF50' },
  descriptiveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  descriptiveInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 }
});
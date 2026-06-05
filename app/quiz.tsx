import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, TouchableOpacity, Alert,
  ScrollView, Text, View, Animated, TextInput, Dimensions, Modal
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
interface ImageAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

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
  image?: string | null;
  imageAnnotations?: ImageAnnotation[];
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
  const isSmallScreen = Dimensions.get('window').width < 380;
  const isJapanese = locale === 'ja';

  // 正解の文字数に応じてフォントサイズを調整
  const getAnswerFontSize = (answer: string) => {
    const length = answer.length;
    if (isJapanese) {
      if (length <= 10) return 28;
      if (length <= 20) return 24;
      if (length <= 30) return 20;
      return 18;
    } else {
      if (length <= 15) return 28;
      if (length <= 30) return 24;
      if (length <= 50) return 20;
      return 18;
    }
  };

  // 文字数に応じてパディングも調整
  const getAnswerPadding = (answer: string) => {
    const length = answer.length;
    if (length <= 10) return 24;
    if (length <= 20) return 20;
    return 16;
  };

  // クイズ全体の状態
  const [quizStarted, setQuizStarted] = useState(false);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
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
  const [mistakeCount, setMistakeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userDescriptiveAnswer, setUserDescriptiveAnswer] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // タグフィルター用 state
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [preSelectedTags, setPreSelectedTags] = useState<string[]>([]);

  // 長押し用 ref
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // プレ設定用 state
  const [showPreSettings, setShowPreSettings] = useState(true);
  const [preQuestionCount, setPreQuestionCount] = useState<number>(10);
  const [isReverseMode, setIsReverseMode] = useState(false);

  // タイマー選択用 state
  const [preTimerMinutes, setPreTimerMinutes] = useState<number | null>(null);
  const [presetTimers, setPresetTimers] = useState<{ label: string; value: number | null }[]>([]);

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
  // 長押しハンドラ
  const startLongPress = (direction: 'inc' | 'dec', maxCount: number) => {
    stepTimeoutRef.current = setTimeout(() => {
      stepIntervalRef.current = setInterval(() => {
        setPreQuestionCount(prev => {
          if (direction === 'inc') return Math.min(maxCount, prev + 1);
          return Math.max(1, prev - 1);
        });
      }, 80);
    }, 500);
  };

  const stopLongPress = () => {
    if (stepTimeoutRef.current) clearTimeout(stepTimeoutRef.current);
    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
  };

  useEffect(() => {
    loadQuestions();
    loadTimerSetting();
    loadTimerPresets();
    SoundManager.initialize();
  }, []);

  const loadTimerPresets = async () => {
    try {
      // デフォルトタイマー設定を読み込む
      const timerVal = await AsyncStorage.getItem('APP_TIMER_SETTING');
      const defaultMinutes = timerVal ? parseInt(timerVal, 10) : 10;
      setPreTimerMinutes(defaultMinutes);

      // カスタムタイマーを読み込む
      const customRaw = await AsyncStorage.getItem('CUSTOM_TIMERS');
      const customTimers = customRaw ? JSON.parse(customRaw) : [];
      const presets: { label: string; value: number | null }[] = [
        { label: locale === 'ja' ? 'なし' : 'No limit', value: null },
        { label: locale === 'ja' ? '小テスト用 (10分)' : 'Small Test (10min)', value: 10 },
        { label: locale === 'ja' ? '試験用 (60分)' : 'Exam (60min)', value: 60 },
        { label: locale === 'ja' ? '試験用 (90分)' : 'Exam (90min)', value: 90 },
        { label: locale === 'ja' ? '試験用 (120分)' : 'Exam (120min)', value: 120 },
        ...customTimers.map((ct: any) => ({
          label: `${ct.name} (${ct.minutes}${locale === 'ja' ? '分' : 'min'})`,
          value: ct.minutes,
        })),
      ];
      setPresetTimers(presets);
    } catch (e) {
      console.error('Failed to load timer presets:', e);
    }
  };

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
        const enabled = processedQuestions.filter(q => q.enabled !== false);
        setAllQuestions(enabled);
        setEnabledQuestions(enabled);

        // 全タグを収集
        const tagSet = new Set<string>();
        enabled.forEach((q: Question) => {
          (q.tags || []).forEach((tag: string) => tagSet.add(tag));
        });
        const sortedTags = Array.from(tagSet).sort();
        setAllTags(sortedTags);
        setSelectedTags(sortedTags); // デフォルトですべて選択

        // デフォルト問題数
        setPreQuestionCount(Math.min(enabled.length, 50));
      } else {
        // Initial sample questions
        const samples: Question[] = [
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
        ];
        setAllQuestions(samples);
        setEnabledQuestions(samples);
        const tagSet = new Set<string>();
        samples.forEach(q => (q.tags || []).forEach(tag => tagSet.add(tag)));
        const sortedTags = Array.from(tagSet).sort();
        setAllTags(sortedTags);
        setSelectedTags(sortedTags);
        setPreQuestionCount(Math.min(samples.length, 50));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadTimerSetting = async () => {
    try {
      // ホーム画面と同じロジックでタイマー値を読み込む
      let timerValue = await AsyncStorage.getItem('APP_TIMER_SETTING');
      let storedMinutes = timerValue ? parseInt(timerValue, 10) : null;

      if (storedMinutes === null) {
        const oldTimerValue = await AsyncStorage.getItem('timerSetting');
        if (oldTimerValue !== null) {
          storedMinutes = parseInt(oldTimerValue, 10);
          await AsyncStorage.setItem('APP_TIMER_SETTING', storedMinutes.toString());
          await AsyncStorage.removeItem('timerSetting');
          console.log(`Migrated timer setting in Quiz screen: ${storedMinutes}`);
        }
      }

      const finalMinutes = (storedMinutes !== null && !isNaN(storedMinutes)) ? storedMinutes : 5;
      const seconds = finalMinutes * 60;
      setTimerLimit(seconds);
      setTimeLeft(seconds);
    } catch (error) {
      console.error('Failed to load timer setting:', error);
      setTimerLimit(300); // デフォルト5分(300秒)
      setTimeLeft(300);
    }
  };

  // 選択したタグでフィルタリングされた問題
  const getFilteredQuestions = () => {
    if (selectedTags.length === allTags.length) {
      return allQuestions;
    }
    return allQuestions.filter(q => {
      if (!q.tags || q.tags.length === 0) return selectedTags.length === allTags.length;
      return q.tags.some(tag => selectedTags.includes(tag));
    });
  };

  // タグの選択/解除をトグル
  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tag)) {
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  // すべて選択/解除
  const toggleSelectAll = () => {
    if (selectedTags.length === allTags.length) {
      setSelectedTags([]);
    } else {
      setSelectedTags([...allTags]);
    }
  };

  // タグごとに問題数をカウント
  const getQuestionsCountForTag = (tag: string): number => {
    return allQuestions.filter(q => (q.tags || []).includes(tag)).length;
  };

  // 選択されたタグの合計問題数
  const getMaxQuestionsForSelectedTags = (): number => {
    if (selectedTags.length === allTags.length) return allQuestions.length;
    const filtered = allQuestions.filter(q =>
      (q.tags || []).some(tag => selectedTags.includes(tag))
    );
    return filtered.length;
  };

  // 回答テキストを取得（リバースモード用）
  const getAnswerDisplayText = (q: Question): string => {
    switch (q.answerType) {
      case 'truefalse': return q.trueFalseAnswer ? '○ (正しい)' : '× (誤り)';
      case 'multiple': return q.multipleChoice?.options[q.multipleChoice.correctAnswer] || '';
      case 'descriptive': return q.descriptiveAnswer || '';
      default: return q.question;
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
  // クイズ開始（タグフィルター＋問題数制限＋リバース反映）
  // ──────────────────────────────────────────────
  const startQuiz = async () => {
    let filtered = getFilteredQuestions();

    if (filtered.length === 0) {
      SoundManager.play('select');
      Alert.alert(t.error, locale === 'ja' ? '選択したタグに問題がありません。' : 'No questions with selected tags.', [
        { text: 'OK' },
      ]);
      return;
    }
    SoundManager.play('decide');

    // 選択タイマーを保存
    if (preTimerMinutes !== null) {
      await AsyncStorage.setItem('quiz_active_timer', preTimerMinutes.toString());
    } else {
      await AsyncStorage.removeItem('quiz_active_timer');
    }

    // 問題数制限
    const shuffled = [...filtered].sort(() => Math.random() - 0.5).slice(0, preQuestionCount);

    setShuffledQuestions(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setResults([]);
    setUserAnswers([]);
    setShowFeedback(false);
    setAnswered(false);
    setTimeLeft(timerLimit);
    setShowPreSettings(false);
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
    let correct: boolean = false;
    switch (currentQuestion.answerType) {
      case 'truefalse':
        correct = answer === currentQuestion.trueFalseAnswer;
        actualCorrectAnswer = currentQuestion.trueFalseAnswer ?? false;
        // 誤答時に正解を設定
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer ? '○' : '✕');
        } else {
          setFeedbackMessage('');
        }
        break;
      case 'multiple':
        const selectedIndex = answer as number;
        const correctIndex = currentQuestion.multipleChoice?.correctAnswer ?? 0;
        correct = selectedIndex === correctIndex;
        actualCorrectAnswer = currentQuestion.multipleChoice?.options[correctIndex] || '';
        // 誤答時に正解を設定
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer);
        } else {
          setFeedbackMessage('');
        }
        break;
      case 'descriptive':
        const userAnswerTrimmed = (answer as string).trim().toLowerCase();
        const correctAnswerTrimmed = isReverseMode
          ? currentQuestion.question.trim().toLowerCase()
          : (currentQuestion.descriptiveAnswer || '').trim().toLowerCase();
        correct = userAnswerTrimmed === correctAnswerTrimmed;
        actualCorrectAnswer = isReverseMode
          ? currentQuestion.question
          : (currentQuestion.descriptiveAnswer || '');
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer);
          setShowFeedback(true);
        }
        break;
    }

    // フィードバック表示後に消去
    setTimeout(() => setFeedbackMessage(''), 3000);

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

    const delay = correct ? 1000 : 2500; // 不正解時は復習のために長く

    setTimeout(async () => {
      // 最新の結果を確定（stateが非同期更新される前にローカルで生成）
      const finalResults = [...results, newResult];
      setResults(finalResults);

      if (currentIndex + 1 >= shuffledQuestions.length) {
        // 最終問題の場合
        setIsTimerActive(false);
        setAnswered(false);
        setShowFeedback(false);
        await finishQuizWithResults(finalResults);
      } else {
        // 次の問題へ
        setCurrentIndex(prev => prev + 1);
        setShowFeedback(false);
        setAnswered(false);
        setUserDescriptiveAnswer('');
        questionStartTime.current = Date.now();
        SoundManager.play('question');
      }
    }, delay);
  };

  // ──────────────────────────────────────────────
  // クイズ終了
  // ──────────────────────────────────────────────
  const finishQuizWithResults = async (finalResults: QuizResult[]) => {
    setIsTimerActive(false);
    setShowReview(true);

    const totalQuestions = shuffledQuestions.length;
    const finalScore = finalResults.filter(r => r.isCorrect).length;

    // 結果を保存
    await AsyncStorage.setItem('quizResults', JSON.stringify({
      results: finalResults,
      total: totalQuestions,
      score: finalScore,
      timestamp: Date.now()
    }));

    try {
      await updateStreak();
      const answers = finalResults.map(r => ({
        isCorrect: r.isCorrect,
        tags: shuffledQuestions.find(q => q.id === r.questionId)?.tags ?? [],
      }));
      await recordQuizAnswers(answers);
    } catch (e) {
      console.error('finishQuiz error:', e);
    }

    // 結果画面へ遷移
    navigate('/results', {
      state: {
        total: totalQuestions,
        score: finalScore,
        results: finalResults
      }
    });
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
  const progressPercent = shuffledQuestions.length > 0 ? Math.round(((currentIndex) / shuffledQuestions.length) * 100) : 0;
  const timeMin = Math.floor(timeLeft / 60);
  const timeSec = timeLeft % 60;
  const currentQuestion = shuffledQuestions[currentIndex];

  // Play question sound when question changes
  useEffect(() => {
    if (currentQuestion && quizStarted) {
      SoundManager.play('question');
    }
  }, [currentIndex]);

  // プレ設定画面
  if (showPreSettings) {
    const filtered = getFilteredQuestions();
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 40 }}>
          <Text style={[{ fontSize: 24, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 32 }]}>
            📝 クイズ設定
          </Text>

          {/* 問題数 ステッパー + スライダー */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
            <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 16 }]}>
              問題数
            </Text>
            {/* ステッパー（微調整用） */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
              <TouchableOpacity
                style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => setPreQuestionCount(prev => Math.max(1, prev - 1))}
                onLongPress={() => startLongPress('dec', filtered.length)}
                onPressOut={stopLongPress}
                delayLongPress={500}
              >
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>−</Text>
              </TouchableOpacity>
              <Text style={[{ fontSize: 48, fontWeight: '700', color: colors.primary, minWidth: 80, textAlign: 'center' }]}>
                {preQuestionCount}
              </Text>
              <TouchableOpacity
                style={[{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => {
                  const maxCount = filtered.length;
                  setPreQuestionCount(prev => Math.min(maxCount, prev + 1));
                }}
                onLongPress={() => startLongPress('inc', filtered.length)}
                onPressOut={stopLongPress}
                delayLongPress={500}
              >
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>＋</Text>
              </TouchableOpacity>
            </View>
            {/* スライダー（ざっくり調整用） */}
            <View style={{ marginBottom: 12 }}>
              <input
                type="range"
                min="1"
                max={filtered.length}
                value={preQuestionCount}
                onChange={(e) => {
                  SoundManager.play('select');
                  setPreQuestionCount(parseInt(e.target.value, 10));
                }}
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 4,
                  outline: 'none',
                  accentColor: colors.primary,
                  cursor: 'pointer',
                }}
              />
            </View>
            {/* スライダー下の表示 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>1問</Text>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text }]}>
                {preQuestionCount} / {filtered.length}
              </Text>
              <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>{filtered.length}問</Text>
            </View>
          </View>

          {/* リバースモードトグル */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  🔄 リバースモード
                </Text>
                <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
                  回答を問題文として表示し、問題文を答えます
                </Text>
              </View>
              <TouchableOpacity
                style={[{
                  width: 56, height: 30, borderRadius: 15,
                  backgroundColor: isReverseMode ? colors.primary : colors.border,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }]}
                onPress={() => setIsReverseMode(!isReverseMode)}
              >
                <View style={[{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
                  alignSelf: isReverseMode ? 'flex-end' : 'flex-start',
                }]} />
              </TouchableOpacity>
            </View>
          </View>

          {/* タイマー設定 */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
            <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 12 }]}>
              ⏱ {locale === 'ja' ? '制限時間' : 'Time Limit'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {presetTimers.map((preset, i) => {
                  const isSelected = preTimerMinutes === preset.value;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: colors.primary,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      }]}
                      onPress={() => {
                        SoundManager.play('select');
                        setPreTimerMinutes(preset.value);
                      }}
                    >
                      <Text style={[{ color: isSelected ? '#fff' : colors.primary, fontWeight: '600', fontSize: 13 }]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          {/* タグ絞り込み */}
          {allTags.length > 0 && (
            <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 24 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  🏷️ タグで絞り込み
                </Text>
              </View>
              
              {/* タグ選択状況の表示 */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>
                  {selectedTags.length === 0
                    ? `選択なし = すべての問題（全${allQuestions.length}問）`
                    : `${selectedTags.length}個タグ選択中（最大${getFilteredQuestions().length}問）`
                  }
                </Text>
              </View>
              
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {allTags.map(tag => {
                  const count = allQuestions.filter(q => (q.tags || []).includes(tag)).length;
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[{
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                        borderWidth: 1.5,
                        borderColor: colors.primary,
                        backgroundColor: isSelected ? colors.primary : 'transparent',
                      }]}
                      onPress={() => {
                        SoundManager.play('select');
                        setSelectedTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                      }}
                    >
                      <Text style={[{
                        color: isSelected ? '#fff' : colors.primary,
                        fontWeight: '600',
                        fontSize: 13,
                      }]}>
                        {tag}
                        <Text style={[{ fontSize: 11, opacity: 0.8 }]}>
                          {' '}({count})
                        </Text>
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* スタートボタン */}
          <TouchableOpacity
            style={[{ backgroundColor: colors.primary, padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: 12 }]}
            onPress={startQuiz}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
              ▶ スタート
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[{ 
              backgroundColor: colors.primary,
              padding: 14,
              borderRadius: 12,
              alignItems: 'center',
              marginTop: 4,
            }]}
            onPress={() => { SoundManager.play('decide'); navigate('/'); }}
          >
            <Text style={{ color: onPrimary, fontSize: 16, fontWeight: 'bold' }}>
              {locale === 'ja' ? '戻る' : 'Back'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // Review Screen
  if (showReview) {
    return (
      <ScrollView style={[styles.quizContainer, { backgroundColor: colors.background }]} contentContainerStyle={[styles.quizContent, { flexGrow: 1 }]}>
        <View style={styles.reviewHeader}>
          <Text style={styles.reviewTitle}>{t.review}</Text>
          <TouchableOpacity 
            style={[styles.backButtonFull, { backgroundColor: colors.primary }]}
            onPress={() => {
              SoundManager.play('decide');
              navigate('/');
            }}
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
    <View style={[styles.quizContainer, { backgroundColor: colors.background, flex: 1 }]}>
      {/* スクロールしないヘッダー部分 */}
      <View style={styles.topBar}>
        <Text style={[styles.timer, { color: timerColor }]}>{timeMin}:{String(timeSec).padStart(2, '0')}</Text>
        <TouchableOpacity 
          style={[
            styles.pauseBtn, 
            { 
              backgroundColor: isPaused ? colors.success : colors.border,
              borderWidth: isPaused ? 2 : 0,
              borderColor: isPaused ? '#fff' : 'transparent',
            }
          ]} 
          onPress={() => {
            SoundManager.play('decide');
            setIsPaused(!isPaused);
            setIsTimerActive(isPaused);
          }}
        >
          <Text style={[styles.pauseBtnText, { color: isPaused ? '#fff' : colors.text, fontWeight: 'bold' }]}>
            {isPaused ? '▶ 再開' : '⏸ 一時停止'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.questionCounter, { color: colors.textSecondary }]}>{currentIndex + 1} / {shuffledQuestions.length}</Text>
      </View>

      <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: colors.primary }]} />
      </View>

      {/* スクロールが必要な部分 */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={[styles.questionBox, { backgroundColor: colors.primary + '15', borderColor: colors.border }]}>
          {currentQuestion.topic && <Text style={[styles.topicBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{currentQuestion.topic}</Text>}
          
          {/* 画像がある場合は表示 */}
          {currentQuestion.image && (
            <View style={[{ position: 'relative', backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }]}>
              <img
                src={currentQuestion.image}
                alt="問題の画像"
                style={{ width: '100%', height: 'auto', maxHeight: 300 }}
              />
              
              {/* アノテーション（隠すボックス）を表示 */}
              {currentQuestion.imageAnnotations?.map((annotation) => (
                <View
                  key={annotation.id}
                  style={{
                    position: 'absolute',
                    left: annotation.x,
                    top: annotation.y,
                    width: annotation.width,
                    height: annotation.height,
                    backgroundColor: annotation.color,
                    opacity: annotation.opacity,
                    borderRadius: 4,
                  }}
                />
              ))}
            </View>
          )}
          
          <Text style={[styles.questionText, { color: colors.text }]}>
            {isReverseMode
              ? getAnswerDisplayText(currentQuestion)
              : currentQuestion.question
            }
          </Text>
        </View>

        {/* 正解時の表示（小さく簡潔に） */}
        {showFeedback && isCorrect && (
          <Animated.View style={[styles.feedbackContainer, { opacity: fadeAnim, marginVertical: 16 }]}>
            <View style={[styles.feedbackBox, { backgroundColor: colors.success + '20', padding: 16, borderRadius: 12 }]}>
              <Text style={[styles.feedbackMain, { color: colors.success, fontSize: 20, fontWeight: 'bold', textAlign: 'center' }]}>
                ✓ 正解！
              </Text>
            </View>
          </Animated.View>
        )}
        <View style={styles.answerRow}>
          {/* ○×問題 */}
          {currentQuestion.answerType === 'truefalse' && (
            <View style={styles.trueFalseContainer}>
              <TouchableOpacity
                style={[styles.answerBtn, styles.trueBtn, { backgroundColor: colors.success }]}
                onPress={() => handleAnswer(true)}
                disabled={answered || isPaused}
              >
                <Text style={styles.answerBtnText}>○</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.answerBtn, styles.falseBtn, { backgroundColor: colors.error }]}
                onPress={() => handleAnswer(false)}
                disabled={answered || isPaused}
              >
                <Text style={styles.answerBtnText}>×</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 四択問題 */}
          {currentQuestion.answerType === 'multiple' && (
            <View style={styles.multipleContainer}>
              {currentQuestion.multipleChoice?.options.map((option, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.multipleBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleAnswer(i)}
                  disabled={answered || isPaused}
                >
                  <Text style={[styles.multipleNumber, { color: colors.primary }]}>{i + 1}️⃣</Text>
                  <Text style={[styles.multipleText, { color: colors.text }]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* 記述式問題 */}
          {currentQuestion.answerType === 'descriptive' && (
            <View style={styles.descriptiveContainer}>
              <TextInput
                style={styles.descriptiveInput}
                value={userDescriptiveAnswer}
                onChangeText={setUserDescriptiveAnswer}
                placeholder="回答を入力"
                placeholderTextColor="#999"
                multiline
                editable={!answered && !isPaused}
              />
              <TouchableOpacity
                style={[styles.descriptiveBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleAnswer(userDescriptiveAnswer)}
                disabled={answered || isPaused}
              >
                <Text style={styles.descriptiveBtnText}>{t.checkAnswer}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.bottomButtons}>
          <TouchableOpacity 
            style={[
              styles.quitBtn, 
              { 
                backgroundColor: colors.primary,
                paddingVertical: 12, 
                paddingHorizontal: 24, 
                borderRadius: 30,
                alignSelf: 'center',
                marginTop: 20,
                minWidth: 180,
                alignItems: 'center',
              }
            ]} 
            onPress={() => {
              SoundManager.play('decide');
              setShowConfirmModal(true);
            }}
          >
            <Text style={[styles.quitBtnText, { color: '#fff', fontWeight: 'bold', fontSize: 16 }]}>
              {t.quitQuiz}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      {/* ポーズ時のフルスクリーンモーダル */}
      <Modal visible={isPaused} transparent animationType="fade">
        <View style={styles.pausedOverlay}>
          <View style={styles.pausedContent}>
            <Text style={styles.pausedText}>
              {locale === 'ja' ? '⏸ 一時停止中' : '⏸ Paused'}
            </Text>
            <Text style={styles.pausedSubText}>
              {locale === 'ja' ? '再開ボタンを押して続ける' : 'Press resume to continue'}
            </Text>
            <TouchableOpacity
              style={[styles.pauseBtn, { backgroundColor: colors.primary, marginTop: 24, paddingHorizontal: 32, paddingVertical: 14 }]}
              onPress={() => {
                SoundManager.play('decide');
                setIsPaused(false);
                setIsTimerActive(true);
              }}
            >
              <Text style={[styles.pauseBtnText, { color: '#fff', fontWeight: 'bold', fontSize: 16 }]}>
                {locale === 'ja' ? '▶ 再開' : '▶ Resume'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 中断確認モーダル */}
      {showConfirmModal && (
        <View style={styles.confirmModalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>確認</Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              ホーム画面に戻ります。本当にいいですか？
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity 
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => setShowConfirmModal(false)}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>いいえ</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={() => {
                  setShowConfirmModal(false);
                  setIsTimerActive(false);
                  navigate('/');
                }}
              >
                <Text style={styles.confirmModalConfirmText}>はい</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 誤答時のフルスクリーンモーダル */}
      <Modal visible={showFeedback && !isCorrect && !!feedbackMessage} transparent animationType="fade">
        <View style={styles.fullScreenFeedback}>
          <View style={[styles.fullScreenCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.fullScreenIcon, { color: colors.error }]}>✗</Text>
            <Text style={[styles.fullScreenTitle, { color: colors.error }]}>
              {locale === 'ja' ? '不正解' : 'Incorrect'}
            </Text>
            
            <View style={[styles.fullScreenAnswerBox, { backgroundColor: colors.primary + '15', borderRadius: 16, padding: 24, minWidth: 200, maxWidth: '90%' }]}>
              <Text style={[styles.fullScreenAnswerLabel, { color: colors.textSecondary }]}>
                {locale === 'ja' ? '正解はこちら' : 'Correct Answer'}
              </Text>
              <Text style={[styles.fullScreenAnswerText, { color: colors.primary, fontSize: 24, fontWeight: 'bold', textAlign: 'center' }]}>
                {feedbackMessage}
              </Text>
            </View>
            
            <Text style={[styles.fullScreenTimer, { color: colors.textSecondary }]}>
              {locale === 'ja' ? '次の問題へ...' : 'Next question...'}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 24 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 30, color: '#1A1A1A' },
  infoSubtitle: { fontSize: 16, color: '#666', marginBottom: 8 },
  infoBox: { width: '100%', backgroundColor: '#F7F8FA', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#EFEFEF' },
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
  pausedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  pausedContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 20,
  },
  pausedText: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#fff',
    textAlign: 'center',
  },
  pausedSubText: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
  },
  pausedMessageContainer: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 20,
  },
  pausedMessageText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  pausedMessageSub: {
    fontSize: 14,
    textAlign: 'center',
  },
  quizContainer: { 
    flex: 1, 
    backgroundColor: '#fff' 
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  quizContent: { 
    padding: 20, 
    paddingTop: 60, 
    paddingBottom: 40,
    flexGrow: 1,
  },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  timer: { fontSize: 22, fontWeight: 'bold', minWidth: 60 },
  pauseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnText: { fontSize: 12, color: '#555', fontWeight: '600' },
  questionCounter: { fontSize: 14, fontWeight: '600' },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 20, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: '#007AFF', borderRadius: 3 },
  questionBox: { backgroundColor: '#F0F4FF', borderRadius: 16, padding: 24, marginBottom: 20, minHeight: 150, justifyContent: 'center' },
  topicBadge: { fontSize: 11, color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 10, fontWeight: '600' },
  questionText: { fontSize: 22, textAlign: 'center', color: '#1A1A1A', lineHeight: 32 },
  feedbackContainer: {
    marginVertical: 12,
    width: '100%',
  },
  feedbackBox: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  feedbackMain: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  feedbackSub: {
    fontSize: 14,
    textAlign: 'center',
  },
  answerRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 20 },
  trueFalseContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    gap: 20,
  },
  answerBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trueBtn: { backgroundColor: '#4CAF50' },
  falseBtn: { backgroundColor: '#F44336' },
  btnDisabled: { opacity: 0.4 },
  answerBtnText: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
  quitBtn: { alignItems: 'center', justifyContent: 'center' },
  bottomButtons: {
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
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
  fullScreenFeedback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.9)',
    zIndex: 9999,
  },
  fullScreenCard: {
    width: '90%',
    maxWidth: 500,
    padding: 40,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  fullScreenIcon: {
    marginBottom: 16,
  },
  fullScreenTitle: {
    fontWeight: 'bold',
    marginBottom: 24,
  },
  fullScreenAnswerBox: {
    alignItems: 'center',
    marginBottom: 24,
    width: 'auto',  // 自動調整
  },
  fullScreenAnswerLabel: {
    marginBottom: 8,
  },
  fullScreenAnswerText: {
    fontSize: 28,
    fontWeight: 'bold',
    flexWrap: 'wrap',
    textAlign: 'center',
  },
  fullScreenTimer: {
    marginTop: 8,
  },
  confirmModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  confirmModalContainer: {
    width: '80%',
    maxWidth: 300,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  confirmModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmModalCancel: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmModalCancelText: {
    fontWeight: 'bold',
  },
  confirmModalConfirm: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmModalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  reviewAnswers: { gap: 8 },
  reviewAnswerItem: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewAnswerLabel: { fontSize: 14, color: '#666', fontWeight: '600' },
  reviewAnswerValue: { fontSize: 14, color: '#1A1A1A', fontWeight: 'bold' },
  descriptiveContainer: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 10,
  },
  descriptiveInput: {
    flex: 1,
    height: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  descriptiveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  descriptiveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  // Multiple choice styles
  multipleContainer: {
    gap: 12,
    width: '100%',
  },
  multipleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  multipleNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    minWidth: 40,
  },
  multipleText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
  },
  // タグフィルタースタイル
  tagFilterSection: {
    width: '100%',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  tagFilterTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  tagFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  tagFilterList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 4,
    marginRight: 4,
  },
  tagFilterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
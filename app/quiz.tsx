import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Pressable, TouchableOpacity, Alert,
  ScrollView, Text, View, Animated, TextInput, Dimensions, Modal, Switch, Platform
} from 'react-native';
import LottieView from 'lottie-react-native';
import successJson from '../src/assets/animations/success.json';
import errorJson from '../src/assets/animations/error.json';

import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { incrementStat, recordQuizAnswers } from './missions';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { useQuestions } from './hooks/useQuestions';
import { checkDescriptiveAnswer, getAnswerText } from './utils/answerUtils';
import { useMemo } from 'react';
import { STORAGE_KEYS } from './constants/storageKeys';
import { Question } from './types/question';
import { useAuth } from './auth/AuthContext';
import { awardQuizCompletion } from '../src/utils/userProgress';
import './quiz.css';

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────
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

// デバイスに応じたフォントサイズ調整
const getAnswerModalFontSize = (answer: string, screenWidth: number) => {
  const length = answer.length;
  if (screenWidth < 480) {
    if (length <= 30) return 20;
    if (length <= 60) return 18;
    if (length <= 100) return 16;
    return 14;
  } else {
    if (length <= 30) return 28;
    if (length <= 60) return 24;
    if (length <= 100) return 20;
    return 18;
  }
};

// ──────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────
export default function QuizScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { questions: allQuestionsFromHook, loadQuestions } = useQuestions();
  const { user } = useAuth();
  const screenWidth = Dimensions.get('window').width;

  // クイズ全体の状態
  const [quizStarted, setQuizStarted] = useState(false);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);  const [enabledQuestions, setEnabledQuestions] = useState<Question[]>([]);
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [userDescriptiveAnswer, setUserDescriptiveAnswer] = useState('');
  const [userDescriptiveAnswers, setUserDescriptiveAnswers] = useState<string[]>([]);  // 両解モード用
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 解説表示
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationText, setExplanationText] = useState('');
  
  // 現在の問題を取得
  const currentQuestion = shuffledQuestions[currentIndex];
  
  // 両解モードの問題かどうかを判定
  const isAllMatchMode = currentQuestion?.matchMode === 'all' && currentQuestion.answerType === 'descriptive';
  
  // 正解キーワードのリストを取得
  const correctKeywords = useMemo(() => {
    if (!isAllMatchMode || !currentQuestion?.descriptiveAnswer) return [];
    const answer = currentQuestion.descriptiveAnswer;
    if (Array.isArray(answer)) {
      return answer;
    }
    return answer.split(/[,\s]+/).filter((kw: string) => kw.length > 0);
  }, [isAllMatchMode, currentQuestion]);

  // Lottieアニメーション表示制御
  const [showSuccessLottie, setShowSuccessLottie] = useState(false);
  const [showErrorLottie, setShowErrorLottie] = useState(false);

  // 自動再生モード
  const [autoPlayMode, setAutoPlayMode] = useState(false);
  const [autoPlayInterval, setAutoPlayInterval] = useState(5); // 秒
  const [autoPlayPhase, setAutoPlayPhase] = useState<'question' | 'answer'>('question');
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(5);
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPlayPhaseRef = useRef<'question' | 'answer'>('question');
  const autoPlayRemainingRef = useRef<number>(5);
  const autoPlaySessionRef = useRef(0);
  const currentIndexRef = useRef(0);

  // currentIndex が変わったら ref も更新
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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

  // ゲーム機能用 state
  const [challengeMode, setChallengeMode] = useState(false);
  const [suddenDeathMode, setSuddenDeathMode] = useState(false);
  const [suddenDeathLives, setSuddenDeathLives] = useState(3);
  const [timeAttackMode, setTimeAttackMode] = useState(false);
  const [timeAttackLimit, setTimeAttackLimit] = useState(5);
  const [currentLives, setCurrentLives] = useState(3);
  const [comboCount, setComboCount] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);

  // タイマー選択用 state
  const [preTimerMinutes, setPreTimerMinutes] = useState<number | null>(null);
  const [presetTimers, setPresetTimers] = useState<{ label: string; value: number | null }[]>([]);

  // タイマー
  const [timerLimit, setTimerLimit] = useState(180);
  const [timeLeft, setTimeLeft] = useState(180);
  const [isTimerActive, setIsTimerActive] = useState(false);

  // 問題ごとのストップウォッチ
  const questionStartTime = useRef<number>(Date.now());

  // フィードバックアニメ
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ○×ボタンのバネアニメーション
  const trueBtnAnim = useRef(new Animated.Value(0)).current;
  const falseBtnAnim = useRef(new Animated.Value(0)).current;

  const animateButton = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

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
    loadTimerSetting();
    loadTimerPresets();
    SoundManager.initialize();
  }, []);

  // ──────────────────────────────────────────────
  // 自動再生タイマー（修正版 3 - useRef 使用）
  // ──────────────────────────────────────────────
  useEffect(() => {
    console.log('[AutoPlay] useEffect triggered:', { 
      autoPlayMode, 
      quizStarted, 
      isPaused, 
      shuffledQuestionsLength: shuffledQuestions.length 
    });

    if (!autoPlayMode || !quizStarted || isPaused || shuffledQuestions.length === 0) {
      if (autoPlayTimerRef.current) {
        console.log('[AutoPlay] Clearing timer (exit condition)');
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      autoPlaySessionRef.current += 1;
      return;
    }

    // 既存のタイマーをクリア
    if (autoPlayTimerRef.current) {
      console.log('[AutoPlay] Clearing existing timer');
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    const sessionId = ++autoPlaySessionRef.current;

    // フェーズと残り時間をリセット
    autoPlayPhaseRef.current = 'question';
    setAutoPlayPhase('question');
    autoPlayRemainingRef.current = autoPlayInterval;
    setAutoPlayCountdown(autoPlayRemainingRef.current);
    console.log('[AutoPlay] Starting new timer, interval:', autoPlayInterval);

    const tick = () => {
      if (sessionId !== autoPlaySessionRef.current) {
        return;
      }

      autoPlayRemainingRef.current -= 1;
      setAutoPlayCountdown(autoPlayRemainingRef.current);
      console.log('[AutoPlay] Countdown:', autoPlayRemainingRef.current, 'Phase:', autoPlayPhaseRef.current);

      if (autoPlayRemainingRef.current <= 0) {
        if (autoPlayPhaseRef.current === 'question') {
          // 質問 → 回答へ切り替え
          console.log('[AutoPlay] Switching to answer phase');
          autoPlayPhaseRef.current = 'answer';
          setAutoPlayPhase('answer');
          autoPlayRemainingRef.current = autoPlayInterval;
          setAutoPlayCountdown(autoPlayRemainingRef.current);
        } else {
          // 回答表示終了 → 次の問題へ
          const nextIdx = currentIndexRef.current + 1;
          console.log('[AutoPlay] Moving to next question:', nextIdx, '/', shuffledQuestions.length);
          
          if (nextIdx >= shuffledQuestions.length) {
            console.log('[AutoPlay] All questions completed');
                      autoPlaySessionRef.current += 1;
                      if (autoPlayTimerRef.current) {
                        clearTimeout(autoPlayTimerRef.current);
                        autoPlayTimerRef.current = null;
                      }
            navigate('/results', { 
              state: { 
                total: shuffledQuestions.length, 
                score: 0, 
                results: [] 
              } 
            });
          } else {
            // 次の問題に遷移
            currentIndexRef.current = nextIdx;
            setCurrentIndex(nextIdx);
            questionStartTime.current = Date.now();
            
            // 質問フェーズに戻してタイマーを継続
            autoPlayPhaseRef.current = 'question';
            setAutoPlayPhase('question');
            autoPlayRemainingRef.current = autoPlayInterval;
            setAutoPlayCountdown(autoPlayRemainingRef.current);
            console.log('[AutoPlay] Moved to question', nextIdx, 'resetting timer');
          }
        }
      }
      autoPlayTimerRef.current = setTimeout(tick, 1000);
    };

    autoPlayTimerRef.current = setTimeout(tick, 1000);

    return () => {
      if (autoPlayTimerRef.current) {
        console.log('[AutoPlay] Cleanup timer');
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    };
  }, [autoPlayMode, quizStarted, isPaused, autoPlayInterval, shuffledQuestions.length]);

  // useQuestions フックのデータをローカル state に反映
  useEffect(() => {
    if (allQuestionsFromHook.length === 0) return;
    const enabled = allQuestionsFromHook.filter(q => q.enabled !== false);
    setAllQuestions(enabled);
    setEnabledQuestions(enabled);

    const tagSet = new Set<string>();
    enabled.forEach(q => (q.tags || []).forEach(tag => tagSet.add(tag)));
    const sortedTags = Array.from(tagSet).sort();
    setAllTags(sortedTags);
    setSelectedTags(sortedTags);
    setPreQuestionCount(Math.min(enabled.length, 50));
  }, [allQuestionsFromHook]);

  const loadTimerPresets = async () => {
    try {
      // 保存されたアクティブタイマーを読み込む（実適用値）
      const savedTimer = await AsyncStorage.getItem('quiz_active_timer');
      if (savedTimer !== null) {
        const parsed = parseInt(savedTimer, 10);
        setPreTimerMinutes(isNaN(parsed) ? null : parsed);
      } else {
        // デフォルトは APP_TIMER_SETTING から
        const timerVal = await AsyncStorage.getItem(STORAGE_KEYS.APP_TIMER_SETTING);
        setPreTimerMinutes(timerVal ? parseInt(timerVal, 10) : 10);
      }

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

  const loadTimerSetting = async () => {
    try {
      let timerValue = await AsyncStorage.getItem(STORAGE_KEYS.APP_TIMER_SETTING);
      let storedMinutes = timerValue ? parseInt(timerValue, 10) : null;

      if (storedMinutes === null) {
        const oldTimerValue = await AsyncStorage.getItem('timerSetting');
        if (oldTimerValue !== null) {
          storedMinutes = parseInt(oldTimerValue, 10);
          await AsyncStorage.setItem(STORAGE_KEYS.APP_TIMER_SETTING, storedMinutes.toString());
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
      setTimerLimit(300);
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


  // ──────────────────────────────────────────────
  // カウントダウンタイマー
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerActive || !quizStarted) return;
    if (timeLeft <= 0) {
      setIsTimerActive(false);
      // タイムアタックモードでも通常モードでも同じ処理
      handleTimeUp();
      return;
    }
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => {
      clearInterval(id);
    };
  }, [isTimerActive, timeLeft, quizStarted, timeAttackMode]);

  const handleTimeUp = async () => {
    setIsTimerActive(false);
    
    // 未解答の問題を不正解として結果に追加
    const unansweredResults: QuizResult[] = [];
    for (let i = currentIndex; i < shuffledQuestions.length; i++) {
      const q = shuffledQuestions[i];
      unansweredResults.push({
        questionId: q.id,
        question: q.question,
        yourAnswer: locale === 'ja' ? '時間切れ' : 'Time Up',
        correctAnswer: getAnswerText(q),
        isCorrect: false,
        timeSpent: 0,
      });
    }
    
    // 既存の結果と未解答結果を結合して終了処理
    const finalResults = [...results, ...unansweredResults];
    await finishQuizWithResults(finalResults);
  };

  // ──────────────────────────────────────────────
  // クイズ開始（タグフィルター＋問題数制限＋リバース反映）
  // ──────────────────────────────────────────────
  const startQuiz = async () => {
    console.log('[AutoPlay] startQuiz called, quizStarted will be true');
    let filtered = getFilteredQuestions();

    if (filtered.length === 0) {
      SoundManager.play('select');
      Alert.alert(t.error, locale === 'ja' ? '選択したタグに問題がありません。' : 'No questions with selected tags.', [
        { text: 'OK' },
      ]);
      return;
    }
    SoundManager.play('decide');

    // チャレンジモードのコインチェック（賭け金：50コイン）
    if (challengeMode) {
      const betAmount = 50;
      const coins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
      if (coins < betAmount) {
        Alert.alert(
          locale === 'ja' ? 'コイン不足' : 'Insufficient Coins',
          locale === 'ja' 
            ? `チャレンジモードには${betAmount}コイン必要です。\nクイズを解いてコインを稼ぎましょう！`
            : `Challenge mode requires ${betAmount} coins.\nPlay quizzes to earn coins!`
        );
        return;
      }
      // 賭け金を預かり
      await AsyncStorage.setItem('user_coins', (coins - betAmount).toString());
      await AsyncStorage.setItem('challenge_bet', betAmount.toString());
    }

    // 選択タイマーを保存（ホーム画面表示用）
    if (preTimerMinutes !== null) {
      await AsyncStorage.setItem('quiz_active_timer', preTimerMinutes.toString());
    } else {
      await AsyncStorage.removeItem('quiz_active_timer');
    }
    // 問題数制限（サドンデスモード時は無制限）
    let shuffled = [...filtered].sort(() => Math.random() - 0.5);
    if (!suddenDeathMode) {
      shuffled = shuffled.slice(0, preQuestionCount);
    } else {
      // サドンデスモード: 問題数は全件
      setPreQuestionCount(filtered.length);
      // シャッフルは全件
      shuffled = [...filtered].sort(() => Math.random() - 0.5);
    }

    setShuffledQuestions(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setResults([]);
    setUserAnswers([]);
    setShowFeedback(false);
    setAnswered(false);

    // サドンデス用の初期化
    if (suddenDeathMode) {
      setCurrentLives(suddenDeathLives);
      setComboCount(0);
      setMaxCombo(0);
    }

    // タイマー設定（タイムアタック優先）
    if (timeAttackMode) {
      setTimerLimit(timeAttackLimit);
      setTimeLeft(timeAttackLimit);
      setIsTimerActive(true);
    } else if (preTimerMinutes === null) {
      setTimerLimit(Number.MAX_VALUE);
      setTimeLeft(Number.MAX_VALUE);
      setIsTimerActive(false);
    } else {
      const seconds = preTimerMinutes * 60;
      setTimerLimit(seconds);
      setTimeLeft(seconds);
      setIsTimerActive(true);
    }

    setShowPreSettings(false);
    setQuizStarted(true);
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
    
    let actualCorrectAnswer: boolean | number | string = getAnswerText(currentQuestion);
    let correct: boolean = false;
    switch (currentQuestion.answerType) {
      case 'truefalse':
        correct = answer === currentQuestion.trueFalseAnswer;
        actualCorrectAnswer = currentQuestion.trueFalseAnswer ?? false;
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
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer);
        } else {
          setFeedbackMessage('');
        }
        break;
      case 'descriptive':
        const userAnswerStr = answer as string;
        correct = checkDescriptiveAnswer(userAnswerStr, currentQuestion);
        actualCorrectAnswer = isReverseMode
          ? currentQuestion.question
          : getAnswerText(currentQuestion);
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer);
          setShowFeedback(true);
        }
        break;
    }

    setTimeout(() => setFeedbackMessage(''), 3000);

    SoundManager.play(correct ? 'correct' : 'wrong');

    const newResult: QuizResult = {
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      yourAnswer: answer,
      correctAnswer: actualCorrectAnswer,
      isCorrect: correct,
      timeSpent: elapsed,
    };

    // サドンデス処理
    if (suddenDeathMode && !correct) {
      const newLives = currentLives - 1;
      setCurrentLives(newLives);
      if (newLives <= 0) {
        setIsTimerActive(false);
        setAnswered(false);
        setShowFeedback(false);
        await finishQuizWithResults([...results, newResult]);
        return;
      }
      setComboCount(0);
    } else if (correct) {
      setComboCount(prev => {
        const newCombo = prev + 1;
        if (newCombo > maxCombo) setMaxCombo(newCombo);
        return newCombo;
      });
    }

    const updatedResults = [...results, newResult];
    setResults(updatedResults);
    
    const answerData: UserAnswer = {
      question: currentQuestion.question,
      yourAnswer: answer,
      correctAnswer: actualCorrectAnswer,
      isCorrect: correct
    };
    setUserAnswers(prev => [...prev, answerData]);
    
    if (currentQuestion.answerType === 'descriptive') {
      setUserDescriptiveAnswer('');
      setUserDescriptiveAnswers([]);
    }
    
    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) setScore(s => s + 1);

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    // Lottieアニメーションを再生（正解・不正解時）
    if (correct) {
      setShowSuccessLottie(true);
      setTimeout(() => setShowSuccessLottie(false), 2500);
    } else {
      setShowErrorLottie(true);
      setTimeout(() => setShowErrorLottie(false), 2500);
    }

    // 正解時に解説を表示（○×問題と4択問題のみ、タイムアタックモードは除く）
    if (correct && !timeAttackMode && (currentQuestion.answerType === 'truefalse' || currentQuestion.answerType === 'multiple') && (currentQuestion.explanation || currentQuestion.wrongReason)) {
      setIsTimerActive(false);
      setShowExplanation(true);
      setExplanationText(currentQuestion.explanation || currentQuestion.wrongReason || '');

      // 3秒後に解説を閉じてタイマーを再開し、次へ進む
      setTimeout(async () => {
        setShowExplanation(false);
        setExplanationText('');
        setIsTimerActive(true); // タイマーを再開

        const finalResults = [...results, newResult];
        setResults(finalResults);

        if (currentIndex + 1 >= shuffledQuestions.length) {
          setIsTimerActive(false);
          setAnswered(false);
          setShowFeedback(false);
          await finishQuizWithResults(finalResults);
        } else {
          setCurrentIndex(prev => prev + 1);
          setShowFeedback(false);
          setAnswered(false);
          setUserDescriptiveAnswer('');
          questionStartTime.current = Date.now();
          SoundManager.play('question');
        }
      }, 3000);
    } else {
      const delay = correct ? 1000 : 2500;

      setTimeout(async () => {
        const finalResults = [...results, newResult];
        setResults(finalResults);

        if (currentIndex + 1 >= shuffledQuestions.length) {
          setIsTimerActive(false);
          setAnswered(false);
          setShowFeedback(false);
          await finishQuizWithResults(finalResults);
        } else {
          setCurrentIndex(prev => prev + 1);
          setShowFeedback(false);
          setAnswered(false);
          setUserDescriptiveAnswer('');
          questionStartTime.current = Date.now();
          // タイムアタックモードの場合、タイマーを再開
          if (timeAttackMode) {
            setIsTimerActive(true);
          }
          SoundManager.play('question');
        }
      }, delay);
    }
  };

  // ──────────────────────────────────────────────
  // クイズ終了
  // ──────────────────────────────────────────────
  const finishQuizWithResults = async (finalResults: QuizResult[]) => {
    setIsTimerActive(false);

    const totalQuestions = shuffledQuestions.length;
    const finalScore = finalResults.filter(r => r.isCorrect).length;

    // 結果を保存（STORAGE_KEYS.STATS = 'quiz_stats' に保存）
    await AsyncStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify({
      results: finalResults,
      total: totalQuestions,
      score: finalScore,
      timestamp: Date.now()
    }));

    try {
      const answers = finalResults.map(r => ({
        isCorrect: r.isCorrect,
        tags: shuffledQuestions.find(q => q.id === r.questionId)?.tags ?? [],
      }));
      await recordQuizAnswers(answers);
      
      const baseXP = finalScore * 20;
      const baseCoins = finalScore * 10;
      let totalXPReward = baseXP;
      let totalCoinReward = baseCoins;
      let bookReward = 0;

      // 全問正解ボーナス
      const isPerfect = finalScore === totalQuestions;
      if (isPerfect) {
        totalCoinReward += 10;
      }

      // チャレンジモードの処理
      let challengeBet = 0;
      if (challengeMode) {
        challengeBet = parseInt(await AsyncStorage.getItem('challenge_bet') || '0', 10);

        if (isPerfect) {
          totalXPReward *= 2;
          totalCoinReward *= 2;
          totalCoinReward += challengeBet;
          // 賭け金は後で加算（すでに消費済みのため戻す）
        }
        // 失敗時は賭け金没収（すでに消費済みのため何もしない）
      }

      // ボス討伐モード（weak）: +50% XP
      const quizMode = await AsyncStorage.getItem('quiz_mode');
      const isBossMode = quizMode === 'weak';
      if (isBossMode) {
        totalXPReward = Math.floor(totalXPReward * 1.5);
        await AsyncStorage.removeItem('quiz_mode');
      }

      // サドンデス: 連続正解ボーナス
      if (suddenDeathMode && maxCombo > 0) {
        totalCoinReward += Math.floor(maxCombo / 2);
      }

      // チャレンジモード成功時は本の報酬
      if (challengeMode && isPerfect) {
        const { loadStats: loadStats2, saveStats: saveStats2 } = await import('./missions');
        const stats = await loadStats2();
        stats.totalBooks = (stats.totalBooks || 0) + 1;
        stats.questionSlots = (stats.questionSlots || 20) + 5;
        await saveStats2(stats);
        bookReward = 1;
        await AsyncStorage.removeItem('challenge_bet');
      } else if (challengeMode) {
        await AsyncStorage.removeItem('challenge_bet');
      }

      const rewardResult = user?.uid
        ? await awardQuizCompletion(user.uid, {
            correctCount: finalScore,
            questionCount: totalQuestions,
            bonusXP: totalXPReward - baseXP,
            bonusCoins: totalCoinReward - baseCoins,
          })
        : null;

      const levelUpMessage = rewardResult && rewardResult.leveledUp > 0
        ? locale === 'ja'
          ? `\n🎉 レベルアップ！ +${rewardResult.levelUpCoins}コイン`
          : `\n🎉 Level Up! +${rewardResult.levelUpCoins} coins`
        : '';

      // 統計更新（missions 経由）
      try {
        const { loadStats: loadStats3, saveStats: saveStats3 } = await import('./missions');
        const stats = await loadStats3();
        const levelUpCoins = rewardResult?.levelUpCoins || 0;
        stats.totalCoinsEarned = (stats.totalCoinsEarned || 0) + totalCoinReward + levelUpCoins;
        await saveStats3(stats);
      } catch (e) {
        console.error('Failed to update coin stats:', e);
      }
      
      // 報酬メッセージを表示
      let rewardMessage = locale === 'ja' 
        ? `${finalScore}/${totalQuestions} 正解\n⚡ +${totalXPReward} XP\n✨ +${totalCoinReward} Qコイン${levelUpMessage}`
        : `${finalScore}/${totalQuestions} correct\n⚡ +${totalXPReward} XP\n✨ +${totalCoinReward} Q Coins${levelUpMessage}`;
      
      if (challengeMode && isPerfect) {
        rewardMessage += locale === 'ja'
          ? `\n🏆 チャレンジ成功！\n💰 賭け金返還 + 📚 本1冊！`
          : `\n🏆 Challenge Success!\n💰 Bet returned + 📚 1 book!`;
      } else if (challengeMode && !isPerfect) {
        rewardMessage += locale === 'ja'
          ? `\n💔 チャレンジ失敗... 賭け金消失`
          : `\n💔 Challenge Failed... Bet lost`;
      }
      
      if (bookReward > 0) {
        rewardMessage += locale === 'ja'
          ? `\n📚 本を${bookReward}冊獲得！（問題スロット+5）`
          : `\n📚 Got ${bookReward} book! (+5 question slots)`;
      }
      
      if (suddenDeathMode) {
        rewardMessage += locale === 'ja'
          ? `\n🔥 最大連続正解: ${maxCombo}問`
          : `\n🔥 Max Combo: ${maxCombo}`;
      }
      
      Alert.alert(
        locale === 'ja' ? '🎉 クイズ完了！' : '🎉 Quiz Complete!',
        rewardMessage
      );
    } catch (e) {
      console.error('finishQuiz error:', e);
    }

    navigate('/results', {
      state: {
        total: totalQuestions,
        score: finalScore,
        results: finalResults
      }
    });
  };

  const timerColor = timeLeft > timerLimit * 0.4 ? colors.success : timeLeft > timerLimit * 0.2 ? colors.warning : colors.error;
  const progressPercent = shuffledQuestions.length > 0 ? Math.round(((currentIndex) / shuffledQuestions.length) * 100) : 0;
  const timeMin = Math.floor(timeLeft / 60);
  const timeSec = timeLeft % 60;

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
        {/* ヘッダー（戻るボタン付き） */}
        <View style={[styles.header, { borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            📝 {locale === 'ja' ? 'クイズ設定' : 'Quiz Settings'}
          </Text>
          <TouchableOpacity
            style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }}
            onPress={() => { SoundManager.play('decide'); navigate('/'); }}
          >
            <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
              {locale === 'ja' ? '戻る' : 'Back'}
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 20, paddingBottom: 40 }}>
          {/* 問題数 ステッパー + スライダー */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
            <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 16 }]}>
              {locale === 'ja' ? '問題数' : 'Number of Questions'}
            </Text>
            {/* ステッパー */}
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
            {/* スライダー */}
            <View style={{ marginBottom: 12 }}>
              <input
                type="range"
                aria-label={locale === 'ja' ? '問題数を選択' : 'Select number of questions'}
                min="1"
                max={filtered.length}
                value={preQuestionCount}
                onChange={(e) => {
                  SoundManager.play('select');
                  setPreQuestionCount(parseInt(e.target.value, 10));
                }}
                className="quiz-range"
              />
            </View>
            {/* スライダー下の表示: filtered.length を使う（タグ絞り込み反映） */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>
              {locale === 'ja' ? '1問' : '1 Q'}
            </Text>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text }]}>
                {preQuestionCount} / {filtered.length}
              </Text>
              <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>{filtered.length}{locale === 'ja' ? '問' : 'Q'}</Text>
            </View>
            {/* タグ選択情報も併記 */}
            <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
              {selectedTags.length === 0
                ? `すべての問題（全${allQuestions.length}問）`
                : `「${selectedTags.join(', ')}」から ${filtered.length}問`
              }
            </Text>
          </View>

          {/* リバースモードトグル */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  🔄 {locale === 'ja' ? 'リバースモード' : 'Reverse Mode'}
                </Text>
                <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja' ? '回答を問題文として表示し、問題文を答えます' : 'Show the answer as the question, and answer the original question'}
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

          {/* 自動再生モード */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: autoPlayMode ? 16 : 0 }}>
              <View style={{ flex: 1, marginRight: 16 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  ▶ {locale === 'ja' ? '自動再生モード' : 'Auto Play Mode'}
                </Text>
                <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja'
                    ? '問題→答えを自動で切り替えて表示します'
                    : 'Automatically switches between question and answer'}
                </Text>
              </View>
              <TouchableOpacity
                style={[{
                  width: 56, height: 30, borderRadius: 15,
                  backgroundColor: autoPlayMode ? colors.primary : colors.border,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                }]}
                onPress={() => setAutoPlayMode(!autoPlayMode)}
              >
                <View style={[{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
                  alignSelf: autoPlayMode ? 'flex-end' : 'flex-start',
                }]} />
              </TouchableOpacity>
            </View>
            {autoPlayMode && (
              <View>
                <Text style={[{ fontSize: 13, color: colors.text, marginBottom: 8 }]}>
                  {locale === 'ja' ? `表示時間: ${autoPlayInterval}秒` : `Display time: ${autoPlayInterval}s`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[3, 5, 7, 10].map(sec => (
                    <TouchableOpacity
                      key={sec}
                      style={[{
                        flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
                        backgroundColor: autoPlayInterval === sec ? colors.primary : colors.background,
                        borderWidth: 1, borderColor: autoPlayInterval === sec ? colors.primary : colors.border,
                      }]}
                      onPress={() => setAutoPlayInterval(sec)}
                    >
                      <Text style={{ color: autoPlayInterval === sec ? '#000' : colors.text, fontWeight: '600' }}>
                        {sec}{locale === 'ja' ? '秒' : 's'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
          {autoPlayMode && (
            <Text style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>
              {locale === 'ja'
                ? '⚠ 自動再生中は他のモードは使用できません'
                : '⚠ Other modes are disabled during Auto Play'}
            </Text>
          )}

          {/* タイマー設定 */}
          <View
            pointerEvents={autoPlayMode ? 'none' : 'auto'}
            style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
              autoPlayMode && { opacity: 0.3 }
            ]}
          >
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

          {/* チャレンジモード */}
          <View
            pointerEvents={autoPlayMode ? 'none' : 'auto'}
            style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
              autoPlayMode && { opacity: 0.3 }
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  🪙 {locale === 'ja' ? 'チャレンジモード' : 'Challenge Mode'}
                </Text>
                <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja' ? '全問正解で報酬2倍！（参加費: 50コイン）' : 'Double rewards for perfect score! (Entry: 50 coins)'}
                </Text>
              </View>
              <Switch
                value={challengeMode}
                onValueChange={setChallengeMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFF"
              />
            </View>
          </View>

          {/* サドンデスモード */}
          <View
            pointerEvents={autoPlayMode ? 'none' : 'auto'}
            style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
              autoPlayMode && { opacity: 0.3 }
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  🤍 {locale === 'ja' ? 'サドンデスモード' : 'Sudden Death'}
                </Text>
                <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja' ? '間違えるとライフ減少。0で即終了！' : 'Lose life on mistake. Game over at 0!'}
                </Text>
              </View>
              <Switch
                value={suddenDeathMode}
                onValueChange={(val) => { setSuddenDeathMode(val); if (val) setPreQuestionCount(999); }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFF"
              />
            </View>
            {suddenDeathMode && (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                {[3, 2, 1].map(lives => (
                  <TouchableOpacity
                    key={lives}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, backgroundColor: suddenDeathLives === lives ? colors.primary : 'transparent' }]}
                    onPress={() => setSuddenDeathLives(lives)}
                  >
                    <Text style={[{ color: suddenDeathLives === lives ? '#fff' : colors.primary, fontWeight: 'bold', fontSize: 14 }]}>🤍 x {lives}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* タイムアタックモード */}
          <View
            pointerEvents={autoPlayMode ? 'none' : 'auto'}
            style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
              autoPlayMode && { opacity: 0.3 }
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  ⚡ {locale === 'ja' ? 'タイムアタック' : 'Time Attack'}
                </Text>
                <Text style={[{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja' ? '1問あたりの制限時間内に回答！' : 'Answer within time limit per question!'}
                </Text>
              </View>
              <Switch
                value={timeAttackMode}
                onValueChange={setTimeAttackMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFF"
              />
            </View>
            {timeAttackMode && (
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                {[3, 5, 10].map(seconds => (
                  <TouchableOpacity
                    key={seconds}
                    style={[{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, backgroundColor: timeAttackLimit === seconds ? colors.primary : 'transparent' }]}
                    onPress={() => setTimeAttackLimit(seconds)}
                  >
                    <Text style={[{ color: timeAttackLimit === seconds ? '#fff' : colors.primary, fontWeight: 'bold', fontSize: 14 }]}>{seconds}{locale === 'ja' ? '秒' : 'sec'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* タグ絞り込み */}
          {allTags.length > 0 && (
            <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 24 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[{ fontSize: 16, fontWeight: 'bold', color: colors.text }]}>
                  🏷️ {locale === 'ja' ? 'タグで絞り込み' : 'Filter by Tag'}
                </Text>
              </View>
              
              {/* タグ選択状況の表示（filtered.length で分子が変化） */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>
                  {selectedTags.length === 0
                    ? `選択なし = すべての問題（全${allQuestions.length}問）`
                    : `${selectedTags.length}個タグ選択中（最大${filtered.length}問）`
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
            style={[{ backgroundColor: colors.primary, padding: 18, borderRadius: isCyberpunk ? 0 : 16, alignItems: 'center', marginBottom: 12 }]}
            onPress={startQuiz}
          >
            <Text style={{ color: isCyberpunk ? '#1A1A1A' : '#fff', fontSize: 18, fontWeight: 'bold' }}>
              ▶ {locale === 'ja' ? 'スタート' : 'Start'}
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
                  <Text style={[styles.reviewAnswerLabel, { color: colors.textSecondary }]}>{t.yourAnswer}:</Text>
                  <Text style={[styles.reviewAnswerValue, { color: colors.text }]}>{String(answer.yourAnswer)}</Text>
                </View>
                <View style={styles.reviewAnswerItem}>
                  <Text style={[styles.reviewAnswerLabel, { color: colors.textSecondary }]}>{t.correctAnswer}:</Text>
                  <Text style={[styles.reviewAnswerValue, { color: colors.text }]}>{String(answer.correctAnswer)}</Text>
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
      {/* 最上部：タイマー・一時停止・中断ボタン */}
      {!autoPlayMode && (
        <View style={styles.topBar}>
          {/* 左側：タイマー */}
          <Text style={[styles.timer, { color: timerColor }]}>
            {preTimerMinutes === null ? (locale === 'ja' ? 'なし' : 'No limit') : `${timeMin}:${String(timeSec).padStart(2, '0')}`}
          </Text>
          
          {/* 中央：一時停止ボタン（絶対配置で中央に） */}
          <Pressable
            style={({ pressed }) => [
              styles.pauseBtn, 
              { 
                backgroundColor: isPaused ? colors.success : colors.primary,
                transform: [{ scale: pressed ? 0.95 : 1 }]
              }
            ]} 
            onPress={() => {
              SoundManager.play('decide');
              setIsPaused(!isPaused);
              setIsTimerActive(isPaused);
            }}
          >
            <Text style={[styles.pauseBtnText, { color: '#fff', fontWeight: 'bold' }]}>
              {isPaused ? '▶ 再開' : '⏸ 一時停止'}
            </Text>
          </Pressable>
          
          {/* 右側：中断ボタン（テーマカラー使用） */}
          <Pressable
            style={({ pressed }) => [
              styles.quitBtnTop, 
              { 
                backgroundColor: pressed ? colors.error : colors.primary,
                transform: [{ scale: pressed ? 0.95 : 1 }]
              }
            ]} 
            onPress={() => {
              SoundManager.play('decide');
              setShowConfirmModal(true);
            }}
          >
            <Text style={[styles.quitBtnTopText, { color: '#fff', fontWeight: 'bold', fontSize: 14 }]}>
              {locale === 'ja' ? 'クイズを中断' : 'Quit Quiz'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: colors.primary }]} />
      </View>

      {autoPlayMode && (
        <View style={[{ backgroundColor: colors.primary + '20', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={[{ color: colors.primary, fontSize: 13, fontWeight: '600' }]}>
            ▶ {locale === 'ja'
              ? (autoPlayPhase === 'question' ? '問題表示中' : '答え表示中')
              : (autoPlayPhase === 'question' ? 'Showing Question' : 'Showing Answer')}
          </Text>
          <Text style={[{ color: colors.primary, fontSize: 20, fontWeight: '700' }]}>
            {autoPlayCountdown}
          </Text>
        </View>
      )}

      {/* 自動再生中の答え表示エリア */}
      {autoPlayMode && autoPlayPhase === 'answer' && shuffledQuestions[currentIndex] && (
        <View style={[{ margin: 16, padding: 20, backgroundColor: colors.card, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: colors.success }]}>
          <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }]}>
            {locale === 'ja' ? '✅ 答え' : '✅ Answer'}
          </Text>
          <Text style={[{ fontSize: 20, fontWeight: '700', color: colors.text }]}>
            {isReverseMode
              ? shuffledQuestions[currentIndex].question
              : (shuffledQuestions[currentIndex].descriptiveAnswer
                || (shuffledQuestions[currentIndex].answerType === 'truefalse'
                  ? (shuffledQuestions[currentIndex].trueFalseAnswer ? '○' : '✕')
                  : shuffledQuestions[currentIndex].multipleChoice?.options?.[shuffledQuestions[currentIndex].multipleChoice.correctAnswer] || '')
              )
            }
          </Text>
        </View>
      )}

      {/* サドンデスモード: ライフ表示 */}
      {suddenDeathMode && quizStarted && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {Array.from({ length: currentLives }).map((_, i) => (
            <Text key={i} style={{ fontSize: 20, color: colors.error }}>🤍</Text>
          ))}
          {comboCount > 0 && (
            <Text style={{ fontSize: 14, color: colors.success, marginLeft: 12 }}>
              🔥 {comboCount}{locale === 'ja' ? '連続正解' : 'Combo'}
            </Text>
          )}
        </View>
      )}

      {/* スクロールが必要な部分 */}
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <View style={[{ position: 'relative', backgroundColor: colors.primary + '15', borderColor: colors.border, borderRadius: 20, padding: 22, marginBottom: 18, minHeight: 160, justifyContent: 'center', borderWidth: 1 }]}>
          {/* 問題数カウンターを右上に配置 */}
          {!autoPlayMode && (
            <View style={styles.questionCounterBadge}>
              <Text style={[styles.questionCounterText, { color: colors.primary }]}>
                {currentIndex + 1} / {shuffledQuestions.length}
              </Text>
            </View>
          )}
          
          {currentQuestion.topic && <Text style={[styles.topicBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{currentQuestion.topic}</Text>}
          
          {currentQuestion.image && (
            <View style={[{ position: 'relative', backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }]}>
              <img
                src={currentQuestion.image}
                alt="問題の画像"
                className="quiz-question-image"
              />
              
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
              ? getAnswerText(currentQuestion)
              : currentQuestion.question
            }
          </Text>

          {/* 正解時のLottieアニメーション（カード内の右下に配置） */}
          {showSuccessLottie && (
            <View style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              zIndex: 99,
            }} pointerEvents="none">
              <LottieView
                source={successJson}
                autoPlay
                loop={false}
                speed={2}
                style={{ width: 80, height: 80 }}
              />
            </View>
          )}

          {/* 不正解時のLottieアニメーション（カード内の右下に配置） */}
          {showErrorLottie && (
            <View style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              zIndex: 99,
            }} pointerEvents="none">
              <LottieView
                source={errorJson}
                autoPlay
                loop={false}
                speed={2}
                style={{ width: 80, height: 80 }}
              />
            </View>
          )}
        </View>

        {!autoPlayMode && (
          <View style={styles.answerRow}>
            {currentQuestion.answerType === 'truefalse' && (
              <View style={styles.trueFalseContainer}>
                <Animated.View
                  style={[
                    styles.answerBtn,
                    {
                      backgroundColor: colors.success,
                      transform: [
                        { scale: trueBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) },
                        { translateY: trueBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }
                      ]
                    }
                  ]}
                >
                  <Pressable
                    onPress={() => handleAnswer(true)}
                    disabled={answered || isPaused}
                    onPressIn={() => animateButton(trueBtnAnim, 1)}
                    onPressOut={() => animateButton(trueBtnAnim, 0)}
                    style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={styles.answerBtnText}>○</Text>
                  </Pressable>
                </Animated.View>
                <Animated.View
                  style={[
                    styles.answerBtn,
                    {
                      backgroundColor: colors.error,
                      transform: [
                        { scale: falseBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) },
                        { translateY: falseBtnAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }
                      ]
                    }
                  ]}
                >
                  <Pressable
                    onPress={() => handleAnswer(false)}
                    disabled={answered || isPaused}
                    onPressIn={() => animateButton(falseBtnAnim, 1)}
                    onPressOut={() => animateButton(falseBtnAnim, 0)}
                    style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Text style={styles.answerBtnText}>×</Text>
                  </Pressable>
                </Animated.View>
              </View>
            )}

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

            {currentQuestion.answerType === 'descriptive' && (
              <View style={styles.descriptiveContainer}>
                {isAllMatchMode && correctKeywords.length > 0 ? (
                  // 両解モード：複数の入力欄
                  <View style={{ width: '100%', gap: 12 }}>
                    <Text style={[{ fontSize: 14, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' }]}>
                      {locale === 'ja' ? '各キーワードを入力してください' : 'Enter each keyword'}
                    </Text>
                    {correctKeywords.map((keyword, index) => (
                      <TextInput
                        key={index}
                        style={[styles.descriptiveInput, { borderColor: colors.border, backgroundColor: colors.card }]}
                        value={userDescriptiveAnswers[index] || ''}
                        onChangeText={(text) => {
                          const newAnswers = [...userDescriptiveAnswers];
                          newAnswers[index] = text;
                          setUserDescriptiveAnswers(newAnswers);
                        }}
                        placeholder={locale === 'ja' ? `キーワード ${index + 1}` : `Keyword ${index + 1}`}
                        placeholderTextColor="#999"
                        editable={!answered && !isPaused}
                        onSubmitEditing={() => {
                          // 最後の入力欄でEnterを押したら回答を送信
                          if (index === correctKeywords.length - 1) {
                            const fullAnswer = userDescriptiveAnswers.join(' ');
                            handleAnswer(fullAnswer);
                          }
                        }}
                        returnKeyType={index === correctKeywords.length - 1 ? 'go' : 'next'}
                      />
                    ))}
                    <TouchableOpacity
                      style={[styles.descriptiveBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                      onPress={() => {
                        const fullAnswer = userDescriptiveAnswers.join(' ');
                        handleAnswer(fullAnswer);
                      }}
                      disabled={answered || isPaused || userDescriptiveAnswers.length !== correctKeywords.length}
                    >
                      <Text style={styles.descriptiveBtnText}>{t.checkAnswer}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  // 通常モード：単一の入力欄
                  <View style={{ width: '100%' }}>
                    <TextInput
                      style={[styles.descriptiveInput, { borderColor: colors.border, backgroundColor: colors.card }]}
                      value={userDescriptiveAnswer}
                      onChangeText={setUserDescriptiveAnswer}
                      placeholder={locale === 'ja' ? '回答を入力' : 'Enter your answer'}
                      placeholderTextColor="#999"
                      multiline
                      editable={!answered && !isPaused}
                      onSubmitEditing={() => {
                        // Enterキーで回答送信
                        handleAnswer(userDescriptiveAnswer);
                      }}
                      returnKeyType="go"
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
            )}
          </View>
        )}

        {autoPlayMode && (
          <View style={{ alignItems: 'center', marginTop: 32 }}>
            <TouchableOpacity
              style={[{ backgroundColor: colors.error, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 30 }]}
              onPress={() => {
                if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
                setShowConfirmModal(true);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                {locale === 'ja' ? '⏹ 自動再生を終了' : '⏹ Stop Auto Play'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

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

      {/* 中断確認モーダル（フルスクリーン改善） */}
      {showConfirmModal && (
        <View style={[styles.fullScreenOverlay, { backgroundColor: colors.background }]}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.background }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
              {locale === 'ja' ? 'クイズを中断' : 'Quit Quiz?'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? 'クイズを中断すると、現在の進捗は失われます。よろしいですか？'
                : 'Your progress will be lost. Are you sure?'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity 
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowConfirmModal(false);
                  setIsTimerActive(true);  // タイマー再開
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? '続ける' : 'Continue'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={() => {
                  if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
                  setShowConfirmModal(false);
                  setIsTimerActive(false);  // タイマー停止
                  navigate('/');
                }}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '中断する' : 'Quit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 備考（解説）の表示エリア */}
      {showExplanation && (
        <View style={[styles.explanationContainer, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
          <Text style={[styles.explanationTitle, { color: colors.primary }]}>
            💡 {locale === 'ja' ? '解説・備考' : 'Explanation'}
          </Text>
          <ScrollView style={{ maxHeight: 150 }}>
            <Text style={[styles.explanationText, { color: colors.text }]}>
              {explanationText}
            </Text>
          </ScrollView>
          <Text style={[styles.explanationTimer, { color: colors.textSecondary }]}>
            {locale === 'ja' ? '3秒後に次の問題へ...' : 'Next question in 3 seconds...'}
          </Text>
        </View>
      )}

      {/* 誤答時のフルスクリーンモーダル（長文対応） */}
      <Modal visible={showFeedback && !isCorrect && !!feedbackMessage} transparent animationType="fade">
        <View style={styles.fullScreenFeedback}>
          <View style={[styles.fullScreenCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.fullScreenIcon, { color: colors.error }]}>✗</Text>
            <Text style={[styles.fullScreenTitle, { color: colors.error }]}>
              {locale === 'ja' ? '不正解' : 'Incorrect'}
            </Text>
            
            <View style={[styles.fullScreenAnswerBox, { backgroundColor: colors.primary + '15', borderRadius: 16, padding: 24, minWidth: 200, maxWidth: '90%', maxHeight: '60%' }]}>
              <Text style={[styles.fullScreenAnswerLabel, { color: colors.textSecondary }]}>
                {locale === 'ja' ? '正解はこちら' : 'Correct Answer'}
              </Text>
              <ScrollView style={{ maxHeight: 200 }}>
                <Text style={[styles.fullScreenAnswerText, { color: colors.primary, fontSize: getAnswerModalFontSize(feedbackMessage, screenWidth), fontWeight: 'bold', textAlign: 'center' }]}>
                  {feedbackMessage}
                </Text>
              </ScrollView>
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
  container: { flex: 1, justifyContent: 'flex-start', alignItems: 'stretch', backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 16 },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 30, color: '#1A1A1A' },
  infoSubtitle: { fontSize: 16, color: '#666', marginBottom: 8 },
  infoBox: { width: '100%', backgroundColor: '#F7F8FA', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#EFEFEF' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  infoLabel: { fontSize: 14, color: '#666' },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  divider: { height: 1, backgroundColor: '#EFEFEF' },
  startButton: { backgroundColor: '#4CAF50', paddingVertical: 16, paddingHorizontal: 50, borderRadius: 14, marginBottom: 12 },
  startButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
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
  quizContainer: { flex: 1, backgroundColor: '#fff' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  quizContent: { 
    paddingHorizontal: 18, 
    paddingTop: 18, 
    paddingBottom: 28,
    flexGrow: 1,
  },
  topBar: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 12, 
    paddingHorizontal: 2,
    position: 'relative',
    minHeight: 44,
  },
  quitBtnTop: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10, 
    paddingHorizontal: 20, 
    borderRadius: 20,
  },
  quitBtnTopText: { fontSize: 14, fontWeight: '600' },
  timer: { fontSize: 20, fontWeight: 'bold', minWidth: 72, letterSpacing: 0.2 },
  pauseBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnText: { fontSize: 13, color: '#555', fontWeight: '600' },
  questionCounter: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  questionCounterBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  questionCounterText: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBar: { height: 7, borderRadius: 999, marginTop: 6, marginBottom: 18, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: '#007AFF', borderRadius: 999 },
  questionBox: { backgroundColor: '#F0F4FF', borderRadius: 20, padding: 22, marginBottom: 18, minHeight: 160, justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  topicBadge: { fontSize: 11, color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start', marginBottom: 12, fontWeight: '600' },
  questionText: { fontSize: 21, textAlign: 'center', color: '#1A1A1A', lineHeight: 32 },
  feedbackContainer: {
    marginVertical: 14,
    width: '100%',
  },
  feedbackBox: {
    padding: 18,
    borderRadius: 16,
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
  answerRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 16 },
  trueFalseContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 6,
    gap: 14,
  },
  answerBtn: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trueBtn: { backgroundColor: '#4CAF50' },
  falseBtn: { backgroundColor: '#F44336' },
  btnDisabled: { opacity: 0.4 },
  answerBtnText: { color: '#fff', fontSize: 48, fontWeight: 'bold' },
  quitBtn: { alignItems: 'center', justifyContent: 'center' },
  bottomButtons: { marginTop: 18, marginBottom: 28, alignItems: 'center' },
  quitBtnText: { color: '#CCC', fontSize: 13 },
  // Review styles
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, paddingHorizontal: 2 },
  reviewTitle: { fontSize: 24, fontWeight: 'bold', color: '#1A1A1A', letterSpacing: 0.2 },
  reviewList: { gap: 14, paddingBottom: 8 },
  reviewItem: { borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0' },
  reviewItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reviewQuestionNumber: { fontSize: 16, fontWeight: 'bold', color: '#64748B' },
  reviewResult: { fontSize: 14, fontWeight: 'bold' },
  reviewQuestionText: { fontSize: 16, color: '#1A1A1A', marginBottom: 12, lineHeight: 24 },
  explanationContainer: {
    marginHorizontal: 18,
    marginVertical: 12,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
  },
  explanationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 12,
  },
  explanationTimer: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '600',
  },
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
    width: '92%',
    maxWidth: 500,
    padding: 32,
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
    width: '90%',
    maxHeight: '60%',
  },
  fullScreenAnswerLabel: {
    marginBottom: 8,
  },
  fullScreenAnswerText: {
    fontWeight: 'bold',
    flexWrap: 'wrap',
    textAlign: 'center',
  },
  fullScreenTimer: {
    marginTop: 8,
  },
  // 中断確認モーダル（フルスクリーン改善）
  fullScreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
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
    width: '100%',
    height: '100%',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  confirmModalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'column',
    gap: 16,
  },
  confirmModalCancel: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmModalCancelText: {
    fontWeight: 'bold',
  },
  confirmModalConfirm: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmModalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  reviewAnswers: { gap: 8 },
  reviewAnswerItem: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  reviewAnswerLabel: { fontSize: 14, fontWeight: '600', flexShrink: 0 },
  reviewAnswerValue: { fontSize: 14, fontWeight: 'bold', flex: 1, textAlign: 'right' },
  descriptiveContainer: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 2,
  },
  descriptiveInput: {
    flex: 1,
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  descriptiveBtn: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 128,
  },
  descriptiveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  multipleContainer: {
    gap: 14,
    width: '100%',
  },
  multipleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    minHeight: 64,
  },
  multipleNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    minWidth: 36,
  },
  multipleText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  tagFilterSection: {
    width: '100%',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
  },
  tagFilterTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  tagFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
    gap: 8,
  },
  tagFilterList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tagFilterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
    marginRight: 4,
  },
  tagFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Lottieアニメーション用スタイル
  lottieOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  lottieAnimation: {
    width: 300,
    height: 300,
  },
});

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
import PressableButton from './components/PressableButton';
import { incrementStat, recordQuizAnswers, recordQuizStat, consumeQuickQuizCountCache } from './missions';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { useQuestionsContext } from './context/QuestionsContext';
import { checkDescriptiveAnswer, getAnswerText, getAnswerGroups } from './utils/answerUtils';
import { useMemo } from 'react';
import { STORAGE_KEYS } from './constants/storageKeys';
import { Question } from './types/question';
import { useAuth } from './auth/AuthContext';
import { awardQuizCompletion, incrementXP } from '../src/utils/userProgress';
import { speak as speakText, stopSpeech, getStoredVoicePreset, setStoredVoicePreset, VoicePreset, voicePresetLabels, speakText as speakTextWithPreset } from './utils/speechUtils';
import { Volume2, BookOpen, RefreshCw, Mic, ClipboardList, Flame, Folder, Play, Check, Pause, Heart, X } from 'lucide-react';
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
  const { colors, onPrimary, isCyberpunk, currentTheme, br } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
    const { questions: allQuestionsFromHook, folders, loading: questionsLoading } = useQuestionsContext();
  const { user } = useAuth();
  const screenWidth = Dimensions.get('window').width;

  // クイズ全体の状態
  const [quizStarted, setQuizStarted] = useState(false);
    // ルートで既にロード済みの問題を初期値として使う（ナビゲーション直後の「読み込み中」フラッシュ防止）
  const [allQuestions, setAllQuestions] = useState<Question[]>(() => allQuestionsFromHook.filter(q => q.enabled !== false));
  const [enabledQuestions, setEnabledQuestions] = useState<Question[]>(() => allQuestionsFromHook.filter(q => q.enabled !== false));
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
  /* UI強化: 選択肢カードの正誤ハイライト用に、ユーザーが選んだ選択肢を追跡する */
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(() => questionsLoading || allQuestionsFromHook.length === 0);
  const [userDescriptiveAnswer, setUserDescriptiveAnswer] = useState('');
  const [userDescriptiveAnswers, setUserDescriptiveAnswers] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 解説表示
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanationText, setExplanationText] = useState('');
  
  // 現在の問題を取得
  const currentQuestion = shuffledQuestions[currentIndex];
  
  // グループ構造の正解候補を取得
  const answerGroups = useMemo(() => {
    if (!currentQuestion || currentQuestion.answerType !== 'descriptive') return [];
    return getAnswerGroups(currentQuestion);
  }, [currentQuestion]);

  const isAllMatchMode = answerGroups.length > 1;

  // correctKeywords は互換性のため、グループ数分の配列として残す
  const correctKeywords = useMemo(() => {
    return answerGroups.map((_, i) => i);
  }, [answerGroups]);

  // Lottieアニメーション表示制御
  const [showSuccessLottie, setShowSuccessLottie] = useState(false);
  const [showErrorLottie, setShowErrorLottie] = useState(false);

  // 自動再生モード
  const [autoPlayMode, setAutoPlayMode] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [voicePreset, setVoicePreset] = useState<VoicePreset>('standard');
  const autoPlayInterval = 3;
  const [autoPlayPhase, setAutoPlayPhase] = useState<'question' | 'answer'>('question');
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(5);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPlayPhaseRef = useRef<'question' | 'answer'>('question');
  const autoPlayRemainingRef = useRef<number>(5);
  const autoPlaySessionRef = useRef(0);
  const currentIndexRef = useRef(0);

  // 無操作検知用（スリープ学習モード）
  const [lastInteraction, setLastInteraction] = useState(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // currentIndex が変わったら ref も更新
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // UI強化: 問題が切り替わったら選択状態をリセット（選択肢の正誤ハイライト用）
  useEffect(() => {
    setSelectedOptionIndex(null);
  }, [currentIndex]);

  // 長押し用 ref
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // プレ設定用 state
  // クイックアクション（ホーム → クイズ）からの即時開始カウントを一度だけ消費
  const [quickStartCount, setQuickStartCount] = useState<number | null>(() => consumeQuickQuizCountCache());
  const [showPreSettings, setShowPreSettings] = useState(() => quickStartCount == null);
  const [preQuestionCount, setPreQuestionCount] = useState<number>(() => quickStartCount ?? 0);
  const [isReverseMode, setIsReverseMode] = useState(false);

  // ゲーム機能用 state
  const [challengeMode, setChallengeMode] = useState(false);
  const [suddenDeathMode, setSuddenDeathMode] = useState(false);
  const [suddenDeathLives, setSuddenDeathLives] = useState(3);
  const [timeAttackMode, setTimeAttackMode] = useState(false);
  const [timeAttackLimit, setTimeAttackLimit] = useState(5);
  // ゲームモード選択（排他）
  const [selectedGameMode, setSelectedGameMode] = useState<'standard' | 'timeAttack' | 'suddenDeath' | 'challenge'>('standard');
  const [timeLimitSec, setTimeLimitSec] = useState(30); // 30/60/120
  const [suddenDeathLivesOpt, setSuddenDeathLivesOpt] = useState(3); // 3/5
  const [challengeBet, setChallengeBet] = useState(50); // 50/100
  const [currentLives, setCurrentLives] = useState(3);
  const [comboCount, setComboCount] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);

  // フォルダ選択用 state
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);

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

  // UI強化: 問題切り替え時のトランジションアニメーション
  const questionFadeAnim = useRef(new Animated.Value(1)).current;

  // ○×ボタンのバネアニメーション
  const trueBtnAnim = useRef(new Animated.Value(0)).current;
  const falseBtnAnim = useRef(new Animated.Value(0)).current;

  const animateButton = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      friction: 5,
      tension: 100,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  // UI強化: 問題が切り替わったらフェード＋スライドのトランジションを再生
  useEffect(() => {
    questionFadeAnim.setValue(0);
    Animated.timing(questionFadeAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [currentIndex, questionFadeAnim]);

  // ──────────────────────────────────────────────
  // 初期ロード
  // ──────────────────────────────────────────────
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
    getStoredVoicePreset().then(p => setVoicePreset(p));
  }, []);

  // ──────────────────────────────────────────────
  // 自動再生停止関数
  // ──────────────────────────────────────────────
  const stopAutoPlay = () => {
    console.log('Stopping auto-play');
    autoPlaySessionRef.current += 1;
    setAutoPlayMode(false);
    setQuizStarted(false);
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    stopSpeech();
  };

  const handleVoicePresetChange = async (preset: VoicePreset) => {
    setVoicePreset(preset);
    await setStoredVoicePreset(preset);
    SoundManager.play('decide');
    speakTextWithPreset(locale === 'ja' ? 'こんにちは！テストです。' : 'Hello! This is a test.', 'ja-JP', preset);
  };

  // ──────────────────────────────────────────────
  // 自動再生（音声完了待ち対応版）
  // ──────────────────────────────────────────────
  useEffect(() => {
    console.log('[AutoPlay] useEffect triggered:', {
      autoPlayMode,
      quizStarted,
      isPaused,
      speechEnabled,
      shuffledQuestionsLength: shuffledQuestions.length
    });

    if (!autoPlayMode || !quizStarted || isPaused || shuffledQuestions.length === 0) {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      autoPlaySessionRef.current += 1;
      stopSpeech();
      return;
    }

    if (autoPlayTimerRef.current) {
      console.log('[AutoPlay] Clearing existing timer');
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    const sessionId = ++autoPlaySessionRef.current;

    if (speechEnabled) {
      const PAUSE_AFTER_SPEECH = 500;

      const wait = (ms: number): Promise<boolean> => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            autoPlayTimerRef.current = null;
            resolve(sessionId === autoPlaySessionRef.current);
          }, ms);
          autoPlayTimerRef.current = timer;
        });
      };

      const isActive = () => sessionId === autoPlaySessionRef.current;

      const playQuestion = async (idx: number) => {
        if (!isActive()) return;

        const q = shuffledQuestions[idx];
        if (!q) return;

        autoPlayPhaseRef.current = 'question';
        setAutoPlayPhase('question');
        console.log(`[AutoPlay] Question phase: #${idx + 1}`);

        const textToSpeak = q.reading || q.question;
        console.log('About to speak question, using:', typeof speakText);
        await speakText(textToSpeak);
        console.log('Question speech completed');

        if (!isActive()) return;

        if (!await wait(PAUSE_AFTER_SPEECH)) return;
        if (!isActive()) return;

        await playAnswer(idx);
      };

      const playAnswer = async (idx: number) => {
        if (!isActive()) return;

        const q = shuffledQuestions[idx];
        if (!q) return;

        autoPlayPhaseRef.current = 'answer';
        setAutoPlayPhase('answer');
        console.log(`[AutoPlay] Answer phase: #${idx + 1}`);

        const answerText = getAnswerText(q);
        await speakText(answerText);

        if (!isActive()) return;

        if (!await wait(PAUSE_AFTER_SPEECH)) return;
        if (!isActive()) return;

        const nextIdx = idx + 1;
        if (nextIdx >= shuffledQuestions.length) {
          console.log('[AutoPlay] All questions completed');
          setQuizCompleted(true);
          
          await wait(10000);
          if (!isActive()) return;
          
          if (quizCompleted) {
            console.log('[AutoPlay] Auto-restarting after 10 seconds');
            setQuizCompleted(false);
            currentIndexRef.current = 0;
            setCurrentIndex(0);
            if (!isActive()) return;
            await playQuestion(0);
          }
        } else {
          currentIndexRef.current = nextIdx;
          setCurrentIndex(nextIdx);
          questionStartTime.current = Date.now();
          if (!isActive()) return;
          await playQuestion(nextIdx);
        }
      };

      playQuestion(currentIndexRef.current);

      return () => {
        if (autoPlayTimerRef.current) {
          clearTimeout(autoPlayTimerRef.current);
          autoPlayTimerRef.current = null;
        }
      };
    }

    // タイマーベースモード
    autoPlayPhaseRef.current = 'question';
    setAutoPlayPhase('question');
    autoPlayRemainingRef.current = autoPlayInterval;
    setAutoPlayCountdown(autoPlayRemainingRef.current);
    console.log('[AutoPlay] Starting timer-based mode, interval:', autoPlayInterval);

    const tick = () => {
      if (sessionId !== autoPlaySessionRef.current) {
        return;
      }

      autoPlayRemainingRef.current -= 1;
      setAutoPlayCountdown(autoPlayRemainingRef.current);
      console.log('[AutoPlay] Countdown:', autoPlayRemainingRef.current, 'Phase:', autoPlayPhaseRef.current);

      if (autoPlayRemainingRef.current <= 0) {
        if (autoPlayPhaseRef.current === 'question') {
          console.log('[AutoPlay] Switching to answer phase');
          autoPlayPhaseRef.current = 'answer';
          setAutoPlayPhase('answer');
          autoPlayRemainingRef.current = autoPlayInterval;
          setAutoPlayCountdown(autoPlayRemainingRef.current);
        } else {
          const nextIdx = currentIndexRef.current + 1;
          console.log('[AutoPlay] Moving to next question:', nextIdx, '/', shuffledQuestions.length);

          if (nextIdx >= shuffledQuestions.length) {
            console.log('[AutoPlay] All questions completed');
            if (autoPlayMode) {
              console.log('[AutoPlay] Looping back to start (auto-play mode)');
              currentIndexRef.current = 0;
              setCurrentIndex(0);
              autoPlayPhaseRef.current = 'question';
              setAutoPlayPhase('question');
              autoPlayRemainingRef.current = autoPlayInterval;
              setAutoPlayCountdown(autoPlayRemainingRef.current);
            } else {
              autoPlaySessionRef.current += 1;
              if (autoPlayTimerRef.current) {
                clearTimeout(autoPlayTimerRef.current);
                autoPlayTimerRef.current = null;
              }
              navigate('/results', {
                state: { total: shuffledQuestions.length, score: 0, results: [] }
              });
            }
          } else {
            currentIndexRef.current = nextIdx;
            setCurrentIndex(nextIdx);
            questionStartTime.current = Date.now();

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
  }, [autoPlayMode, quizStarted, isPaused, autoPlayInterval, shuffledQuestions.length, speechEnabled]);

  // ──────────────────────────────────────────────
  // 無操作検知（スリープ学習モード用）
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlayMode || !quizStarted || speechEnabled) {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }

    const checkInactivity = () => {
      const now = Date.now();
      const elapsed = (now - lastInteraction) / 1000;
      
      if (elapsed >= 10) {
        console.log('No interaction for 10s, repeating question');
        setLastInteraction(Date.now());
      }
    };

    inactivityTimerRef.current = setInterval(checkInactivity, 1000);

    return () => {
      if (inactivityTimerRef.current) {
        clearInterval(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [autoPlayMode, quizStarted, speechEnabled, lastInteraction]);

    // コンテキストのデータをローカル state に反映（初回は lazy init で済む）
  useEffect(() => {
    if (allQuestionsFromHook.length === 0) {
      // ロード完了後に空で確定していればローディング解除（0 問のときの stuck を防ぐ）
      if (!questionsLoading) setIsLoading(false);
      return;
    }
    const enabled = allQuestionsFromHook.filter(q => q.enabled !== false);
    setAllQuestions(enabled);
    setEnabledQuestions(enabled);

    setPreQuestionCount(enabled.length);
    setIsLoading(false);
  }, [allQuestionsFromHook, questionsLoading]);

  // クイックアクション（ホーム → クイズ）からの即時開始：
  // 設定画面をスキップして指定問題数で直ちにクイズを開始する
  const quickStartAppliedRef = useRef(false);
  useEffect(() => {
    if (quickStartCount == null) return;
    if (quickStartAppliedRef.current) return;
    if (allQuestions.length === 0) return;
    quickStartAppliedRef.current = true;
    startQuiz(quickStartCount);
  }, [allQuestions.length, quickStartCount]);

  const loadTimerPresets = async () => {
    try {
      const savedTimer = await AsyncStorage.getItem('quiz_active_timer');
      if (savedTimer !== null) {
        const parsed = parseInt(savedTimer, 10);
        setPreTimerMinutes(isNaN(parsed) ? null : parsed);
      } else {
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

  // 選択したフォルダでフィルタリングされた問題
  const getFilteredQuestions = () => {
    let filtered = allQuestions;
    if (selectedFolderIds.length > 0) {
      const selectedQuestionIds = new Set<number>();
      folders
        .filter(f => selectedFolderIds.includes(f.id))
        .forEach(f => f.questionIds.forEach(qid => selectedQuestionIds.add(qid)));
      
      if (selectedQuestionIds.size > 0) {
        filtered = filtered.filter(q => selectedQuestionIds.has(q.id));
      }
    }
    return filtered;
  };

  const prevFilteredLengthRef = useRef<number | null>(null);

  useEffect(() => {
    const filtered = getFilteredQuestions();
    const prevMax = prevFilteredLengthRef.current;

    if (preQuestionCount > filtered.length) {
      setPreQuestionCount(filtered.length > 0 ? filtered.length : 1);
    } else if (prevMax !== null && preQuestionCount === prevMax && filtered.length > prevMax) {
      setPreQuestionCount(filtered.length);
    }

    prevFilteredLengthRef.current = filtered.length;
  }, [selectedFolderIds]);

  // ──────────────────────────────────────────────
  // カウントダウンタイマー
  // ──────────────────────────────────────────────
  useEffect(() => {
    if (!isTimerActive || !quizStarted) return;
    if (timeLeft <= 0) {
      setIsTimerActive(false);
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
    
    const finalResults = [...results, ...unansweredResults];
    await finishQuizWithResults(finalResults);
  };

  // ──────────────────────────────────────────────
  // クイズ開始
  // ──────────────────────────────────────────────
  const startQuiz = async (overrideCount?: number) => {
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

    // ゲームモードのフラグをリセットしてから、選択されたモードを適用
    setChallengeMode(false);
    setSuddenDeathMode(false);
    setTimeAttackMode(false);
    switch (selectedGameMode) {
      case 'timeAttack':
        setTimeAttackMode(true);
        setTimeAttackLimit(timeLimitSec);
        break;
      case 'suddenDeath':
        setSuddenDeathMode(true);
        setSuddenDeathLives(suddenDeathLivesOpt);
        break;
      case 'challenge':
        setChallengeMode(true);
        break;
      case 'standard':
      default:
        break;
    }

    if (challengeMode) {
      const betAmount = challengeBet;
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
      await AsyncStorage.setItem('user_coins', (coins - betAmount).toString());
      await AsyncStorage.setItem('challenge_bet', betAmount.toString());
    }

    if (preTimerMinutes !== null) {
      await AsyncStorage.setItem('quiz_active_timer', preTimerMinutes.toString());
    } else {
      await AsyncStorage.removeItem('quiz_active_timer');
    }

                let shuffled = [...filtered].sort(() => Math.random() - 0.5);
    // クイックアクションから指定された問題数を優先（未指定時はスライダー値）
    const quizCount = Math.max(1, Math.min(overrideCount ?? preQuestionCount, filtered.length));
    if (!suddenDeathMode) {
      shuffled = shuffled.slice(0, quizCount);
    } else {
      setPreQuestionCount(filtered.length);
      shuffled = [...filtered].sort(() => Math.random() - 0.5);
    }

    setShuffledQuestions(shuffled);
    setCurrentIndex(0);
    setScore(0);
    setResults([]);
    setUserAnswers([]);
    setShowFeedback(false);
    setAnswered(false);

    if (suddenDeathMode) {
      setCurrentLives(suddenDeathLives);
      setComboCount(0);
      setMaxCombo(0);
    }

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
  const isSubmittingRef = useRef(false);
  useEffect(() => {
    isSubmittingRef.current = answered;
  }, [answered]);

  const handleAnswer = async (answer: boolean | number | string) => {
    if (isSubmittingRef.current || answered) return;
    isSubmittingRef.current = true;
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
          setFeedbackMessage(actualCorrectAnswer ? '○' : '');
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
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();

    if (correct) {
      setShowSuccessLottie(true);
      setTimeout(() => setShowSuccessLottie(false), 2500);
    } else {
      setShowErrorLottie(true);
      setTimeout(() => setShowErrorLottie(false), 2500);
    }

    if (correct && !timeAttackMode && (currentQuestion.answerType === 'truefalse' || currentQuestion.answerType === 'multiple') && (currentQuestion.explanation || currentQuestion.wrongReason)) {
      setIsTimerActive(false);
      setShowExplanation(true);
      setExplanationText(currentQuestion.explanation || currentQuestion.wrongReason || '');

      setTimeout(async () => {
        setShowExplanation(false);
        setExplanationText('');
        setIsTimerActive(true);

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
      // 日別・週別の学習統計に記録（ホーム画面の統計カード用）
      await recordQuizStat(finalScore, totalQuestions);
      
      const baseXP = finalScore * 20;
      const baseCoins = finalScore * 10;
      let totalXPReward = baseXP;
      let totalCoinReward = baseCoins;
      let bookReward = 0;

      const isPerfect = finalScore === totalQuestions;
      if (isPerfect) {
        totalCoinReward += 10;
      }

      let challengeBet = 0;
      if (challengeMode) {
        challengeBet = parseInt(await AsyncStorage.getItem('challenge_bet') || '0', 10);

        if (isPerfect) {
          totalXPReward *= 2;
          totalCoinReward *= 2;
          totalCoinReward += challengeBet;
        }
      }

      const quizMode = await AsyncStorage.getItem('quiz_mode');
      const isBossMode = quizMode === 'weak';
      if (isBossMode) {
        totalXPReward = Math.floor(totalXPReward * 1.5);
        await AsyncStorage.removeItem('quiz_mode');
      }

      if (suddenDeathMode && maxCombo > 0) {
        totalCoinReward += Math.floor(maxCombo / 2);
      }

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
          ? `\nレベルアップ！ +${rewardResult.levelUpCoins}コイン`
          : `\nLevel Up! +${rewardResult.levelUpCoins} coins`
        : '';

      try {
        const { loadStats: loadStats3, saveStats: saveStats3 } = await import('./missions');
        const stats = await loadStats3();
        const levelUpCoins = rewardResult?.levelUpCoins || 0;
        stats.totalCoinsEarned = (stats.totalCoinsEarned || 0) + totalCoinReward + levelUpCoins;
        await saveStats3(stats);
      } catch (e) {
        console.error('Failed to update coin stats:', e);
      }
      
      let rewardMessage = locale === 'ja' 
        ? `${finalScore}/${totalQuestions} 正解\n+${totalXPReward} XP\n+${totalCoinReward} Qコイン${levelUpMessage}`
        : `${finalScore}/${totalQuestions} correct\n+${totalXPReward} XP\n+${totalCoinReward} Q Coins${levelUpMessage}`;
      
      if (challengeMode && isPerfect) {
        rewardMessage += locale === 'ja'
          ? `\nチャレンジ成功！\n賭け金返還 + 本1冊！`
          : `\nChallenge Success!\nBet returned + 1 book!`;
      } else if (challengeMode && !isPerfect) {
        rewardMessage += locale === 'ja'
          ? `\nチャレンジ失敗... 賭け金消失`
          : `\nChallenge Failed... Bet lost`;
      }
      
      if (bookReward > 0) {
        rewardMessage += locale === 'ja'
          ? `\n本を${bookReward}冊獲得！（問題スロット+5）`
          : `\nGot ${bookReward} book! (+5 question slots)`;
      }
      
      if (suddenDeathMode) {
        rewardMessage += locale === 'ja'
          ? `\n最大連続正解: ${maxCombo}問`
          : `\nMax Combo: ${maxCombo}`;
      }
      
      Alert.alert(
        locale === 'ja' ? 'クイズ完了！' : 'Quiz Complete!',
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

  // ローディング中
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[{ fontSize: 16, color: colors.text }]}>読み込み中...</Text>
      </View>
    );
  }

  // プレ設定画面
  if (showPreSettings) {
    const filtered = getFilteredQuestions();
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <PressableButton
            style={{ minHeight: 44, minWidth: 44, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: br, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' }}
            onPress={() => { SoundManager.play('decide'); navigate('/'); }}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>← {locale === 'ja' ? '戻る' : 'Back'}</Text>
          </PressableButton>
          <Text style={[styles.headerTitle, { color: colors.text, fontFamily: 'monospace', letterSpacing: 1, flex: 1, flexShrink: 1 }]} numberOfLines={1}>
            <ClipboardList size={20} color={colors.primary} style={{ marginRight: 6 }} />$ SELECT QUIZ CONFIG
          </Text>
        </View>

        <ScrollView contentContainerStyle={[styles.quizContent, { flexGrow: 1 }]}>
          <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }]}>
            <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 10 }]}>
              TRANSFER COUNT
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 10 }}>
              <PressableButton
                style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => setPreQuestionCount(prev => Math.max(1, prev - 1))}
                onLongPress={() => startLongPress('dec', filtered.length)}
                onPressOut={stopLongPress}
                delayLongPress={500}
              >
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>−</Text>
              </PressableButton>
              <Text style={[{ fontSize: 36, fontWeight: '700', color: colors.primary, minWidth: 70, textAlign: 'center' }]}>
                {preQuestionCount}
              </Text>
              <PressableButton
                style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}
                onPress={() => {
                  const maxCount = filtered.length;
                  setPreQuestionCount(prev => Math.min(maxCount, prev + 1));
                }}
                onLongPress={() => startLongPress('inc', filtered.length)}
                onPressOut={stopLongPress}
                delayLongPress={500}
              >
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>＋</Text>
              </PressableButton>
            </View>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>
              {locale === 'ja' ? '1問' : '1 Q'}
            </Text>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: colors.text }]}>
                {preQuestionCount} / {filtered.length}
              </Text>
              <Text style={[{ fontSize: 12, color: colors.textSecondary }]}>{filtered.length}{locale === 'ja' ? '問' : 'Q'}</Text>
            </View>
          </View>

          {folders.length > 0 && (
            <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 }]}>
              <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, fontFamily: 'monospace', letterSpacing: 1 }]}>
                <Folder size={18} color={colors.primary} style={{ marginRight: 4 }} />{locale === 'ja' ? '問題集で絞り込み' : 'Filter by Folder'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {folders.map(folder => {
                    const isSelected = selectedFolderIds.includes(folder.id);
                    return (
                      <PressableButton
                        key={folder.id}
                        style={[{
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 20,
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary : 'transparent',
                        }]}
                        onPress={() => {
                          SoundManager.play('select');
                          setSelectedFolderIds(prev =>
                            prev.includes(folder.id)
                              ? prev.filter(id => id !== folder.id)
                              : [...prev, folder.id]
                          );
                        }}
                      >
                        <Text style={[{
                          color: isSelected ? '#fff' : colors.text,
                          fontWeight: '600',
                          fontSize: 13,
                        }]}>
                          {folder.name}
                        </Text>
                      </PressableButton>
                    );
                  })}
                </View>
              </ScrollView>
              {selectedFolderIds.length > 0 && (
                <Text style={[{ fontSize: 11, color: colors.textSecondary, marginTop: 8 }]}>
                  {locale === 'ja'
                    ? `${selectedFolderIds.length}個のフォルダを選択中`
                    : `${selectedFolderIds.length} folder(s) selected`}
                </Text>
              )}
            </View>
          )}

          <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, fontFamily: 'monospace', letterSpacing: 1 }]}>
                  <RefreshCw size={18} color={colors.primary} style={{ marginRight: 4 }} />REVERSE SYNAPSE
                </Text>
                <Text style={[{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja' ? '回答を問題文として表示し、問題文を答えます' : 'Show the answer as the question, and answer the original question'}
                </Text>
              </View>
              <PressableButton
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
              </PressableButton>
            </View>
          </View>

          {/* GAME MODE */}
          <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }]}>
            <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 10 }]}>
              $ GAME MODE
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['standard', 'timeAttack', 'suddenDeath', 'challenge'] as const).map((mode) => {
                const labels: Record<typeof mode, string> = {
                  standard: 'STANDARD',
                  timeAttack: 'TIME ATTACK',
                  suddenDeath: 'SUDDEN DEATH',
                  challenge: 'CHALLENGE',
                };
                const active = selectedGameMode === mode;
                return (
                  <PressableButton
                    key={mode}
                    style={[{
                      flex: 1,
                      minWidth: 60,
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary + '20' : 'transparent',
                      alignItems: 'center',
                    }]}
                    onPress={() => {
                      SoundManager.play('select');
                      setSelectedGameMode(mode);
                    }}
                  >
                    <Text style={[{
                      fontSize: 11,
                      fontWeight: active ? '700' : '500',
                      color: active ? colors.primary : colors.textSecondary,
                      fontFamily: 'monospace',
                      letterSpacing: 0.5,
                    }]}>
                      {labels[mode]}
                    </Text>
                  </PressableButton>
                );
              })}
            </View>

            {/* サブオプション（選択されたモードに応じて表示） */}
            {selectedGameMode === 'timeAttack' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'monospace' }}>LIMIT:</Text>
                {[30, 60, 120].map((sec) => (
                  <PressableButton
                    key={sec}
                    style={[{
                      paddingVertical: 4,
                      paddingHorizontal: 12,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: timeLimitSec === sec ? colors.primary : colors.border,
                      backgroundColor: timeLimitSec === sec ? colors.primary + '20' : 'transparent',
                    }]}
                    onPress={() => setTimeLimitSec(sec)}
                  >
                    <Text style={{ fontSize: 11, color: timeLimitSec === sec ? colors.primary : colors.textSecondary, fontFamily: 'monospace' }}>{sec}s</Text>
                  </PressableButton>
                ))}
              </View>
            )}

            {selectedGameMode === 'suddenDeath' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'monospace' }}>LIVES:</Text>
                {[3, 5].map((lives) => (
                  <PressableButton
                    key={lives}
                    style={[{
                      paddingVertical: 4,
                      paddingHorizontal: 12,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: suddenDeathLivesOpt === lives ? colors.primary : colors.border,
                      backgroundColor: suddenDeathLivesOpt === lives ? colors.primary + '20' : 'transparent',
                    }]}
                    onPress={() => setSuddenDeathLivesOpt(lives)}
                  >
                    <Text style={{ fontSize: 11, color: suddenDeathLivesOpt === lives ? colors.primary : colors.textSecondary, fontFamily: 'monospace' }}>♥ {lives}</Text>
                  </PressableButton>
                ))}
              </View>
            )}

            {selectedGameMode === 'challenge' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: 'monospace' }}>BET:</Text>
                {[50, 100].map((bet) => (
                  <PressableButton
                    key={bet}
                    style={[{
                      paddingVertical: 4,
                      paddingHorizontal: 12,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderColor: challengeBet === bet ? colors.primary : colors.border,
                      backgroundColor: challengeBet === bet ? colors.primary + '20' : 'transparent',
                    }]}
                    onPress={() => setChallengeBet(bet)}
                  >
                    <Text style={{ fontSize: 11, color: challengeBet === bet ? colors.primary : colors.textSecondary, fontFamily: 'monospace' }}>🪙 {bet}</Text>
                  </PressableButton>
                ))}
              </View>
            )}
          </View>

          <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: autoPlayMode ? 12 : 0 }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text }]}>
                  <Play size={18} color={colors.primary} style={{ marginRight: 4 }} />{locale === 'ja' ? '自動再生モード' : 'Auto Play Mode'}
                </Text>
                <Text style={[{ fontSize: 11, color: colors.textSecondary, marginTop: 4 }]}>
                  {locale === 'ja'
                    ? '問題→答えを自動で切り替えて表示します'
                    : 'Automatically switches between question and answer'}
                </Text>
              </View>
              <PressableButton
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
              </PressableButton>
            </View>
            {autoPlayMode && (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <Text style={[{ fontSize: 13, color: colors.text }]}>
                    <Volume2 size={16} color={colors.primary} style={{ marginRight: 6 }} />{locale === 'ja' ? '音声読み上げ' : 'Voice Reading'}
                  </Text>
                  <Switch
                    value={speechEnabled}
                    onValueChange={setSpeechEnabled}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFF"
                  />
                </View>
                {speechEnabled && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[{ fontSize: 13, color: colors.text, marginBottom: 8 }]}>
                      <Mic size={16} color={colors.primary} style={{ marginRight: 6 }} />{locale === 'ja' ? 'ボイスプリセット' : 'Voice Preset'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {(['standard', 'yukkuri', 'slow', 'energetic', 'calm', 'deep'] as VoicePreset[]).map((preset) => (
                        <PressableButton
                          key={preset}
                          style={{
                            backgroundColor: voicePreset === preset ? colors.primary : colors.background,
                            borderColor: voicePreset === preset ? colors.primary : colors.border,
                            borderWidth: 1,
                            borderRadius: 10,
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                          }}
                          onPress={() => handleVoicePresetChange(preset)}
                        >
                          <Text style={{
                            color: voicePreset === preset ? (isCyberpunk ? '#1A1A1A' : '#fff') : colors.text,
                            fontSize: 13,
                            fontWeight: '600',
                          }}>
                            {voicePresetLabels[preset]}
                          </Text>
                        </PressableButton>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
          {autoPlayMode && (
            <Text style={{ fontSize: 11, color: colors.warning, marginTop: 6 }}>
              {locale === 'ja'
                ? '自動再生中は他のモードは使用できません'
                : 'Other modes are disabled during Auto Play'}
            </Text>
          )}

          <PressableButton
            style={[styles.startButton, { backgroundColor: colors.primary }]}
            onPress={() => startQuiz()}
          >
            <Text style={[styles.startButtonText, { color: onPrimary, fontFamily: 'monospace', letterSpacing: 1 }]}>
              ▶ EXECUTE TRANSFER
            </Text>
          </PressableButton>
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
          <PressableButton 
            style={[styles.backButtonFull, { backgroundColor: colors.primary }]}
            onPress={() => {
              SoundManager.play('decide');
              navigate('/');
            }}
          >
            <Text style={[styles.backButtonFullText, { color: onPrimary }]}>{t.backToHome}</Text>
          </PressableButton>
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
      {!autoPlayMode && (
        <View style={styles.topBar}>
          <Text style={[styles.timer, { color: timerColor, fontFamily: 'monospace', letterSpacing: 1 }]}>
            TIMER: {preTimerMinutes === null ? (locale === 'ja' ? 'なし' : 'No limit') : `${timeMin}:${String(timeSec).padStart(2, '0')}`}
          </Text>
          
          <Pressable
            style={({ pressed }) => [
              styles.pauseBtn, 
              { 
                backgroundColor: isPaused ? colors.success : colors.primary,
                borderRadius: isCyberpunk ? 0 : 999,
                transform: [{ scale: pressed ? 0.95 : 1 }]
              }
            ]} 
            onPress={() => {
              SoundManager.play('decide');
              setIsPaused(!isPaused);
              setIsTimerActive(isPaused);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {isPaused
                ? <><Play size={18} color={isCyberpunk ? '#000' : '#fff'} /><Text style={[styles.pauseBtnText, { color: isCyberpunk ? '#000' : '#fff', fontWeight: 'bold' }]}>再開</Text></>
                : <><Pause size={18} color={isCyberpunk ? '#000' : '#fff'} /><Text style={[styles.pauseBtnText, { color: isCyberpunk ? '#000' : '#fff', fontWeight: 'bold' }]}>一時停止</Text></>}
            </View>
          </Pressable>
          
          <Pressable
            style={({ pressed }) => [
              styles.quitBtnTop, 
              { 
                backgroundColor: pressed ? colors.error : colors.primary,
                borderRadius: isCyberpunk ? 0 : 20,
                transform: [{ scale: pressed ? 0.95 : 1 }]
              }
            ]} 
            onPress={() => {
              SoundManager.play('decide');
              setShowConfirmModal(true);
            }}
          >
            <Text style={[styles.quitBtnTopText, { color: isCyberpunk ? '#000' : '#fff', fontWeight: 'bold', fontSize: 14 }]}>
              {locale === 'ja' ? 'クイズを中断' : 'Quit Quiz'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.progressArea}>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: colors.primary }]} />
        </View>
        {!autoPlayMode && (
          <View style={styles.progressMetaRow}>
            <Text style={[styles.progressMetaText, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? `残り ${shuffledQuestions.length - currentIndex} 問`
                : `${shuffledQuestions.length - currentIndex} remaining`}
            </Text>
            <Text style={[styles.progressMetaText, { color: colors.textSecondary }]}>
              {progressPercent}%
            </Text>
          </View>
        )}
      </View>

      {autoPlayMode && (
        <View style={[{ backgroundColor: colors.primary + '20', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={[{ color: colors.primary, fontSize: 13, fontWeight: '600' }]}>
            {locale === 'ja'
              ? (autoPlayPhase === 'question' ? '問題表示中' : '答え表示中')
              : (autoPlayPhase === 'question' ? 'Showing Question' : 'Showing Answer')}
          </Text>
          <Text style={[{ color: colors.primary, fontSize: 20, fontWeight: '700' }]}>
            {autoPlayCountdown}
          </Text>
        </View>
      )}

      {autoPlayMode && autoPlayPhase === 'answer' && shuffledQuestions[currentIndex] && (
        <View style={[{ margin: 16, padding: 20, backgroundColor: colors.card, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: colors.success }]}>
          <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }]}>
            {locale === 'ja' ? '答え' : 'Answer'}
          </Text>
          <Text style={[{ fontSize: 20, fontWeight: '700', color: colors.text }]}>
            {isReverseMode
              ? shuffledQuestions[currentIndex].question
              : (shuffledQuestions[currentIndex].descriptiveAnswer
                || (shuffledQuestions[currentIndex].answerType === 'truefalse'
                  ? (shuffledQuestions[currentIndex].trueFalseAnswer ? '○' : '')
                  : shuffledQuestions[currentIndex].multipleChoice?.options?.[shuffledQuestions[currentIndex].multipleChoice?.correctAnswer ?? 0] || '')
              )
            }
          </Text>
        </View>
      )}

      {suddenDeathMode && quizStarted && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {Array.from({ length: currentLives }).map((_, i) => (
            <Heart key={i} size={20} color={colors.error} fill={colors.error} />
          ))}
          {comboCount > 0 && (
            <Text style={{ fontSize: 14, color: colors.success, marginLeft: 12 }}>
               {comboCount}{locale === 'ja' ? '連続正解' : 'Combo'}
            </Text>
          )}
        </View>
      )}

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[
            { backgroundColor: colors.primary + '15', borderColor: colors.border, borderRadius: 20, padding: 22, marginBottom: 18, minHeight: 160, justifyContent: 'center', borderWidth: 1 },
            { opacity: questionFadeAnim, transform: [{ translateY: questionFadeAnim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
          ]}
        >
          {(currentQuestion.topic || !autoPlayMode) && (
            <View style={styles.questionHeaderRow}>
              {currentQuestion.topic ? (
                <Text style={[styles.topicBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{currentQuestion.topic}</Text>
              ) : <View />}
              {!autoPlayMode && (
                <View style={styles.questionCounterBadge}>
                  <Text style={[styles.questionCounterText, { color: colors.primary }]}>
                    {currentIndex + 1} / {shuffledQuestions.length}{locale === 'ja' ? '問' : ''}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* UI強化: タグ・カテゴリのチップ表示 */}
          {currentQuestion.tags && currentQuestion.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {currentQuestion.tags.slice(0, 5).map((tag, ti) => (
                <Text key={ti} style={[styles.tagPill, { color: colors.primary, backgroundColor: colors.primary + '18', borderColor: colors.primary + '33' }]}>
                  {tag}
                </Text>
              ))}
            </View>
          )}

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

          {showSuccessLottie && (
            <View style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              zIndex: 99,
              pointerEvents: 'none',
            }}>
              <LottieView
                source={successJson}
                autoPlay
                loop={false}
                speed={2}
                style={{ width: 80, height: 80 }}
              />
            </View>
          )}

          {showErrorLottie && (
            <View style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              zIndex: 99,
              pointerEvents: 'none',
            }}>
              <LottieView
                source={errorJson}
                autoPlay
                loop={false}
                speed={2}
                style={{ width: 80, height: 80 }}
              />
            </View>
          )}

        </Animated.View>

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
                {(() => {
                  const correctIndex = currentQuestion.multipleChoice?.correctAnswer ?? 0;
                  return currentQuestion.multipleChoice?.options.map((option, i) => {
                    const isSelected = selectedOptionIndex === i;
                    const isCorrectOption = answered && i === correctIndex;
                    const isWrongSelection = answered && isSelected && i !== correctIndex;
                    return (
                      <PressableButton
                        key={i}
                        style={[
                          styles.multipleBtn,
                          {
                            backgroundColor: answered
                              ? (isCorrectOption
                                ? colors.success + '22'
                                : isWrongSelection
                                  ? colors.error + '22'
                                  : colors.card)
                              : (isSelected ? colors.primary + '18' : colors.card),
                            borderColor: answered
                              ? (isCorrectOption
                                ? colors.success
                                : isWrongSelection
                                  ? colors.error
                                  : colors.border)
                              : (isSelected ? colors.primary : colors.border),
                            borderWidth: (isCorrectOption || isWrongSelection || isSelected) ? 2 : 1,
                            transform: [{ scale: isSelected && !answered ? 0.98 : 1 }],
                          },
                        ]}
                        onPress={() => {
                          setSelectedOptionIndex(i);
                          handleAnswer(i);
                        }}
                        disabled={answered || isPaused}
                      >
                        <Text style={[styles.multipleNumber, { color: colors.primary }]}>{i + 1}</Text>
                        <Text style={[styles.multipleText, { color: colors.text }]}>{option}</Text>
                      </PressableButton>
                    );
                  });
                })()}
              </View>
            )}

            {currentQuestion.answerType === 'descriptive' && (
              <View style={styles.descriptiveContainer}>
                {isAllMatchMode && correctKeywords.length > 0 ? (
                  <View style={{ width: '100%', gap: 12 }}>
                    <Text style={[{ fontSize: 14, color: colors.textSecondary, marginBottom: 8, fontWeight: '600' }]}>
                      {locale === 'ja' ? '各キーワードを入力してください' : 'Enter each keyword'}
                    </Text>
                    {correctKeywords.map((keyword, index) => (
                      <TextInput
                        key={index}
                        style={[styles.descriptiveInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                        value={userDescriptiveAnswers[index] || ''}
                        onChangeText={(text) => {
                          const newAnswers = [...userDescriptiveAnswers];
                          newAnswers[index] = text;
                          setUserDescriptiveAnswers(newAnswers);
                        }}
                        placeholder={locale === 'ja' ? `回答${index + 1}` : `Answer ${index + 1}`}
                        placeholderTextColor="#999"
                        editable={!answered && !isPaused}
                        autoCorrect={false}
                        autoCapitalize="none"
                        spellCheck={false}
                        autoComplete="new-password"
                        keyboardType="visible-password"
                        textContentType="none"
                        importantForAutofill="no"
                        onSubmitEditing={() => {
                          if (index === correctKeywords.length - 1) {
                            const fullAnswer = userDescriptiveAnswers.join(' ');
                            handleAnswer(fullAnswer);
                          }
                        }}
                        returnKeyType={index === correctKeywords.length - 1 ? 'go' : 'next'}
                      />
                    ))}
                    <PressableButton
                      style={[styles.descriptiveBtn, { backgroundColor: colors.primary, marginTop: 8 }]}
                      onPress={() => {
                        const fullAnswer = userDescriptiveAnswers.join(' ');
                        handleAnswer(fullAnswer);
                      }}
                      disabled={answered || isPaused}
                    >
                      <Text style={[styles.descriptiveBtnText, { color: (isCyberpunk || currentTheme === 'dark') ? '#000000' : '#fff' }]}>
                        {userDescriptiveAnswers.some(a => a && a.trim()) ? t.checkAnswer : (locale === 'ja' ? 'スキップ' : 'Skip')}
                      </Text>
                    </PressableButton>
                  </View>
                ) : (
                  <View style={{ width: '100%' }}>
                    <TextInput
                      style={[styles.descriptiveInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.text }]}
                      value={userDescriptiveAnswer}
                      onChangeText={setUserDescriptiveAnswer}
                      placeholder={locale === 'ja' ? '回答を入力（空欄でスキップ可）' : 'Enter answer (leave empty to skip)'}
                      placeholderTextColor="#999"
                      editable={!answered && !isPaused}
                      autoCorrect={false}
                      autoCapitalize="none"
                      spellCheck={false}
                      autoComplete="new-password"
                      textContentType="none"
                      importantForAutofill="no"
                      keyboardType="visible-password"
                      onSubmitEditing={() => {
                        handleAnswer(userDescriptiveAnswer);
                      }}
                      blurOnSubmit={true}
                      returnKeyType="done"
                    />
                      <PressableButton
                        style={[styles.descriptiveBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleAnswer(userDescriptiveAnswer)}
                        disabled={answered || isPaused}
                      >
                        <Text style={[styles.descriptiveBtnText, { color: (isCyberpunk || currentTheme === 'dark') ? '#000000' : '#fff' }]}>{userDescriptiveAnswer.trim() ? t.checkAnswer : (locale === 'ja' ? 'スキップ' : 'Skip')}</Text>
                      </PressableButton>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {autoPlayMode && (
          <View style={{ alignItems: 'center', marginTop: 32 }}>
            <PressableButton
              style={[{ backgroundColor: colors.error, paddingVertical: 14, paddingHorizontal: 40, borderRadius: 30 }]}
              onPress={() => {
                stopAutoPlay();
                setShowConfirmModal(true);
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                {locale === 'ja' ? '自動再生を終了' : 'Stop Auto Play'}
              </Text>
            </PressableButton>
          </View>
        )}

      </ScrollView>
      
      <Modal visible={isPaused} transparent animationType="fade">
        <View style={styles.pausedOverlay}>
          <View style={styles.pausedContent}>
            <Text style={styles.pausedText}>
              {locale === 'ja' ? '一時停止中' : 'Paused'}
            </Text>
            <Text style={styles.pausedSubText}>
              {locale === 'ja' ? '再開ボタンを押して続ける' : 'Press resume to continue'}
            </Text>
            <PressableButton
              style={[styles.pauseBtn, { backgroundColor: colors.primary, marginTop: 24, paddingHorizontal: 32, paddingVertical: 14 }]}
              onPress={() => {
                SoundManager.play('decide');
                setIsPaused(false);
                setIsTimerActive(true);
              }}
            >
              <Text style={[styles.pauseBtnText, { color: '#fff', fontWeight: 'bold', fontSize: 16 }]}>
                {locale === 'ja' ? '再開' : 'Resume'}
              </Text>
            </PressableButton>
          </View>
        </View>
      </Modal>

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
              <PressableButton 
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowConfirmModal(false);
                  setIsTimerActive(true);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? '続ける' : 'Continue'}
                </Text>
              </PressableButton>
              <PressableButton 
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={() => {
                  stopAutoPlay();
                  setShowConfirmModal(false);
                  setIsTimerActive(false);
                  navigate('/');
                }}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '中断する' : 'Quit'}
                </Text>
              </PressableButton>
            </View>
          </View>
        </View>
      )}

      {showExplanation && (
        <View style={[styles.explanationContainer, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
          <Text style={[styles.explanationTitle, { color: colors.primary }]}>
            {locale === 'ja' ? '解説・備考' : 'Explanation'}
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

      <Modal visible={showFeedback && !isCorrect && !!feedbackMessage} transparent animationType="fade">
        <View style={styles.fullScreenFeedback}>
          <View style={[styles.fullScreenCard, { backgroundColor: colors.card }]}>
            <X size={64} color={colors.error} />
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
  startButton: { backgroundColor: '#4CAF50', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 4, marginBottom: 8 },
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
  },
  quitBtnTopText: { fontSize: 14, fontWeight: '600' },
  timer: { fontSize: 20, fontWeight: 'bold', minWidth: 72, letterSpacing: 0.2 },
  pauseBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnText: { fontSize: 13, fontWeight: '600' },
  questionCounter: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },
  questionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  questionCounterBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    alignSelf: 'flex-start',
  },
  questionCounterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBar: { height: 7, borderRadius: 999, marginTop: 6, marginBottom: 18, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: '#007AFF', borderRadius: 999 },
  questionBox: { backgroundColor: '#F0F4FF', borderRadius: 20, padding: 22, marginBottom: 18, minHeight: 160, justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  topicBadge: { fontSize: 11, color: '#6366F1', backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start', fontWeight: '600' },
  questionText: { fontSize: 21, textAlign: 'left', color: '#1A1A1A', lineHeight: 32 },
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
    boxShadow: '0px 4px 8px rgba(0,0,0,0.3)',
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
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
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
  /* === UI強化: 進捗ラベル・タグチップ === */
  progressArea: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  progressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  progressMetaText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  tagPill: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
});

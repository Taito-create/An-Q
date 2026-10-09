import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Pressable, Alert,
  ScrollView, Text, View, Animated, TextInput, Dimensions, Modal, Switch, Platform,
  ActivityIndicator
} from 'react-native';
import LottieView from 'lottie-react-native';
import successJson from '../src/assets/animations/success.json';
import errorJson from '../src/assets/animations/error.json';

import { useNavigate, useLocation } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import BackButton from './components/BackButton';
import { useTheme } from './theme';
import PressableButton from './components/PressableButton';
import { recordQuizAnswers, recordQuizStat, consumeQuickQuizCountCache } from './missions';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { useResponsive } from './hooks/useResponsive';
import { useTerminalEffects } from './hooks/useTerminalEffects';
import { useQuestionsContext } from './context/QuestionsContext';
import { updateSrsState, isDueForReview, classifyError } from './utils/srs';
import { checkDescriptiveAnswer, getAnswerText, getAnswerGroups } from './utils/answerUtils';
import { useMemo } from 'react';
import { STORAGE_KEYS } from './constants/storageKeys';
import { Question } from './types/question';
import { useAuth } from './auth/AuthContext';
import { awardQuizCompletion } from '../src/utils/userProgress';
import {
  speak as speakText,
  stopSpeech,
  speakWithVoicevox,
  speakWithVoicevoxProxy,
  isVoiceServerAlive,
  VOICEVOX_SPEAKERS,
} from './utils/speechUtils';
import { Volume2, RefreshCw, Mic, ClipboardList, Folder, Play, Check, Pause, Heart, X } from 'lucide-react';
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
  /** 回答形式（判定ロジックで使用） */
  answerType?: 'descriptive' | 'truefalse' | 'multiple';
  /** 自信判断（1=自信あった, 2=自信なかった）。未回答時は undefined */
  confidence?: number;
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
// 複数選択問題のユーティリティ
// ──────────────────────────────────────────────

/**
 * 問題の正解インデックス配列を取得する。
 * 新形式 (correctAnswers) を優先し、旧形式 (correctAnswer) にもフォールバックする。
 * どちらもない場合は [0]（＝1番目）を正解とする（既存挙動と同じ）。
 */
export const getCorrectIndices = (question: Question): number[] => {
  const mc = question?.multipleChoice;
  if (!mc) return [0];
  if (Array.isArray(mc.correctAnswers) && mc.correctAnswers.length > 0) {
    return mc.correctAnswers;
  }
  if (typeof mc.correctAnswer === 'number') {
    return [mc.correctAnswer];
  }
  return [0];
};

// ──────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────
export default function QuizScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, onPrimary, isCyberpunk, currentTheme, br } = useTheme();
  const screenType = useResponsive();
  const terminalEffects = useTerminalEffects();
  const locale = useLocale();
  const t = translations[locale];
    const { questions: allQuestionsFromHook, folders, loading: questionsLoading, applyQuestionsChange } = useQuestionsContext();
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
  /* 単一正解は1つだけ、複数正解は複数選択する */
  const [selectedOptionIndices, setSelectedOptionIndices] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(() => questionsLoading || allQuestionsFromHook.length === 0);
  const [userDescriptiveAnswer, setUserDescriptiveAnswer] = useState('');
  const [userDescriptiveAnswers, setUserDescriptiveAnswers] = useState<string[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 解説表示
  const [showExplanation, setShowExplanation] = useState(false);
  // 手動読み上げ（自動再生モード以外）の再生中フラグ
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [explanationText, setExplanationText] = useState('');
  
  // 現在の問題を取得（範囲外アクセス時は null にしてクラッシュを防止）
  const currentQuestion = shuffledQuestions[currentIndex] ?? null;
  
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
  // 音声エンジン選択（Web Speech API / VOICEVOX）
const [voiceEngine, setVoiceEngine] = useState<'web' | 'voicevox'>('web');
const [voicevoxSpeaker, setVoicevoxSpeaker] = useState<number>(3);
  // 現在の問題が「複数正解許可」モードかどうか（UIの挙動を切り替える）
  const isMultipleAnswerMode = currentQuestion?.answerType === 'multiple'
    && currentQuestion?.multipleChoice?.allowMultiple === true;
  const autoPlayInterval = 3;
  const [autoPlayPhase, setAutoPlayPhase] = useState<'question' | 'answer'>('question');
  const [autoPlayCountdown, setAutoPlayCountdown] = useState(5);
  const [quizCompleted, setQuizCompleted] = useState(false);
  // 自動再生完了時の選択UI
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeCountdown, setCompleteCountdown] = useState(10);
  // 自動再生リピート用キー（変更すると autoplay useEffect が再実行され新セッションが開始される）
  const [autoPlayRepeatKey, setAutoPlayRepeatKey] = useState(0);
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
    setSelectedOptionIndices([]);
    // 問題切替時に読み上げを停止（前の問題の音声が残らないようにする）
    stopSpeech();
    setIsSpeaking(false);
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

  // 残り60秒以下の脈動（battle の残り10秒と同じ強度・同じ言語）
  // 制限時間が60秒以下の場合は、制限時間の半分を閾値にする（極端に短い設定への配慮）
  const timerPulseAnim = useRef(new Animated.Value(1)).current;
  // 進捗バーの幅遷移用（300ms のスムーズな伸び）
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressPercent = shuffledQuestions.length > 0 ? Math.round(((currentIndex) / shuffledQuestions.length) * 100) : 0;
  useEffect(() => {
    const safeLimit = Number.isFinite(timerLimit) && timerLimit > 0 ? timerLimit : 0;
    const threshold = safeLimit > 120 ? 60 : Math.floor(safeLimit * 0.5);
    const shouldPulse =
      terminalEffects &&
      isTimerActive &&
      preTimerMinutes !== null &&
      timeLeft > 0 &&
      threshold > 0 &&
      timeLeft <= threshold;
    if (!shouldPulse) {
      timerPulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulseAnim, {
          toValue: 1.08,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(timerPulseAnim, {
          toValue: 1.0,
          duration: 400,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [terminalEffects, isTimerActive, preTimerMinutes, timerLimit, timeLeft, timerPulseAnim]);

  // 進捗バーをスムーズに伸ばす（演出OFF時は即時反映）
  useEffect(() => {
    if (!terminalEffects) {
      progressAnim.setValue(progressPercent);
      return;
    }
    Animated.timing(progressAnim, {
      toValue: progressPercent,
      duration: 300,
      useNativeDriver: false, // width は nativeDriver 非対応（Web では情報警告のみ）
    }).start();
  }, [progressPercent, terminalEffects, progressAnim]);

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
    // /timer 画面から戻ってきたときにプリセット・選択値を再読込する
    // （画面遷移で /quiz が再マウントされないため location.key の変化で検知する）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // 音声エンジン・VOICEVOX話者を読み込み
    AsyncStorage.getItem(STORAGE_KEYS.VOICE_ENGINE)
      .then(v => setVoiceEngine(v === 'voicevox' ? 'voicevox' : 'web'))
      .catch(e => console.warn('Failed to load voice engine:', e));
    AsyncStorage.getItem(STORAGE_KEYS.VOICEVOX_SPEAKER)
      .then(v => setVoicevoxSpeaker(v ? parseInt(v, 10) : 3))
      .catch(e => console.warn('Failed to load voicevox speaker:', e));
  }, [location.key]);

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
    setIsSpeaking(false);
  };

  // ──────────────────────────────────────────────
  // 手動読み上げ（自動再生モード以外）
  // ──────────────────────────────────────────────
  const handleSpeakQuestion = useCallback(async () => {
    const q = shuffledQuestions[currentIndex];
    if (!q) return;

    // 再生中に再度タップされたら停止する
    if (isSpeaking) {
      stopSpeech();
      setIsSpeaking(false);
      return;
    }

    const textToSpeak = q.reading || q.question;
    SoundManager.play('decide');
    setIsSpeaking(true);

    // 保存済みの音声設定を読み込む
    const [engine, speakerRaw, modeRaw] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.VOICE_ENGINE),
      AsyncStorage.getItem(STORAGE_KEYS.VOICEVOX_SPEAKER),
      AsyncStorage.getItem('voicevox_mode'),
    ]);
    const speaker = speakerRaw ? parseInt(speakerRaw, 10) : 3;
    const mode = modeRaw === 'proxy' ? 'proxy' : 'direct';

    // 設定が voicevox のときだけサーバー生存を確認する（'web' なら尊重して Web Speech）
    let serverAlive = false;
    if (engine === 'voicevox') {
      serverAlive = await isVoiceServerAlive();
    }

    try {
      if (engine === 'voicevox' && serverAlive) {
        if (mode === 'proxy') {
          await speakWithVoicevoxProxy(textToSpeak, speaker);
        } else {
          await speakWithVoicevox(textToSpeak, speaker);
        }
      } else {
        await speakText(textToSpeak);
      }
    } catch (e) {
      // VOICEVOX 失敗時は Web Speech にフォールバック
      try {
        await speakText(textToSpeak);
      } catch {
        // Web Speech も失敗した場合は諦める
      }
    } finally {
      setIsSpeaking(false);
    }
  }, [currentIndex, shuffledQuestions, isSpeaking]);

  // ──────────────────────────────────────────────
  // 自動再生完了後：リピート / ホームへ戻る
  // ──────────────────────────────────────────────
  const handleAutoPlayRepeat = () => {
    SoundManager.play('decide');
    setShowCompleteModal(false);
    setCompleteCountdown(10);
    // autoPlayMode / quizStarted は変更しない＝画面ちらつき防止
    // 先頭問題から再生し直す（同じ問題順）
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    questionStartTime.current = Date.now();
    // repeatKey を変えると autoplay useEffect が再実行され、
    // ++autoPlaySessionRef.current で新しいセッションが開始される
    setAutoPlayRepeatKey((k) => k + 1);
  };

  const handleGoHome = () => {
    setShowCompleteModal(false);
    stopAutoPlay();
    navigate('/');
  };

  // 完了モーダルの10秒カウントダウン → 自動リピート
  useEffect(() => {
    if (!showCompleteModal) return;
    const timer = setInterval(() => {
      setCompleteCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoPlayRepeat();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompleteModal]);

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
      const PAUSE_AFTER_SPEECH = 3000;

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
        if (voiceEngine === 'voicevox') {
          await speakWithVoicevoxProxy(textToSpeak, voicevoxSpeaker);
        } else {
          await speakText(textToSpeak);
        }
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
        if (voiceEngine === 'voicevox') {
          await speakWithVoicevoxProxy(answerText, voicevoxSpeaker);
        } else {
          await speakText(answerText);
        }

        if (!isActive()) return;

        if (!await wait(PAUSE_AFTER_SPEECH)) return;
        if (!isActive()) return;

        const nextIdx = idx + 1;
        if (nextIdx >= shuffledQuestions.length) {
          console.log('[AutoPlay] All questions completed');
          // セッションを無効化し、完了モーダルを表示
          autoPlaySessionRef.current += 1;
          setShowCompleteModal(true);
          setCompleteCountdown(10);
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
  }, [autoPlayMode, quizStarted, isPaused, autoPlayInterval, shuffledQuestions.length, speechEnabled, autoPlayRepeatKey]);

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
    if (allQuestions.length === 0) {
      // 問題を1問も作成していない場合はクイズ画面に入らせず、作成を促す。
      // 従来はここで return するだけで通知も出ず、
      // 設問画面が「読み込み中...」のまま何も起きない状態になっていた。
      quickStartAppliedRef.current = true; // 再実行して無限ループになるのを防ぐ
      Alert.alert(
        locale === 'ja' ? '問題がありません' : 'No Questions',
        locale === 'ja' ? 'まずは問題を作成しましょう！' : 'Create your first question to start.',
        [
          {
            text: locale === 'ja' ? 'キャンセル' : 'Cancel',
            style: 'cancel',
            onPress: () => navigate('/'),
          },
          {
            text: locale === 'ja' ? '問題を作成' : 'Create',
            onPress: () => navigate('/create/manual'),
          },
        ]
      );
      return;
    }
    quickStartAppliedRef.current = true;
    startQuiz(quickStartCount);
  }, [allQuestions.length, quickStartCount]);

  const loadTimerPresets = async () => {
    try {
      // タイマーは APP_TIMER_SETTING を唯一のソースとする。
      // 旧: quiz_active_timer は startQuiz が一時的に書き込んでいたため、
      // 保存した設定と食い違い「10分固定」に見えていた。廃止して一本化する。
      const timerVal = await AsyncStorage.getItem(STORAGE_KEYS.APP_TIMER_SETTING);
      const parsed = timerVal !== null ? parseInt(timerVal, 10) : NaN;
      // timer.tsx は「なし」を '0' で保存するため、0以下はすべて無制限扱いにする
      const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      setPreTimerMinutes(minutes);

      const customRaw = await AsyncStorage.getItem('CUSTOM_TIMERS');
      const customTimers = customRaw ? JSON.parse(customRaw) : [];
      const presets: { label: string; value: number | null }[] = [
        { label: locale === 'ja' ? 'なし' : 'No limit', value: null },
        { label: locale === 'ja' ? '5分' : '5 min', value: 5 },
        { label: locale === 'ja' ? '10分' : '10 min', value: 10 },
        { label: locale === 'ja' ? '30分' : '30 min', value: 30 },
        { label: locale === 'ja' ? '60分' : '60 min', value: 60 },
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
      const timerValue = await AsyncStorage.getItem(STORAGE_KEYS.APP_TIMER_SETTING);
      const storedMinutes = timerValue ? parseInt(timerValue, 10) : NaN;

      if (Number.isFinite(storedMinutes) && storedMinutes > 0) {
        const seconds = storedMinutes * 60;
        setTimerLimit(seconds);
        setTimeLeft(seconds);
      } else {
        // 制限なし：既存の「preTimerMinutes が null のとき Number.MAX_VALUE」実装に合わせる
        setTimerLimit(Number.MAX_VALUE);
        setTimeLeft(Number.MAX_VALUE);
      }
    } catch (error) {
      console.error('Failed to load timer setting:', error);
      setTimerLimit(Number.MAX_VALUE);
      setTimeLeft(Number.MAX_VALUE);
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
  // 復習モード（quiz_mode === 'review'）かどうかを判定する
  const isReviewMode = async (): Promise<boolean> => {
    const mode = await AsyncStorage.getItem('quiz_mode');
    return mode === 'review';
  };

  const startQuiz = async (overrideCount?: number) => {
    console.log('[AutoPlay] startQuiz called, quizStarted will be true');
    let filtered = getFilteredQuestions();

    // 復習モード: 復習タイミング済みの問題（srs ありかつ nextReviewAt <= now）だけを出題する
    if (await isReviewMode()) {
      const dueQuestions = allQuestionsFromHook.filter(
        (q: any) => q.srs !== undefined && isDueForReview(q.srs)
      );
      if (dueQuestions.length === 0) {
        SoundManager.play('select');
        Alert.alert(
          locale === 'ja' ? '復習対象なし' : 'No Review Due',
          locale === 'ja'
            ? '復習タイミングの問題はありません。'
            : 'No questions are due for review.'
        );
        await AsyncStorage.removeItem('quiz_mode');
        navigate('/');
        return;
      }
      filtered = dueQuestions;
      setPreQuestionCount(dueQuestions.length);
      // 復習モードでは事前設定画面をスキップして出題する
      setShowPreSettings(false);
    }

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

    // 旧: quiz_active_timer への一時書き込みを削除。
    // タイマーの設定は timer.tsx が APP_TIMER_SETTING で一元管理する。

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
  // Phase B: 誤答時の自信チェック用
  const [showConfidencePrompt, setShowConfidencePrompt] = useState(false);
  const confidenceRef = useRef<number | undefined>(undefined);
  const pendingAdvanceRef = useRef<(() => void) | null>(null);
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Phase B: feedbackMessage 自動クリアのタイマー管理（前問のタイマーが次問のメッセージを消さないよう追跡する）
  const feedbackClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase B: 自信判断の選択ハンドラ
  const handleConfidence = (value: 1 | 2) => {
    SoundManager.play('decide');
    confidenceRef.current = value;
    pendingAdvanceRef.current?.();
  };
  useEffect(() => {
    isSubmittingRef.current = answered;
  }, [answered]);

  // answer: boolean(○/×) | number(単一選択のインデックス) | string(記述) | number[](複数選択)
  const handleAnswer = async (answer: boolean | number | string | number[]) => {
    if (isSubmittingRef.current || answered) return;
    isSubmittingRef.current = true;
    setAnswered(true);

    const elapsed = Math.round((Date.now() - questionStartTime.current) / 1000);
    const currentQuestion = shuffledQuestions[currentIndex];
    if (!currentQuestion) {
      // 境界ガード：問題配列が空・範囲外のときは状態を復帰して中断
      isSubmittingRef.current = false;
      setAnswered(false);
      return;
    }
    
    let actualCorrectAnswer: boolean | number | string = getAnswerText(currentQuestion);
    let correct: boolean = false;
    switch (currentQuestion.answerType) {
      case 'truefalse':
        correct = answer === currentQuestion.trueFalseAnswer;
        actualCorrectAnswer = currentQuestion.trueFalseAnswer ?? false;
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer ? '○' : '×');
        } else {
          setFeedbackMessage('');
        }
        break;
      case 'multiple': {
        const correctIndices = getCorrectIndices(currentQuestion);
        const allowMultiple = currentQuestion.multipleChoice?.allowMultiple === true;
        if (allowMultiple) {
          // 複数正解: セットが完全一致（数と中身の両方）才算正解
          const selectedIndices = Array.isArray(answer) ? (answer as number[]) : [answer as number];
          correct =
            selectedIndices.length === correctIndices.length &&
            selectedIndices.every(i => correctIndices.includes(i));
        } else {
          // 単一正解: 従来通りインデックス一致で判定
          const selectedIndex = answer as number;
          correct = selectedIndex === correctIndices[0];
        }
        actualCorrectAnswer = correctIndices
          .map(i => currentQuestion.multipleChoice?.options[i])
          .filter(Boolean)
          .join(', ');
        if (!correct) {
          setFeedbackMessage(actualCorrectAnswer);
        } else {
          setFeedbackMessage('');
        }
        break;
      }
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

    // Phase B: feedbackMessage の自動クリアを 4000ms に延長。
    // 自信チェックのフォールバック（4000ms）と合わせることで、モーダルが
    // 先に消える不整合を防ぐ。前問のタイマーが残っていたら先に破棄する。
    if (feedbackClearTimeoutRef.current) {
      clearTimeout(feedbackClearTimeoutRef.current);
    }
    feedbackClearTimeoutRef.current = setTimeout(() => {
      feedbackClearTimeoutRef.current = null;
      setFeedbackMessage('');
    }, 4000);

    SoundManager.play(correct ? 'correct' : 'wrong');

    // 複数選択の回答は「1, 3」のように文字列化して記録する
    // （results.tsx などの表示側が文字列前提のため、配列のままだと扱えない）
    const recordedAnswer = Array.isArray(answer)
      ? [...answer].sort((a, b) => a - b).map(i => i + 1).join(', ')
      : answer;

    const newResult: QuizResult = {
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      yourAnswer: recordedAnswer,
      correctAnswer: actualCorrectAnswer,
      isCorrect: correct,
      timeSpent: elapsed,
      answerType: currentQuestion.answerType,
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
      yourAnswer: recordedAnswer,
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
      // Phase B: advance 処理を関数化して通常フローと自信チェックフローで共有する
      const performAdvance = async (resultToRecord: QuizResult) => {
        const finalResults = [...results, resultToRecord];
        setResults(finalResults);

        if (currentIndex + 1 >= shuffledQuestions.length) {
          setIsTimerActive(false);
          setAnswered(false);
          setShowConfidencePrompt(false);
          setShowFeedback(false);
          await finishQuizWithResults(finalResults);
        } else {
          setCurrentIndex(prev => prev + 1);
          setShowConfidencePrompt(false);
          setShowFeedback(false);
          setAnswered(false);
          setUserDescriptiveAnswer('');
          questionStartTime.current = Date.now();
          if (timeAttackMode) {
            setIsTimerActive(true);
          }
          SoundManager.play('question');
        }
      };

      // Phase B: 誤答かつ通常モード（自動再生でない）: 自信チェック
      if (!correct && !autoPlayMode) {
        setShowConfidencePrompt(true);
        confidenceRef.current = undefined;

        const advance = () => {
          if (advanceTimeoutRef.current) {
            clearTimeout(advanceTimeoutRef.current);
            advanceTimeoutRef.current = null;
          }
          // 二重実行ガード（タップとフォールバックの両方が発火しても1回のみ）
          const pending = pendingAdvanceRef.current;
          pendingAdvanceRef.current = null;
          if (!pending) return;
          const finalResult = confidenceRef.current !== undefined
            ? { ...newResult, confidence: confidenceRef.current }
            : newResult;
          confidenceRef.current = undefined;
          performAdvance(finalResult);
        };
        pendingAdvanceRef.current = advance;
        // フォールバック: 4000ms 後に自動で進む
        advanceTimeoutRef.current = setTimeout(advance, 4000);
        return; // 通常の setTimeout をスキップ
      }

      // 既存のフロー（正解 or 自動再生の誤答）はそのまま
      const delay = correct ? 1000 : 2500;

      setTimeout(async () => {
        await performAdvance(newResult);
      }, delay);
    }
  };

  // ──────────────────────────────────────────────
  // クイズ終了
  // ──────────────────────────────────────────────
  const finishQuizWithResults = async (finalResults: QuizResult[]) => {
    setIsTimerActive(false);
    // クイズ終了時に手動読み上げを停止する
    stopSpeech();
    setIsSpeaking(false);

    const totalQuestions = shuffledQuestions.length;
    const finalScore = finalResults.filter(r => r.isCorrect).length;

    await AsyncStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify({
      results: finalResults,
      total: totalQuestions,
      score: finalScore,
      timestamp: Date.now()
    }));

    // SRS（間隔反復学習）: 回答済みの問題の学習状態を更新する
// ※ 失敗してもクイズ結果画面は表示するため try/catch で囲む
    try {
      await applyQuestionsChange(current =>
        current.map(q => {
          const result = finalResults.find(r => r.questionId === q.id);
          if (!result) return q; // 出題されていない問題は変更しない

          const newSrs = updateSrsState(q.srs, result.isCorrect);

          if (!result.isCorrect) {
            const errorType = classifyError(q.srs, {
              isCorrect: false,
              timeSpent: result.timeSpent,
              answerType: result.answerType,
            });
            const prevHistory = q.srs?.errorHistory ?? [];
            // 最新10件のみ保持
            newSrs.errorHistory = [errorType, ...prevHistory].slice(0, 10);

            // Phase B: 自信判断を保存
            if (typeof result.confidence === 'number') {
              const prevConfidence = q.srs?.confidenceHistory ?? [];
              newSrs.confidenceHistory = [result.confidence, ...prevConfidence].slice(0, 10);
            } else {
              // タップされなかった場合は既存を引き継ぐ
              newSrs.confidenceHistory = q.srs?.confidenceHistory;
            }
          } else {
            // 正解時は前回の errorHistory を引き継ぐ
            newSrs.errorHistory = q.srs?.errorHistory;
            // 正解時は自信判断も引き継ぐ
            newSrs.confidenceHistory = q.srs?.confidenceHistory;
          }

          return { ...q, srs: newSrs };
        })
      );
    } catch (e) {
      console.warn('SRS update failed:', e);
    }

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
      const isReview = quizMode === 'review';
      if (isBossMode || isReview) {
        // 復習モードも weak モード同理で XP を1.5倍にする
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
  const timeMin = Math.floor(timeLeft / 60);
  const timeSec = timeLeft % 60;

  // topBar のレスポンシブ寸法。
  // スマホ幅（375px程度）では「制限時間」「一時停止」「クイズを中断」の3要素が
  // 詰まって潰れるため、フォント・パディング・gap を端末区分で切り替える。
  // ラベル自体は省略せず、縮小で収める。
  const topBarMetrics = useMemo(() => {
    switch (screenType) {
      case 'desktop':
        return { timerFontSize: 20, btnFontSize: 14, btnPadX: 18, btnPadY: 10, iconSize: 18, gap: 10 };
      case 'tablet':
        return { timerFontSize: 18, btnFontSize: 13, btnPadX: 14, btnPadY: 9, iconSize: 17, gap: 8 };
      default: // mobile（スマホ）
        return { timerFontSize: 14, btnFontSize: 11, btnPadX: 9, btnPadY: 7, iconSize: 15, gap: 6 };
    }
  }, [screenType]);

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
          <BackButton to="/" />
          <Text style={[styles.headerTitle, { color: colors.text, letterSpacing: 1, flex: 1, flexShrink: 1 }]} numberOfLines={1}>
            <ClipboardList size={20} color={colors.primary} style={{ marginRight: 6 }} />クイズ設定
          </Text>
        </View>

        <ScrollView contentContainerStyle={[styles.quizContent, { flexGrow: 1 }]}>
          <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }]}>
            <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, letterSpacing: 1, marginBottom: 10 }]}>
              問題数
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
              <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, letterSpacing: 1 }]}>
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

          {/* 制限時間の設定（/timer へ誘導） */}
          <View style={{
            backgroundColor: colors.card,
            borderRadius: br,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            marginBottom: 8,
          }}>
            <PressableButton
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
              onPress={() => { SoundManager.play('decide'); navigate('/timer'); }}
            >
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.text }}>
                制限時間: {preTimerMinutes === null
                  ? (locale === 'ja' ? 'なし' : 'No limit')
                  : `${preTimerMinutes}${locale === 'ja' ? '分' : ' min'}`}
              </Text>
              <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
                {locale === 'ja' ? '変更 →' : 'Change →'}
              </Text>
            </PressableButton>
            {/* 問題数に応じた推奨時間の目安（1問あたり60秒を標準とする） */}
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 6, lineHeight: 16 }}>
              {locale === 'ja'
                ? `目安: ${preQuestionCount}問 → ${Math.round(preQuestionCount * 0.5)}〜${Math.round(preQuestionCount * 1.5)}分（1問あたり30〜90秒）`
                : `Guide: ${preQuestionCount}Q → ${Math.round(preQuestionCount * 0.5)}-${Math.round(preQuestionCount * 1.5)} min (30-90s per Q)`}
            </Text>
          </View>

          <View style={[{ backgroundColor: colors.card, borderRadius: br, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, letterSpacing: 1 }]}>
                  <RefreshCw size={18} color={colors.primary} style={{ marginRight: 4 }} />問題と答えを反転
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
            <Text style={[{ fontSize: 14, fontWeight: 'bold', color: colors.text, letterSpacing: 1, marginBottom: 10 }]}>
              ゲームモード
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['standard', 'timeAttack', 'suddenDeath', 'challenge'] as const).map((mode) => {
                const labels: Record<typeof mode, string> = {
                  standard: '標準',
                  timeAttack: 'タイムアタック',
                  suddenDeath: 'サドンデス',
                  challenge: 'チャレンジ',
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
                <Text style={{ fontSize: 11, color: colors.textSecondary,  }}>制限時間:</Text>
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
                    <Text style={{ fontSize: 11, color: timeLimitSec === sec ? colors.primary : colors.textSecondary,  }}>{sec}s</Text>
                  </PressableButton>
                ))}
              </View>
            )}

            {selectedGameMode === 'suddenDeath' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary,  }}>残機:</Text>
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
                    <Text style={{ fontSize: 11, color: suddenDeathLivesOpt === lives ? colors.primary : colors.textSecondary,  }}>♥ {lives}</Text>
                  </PressableButton>
                ))}
              </View>
            )}

            {selectedGameMode === 'challenge' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: colors.textSecondary,  }}>ベット:</Text>
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
                    <Text style={{ fontSize: 11, color: challengeBet === bet ? colors.primary : colors.textSecondary,  }}>🪙 {bet}</Text>
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
                    {/* 現在の音声設定表示 + 設定画面への導線 */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Mic size={14} color={colors.primary} />
                        <Text style={{ fontSize: 12, color: colors.text,  }}>
                          {voiceEngine === 'voicevox'
                            ? `VOICEVOX: ${VOICEVOX_SPEAKERS.find((s) => s.id === voicevoxSpeaker)?.nameJa || '--'}`
                            : (locale === 'ja' ? 'ブラウザ音声' : 'Web Speech')}
                        </Text>
                      </View>
                      <PressableButton
                        style={{ paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.primary, borderRadius: 4 }}
                        onPress={() => { SoundManager.play('decide'); navigate('/appSettings'); }}
                      >
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '600' }}>
                          {locale === 'ja' ? '変更 →' : 'Change →'}
                        </Text>
                      </PressableButton>
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
            <Text style={[styles.startButtonText, { color: onPrimary, letterSpacing: 1 }]}>
              学習を開始
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

  // currentQuestion が null の間（shuffledQuestions が空）はローディングを表示する。
  // クイックスタートで /quiz に遷移した直後、startQuiz が完了する前の1フレームで
  // currentQuestion が null になり、そのまま .topic へアクセスするとクラッシュするため。
  if (!currentQuestion) {
    return (
      <View style={[styles.quizContainer, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: 14, marginTop: 12 }}>
          {locale === 'ja' ? '読み込み中...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.quizContainer, { backgroundColor: colors.background, flex: 1 }]}>
      {!autoPlayMode && (
        <View style={[styles.topBar, { gap: topBarMetrics.gap }]}>
          <Animated.Text
            style={[
              styles.timer,
              {
                color: timerColor,
                letterSpacing: 1,
                fontSize: topBarMetrics.timerFontSize,
                transform: [{ scale: timerPulseAnim }],
              },
            ]}
          >
            制限時間: {preTimerMinutes === null ? (locale === 'ja' ? 'なし' : 'No limit') : `${timeMin}:${String(timeSec).padStart(2, '0')}`}
          </Animated.Text>

          <Pressable
            style={({ pressed }) => [
              styles.pauseBtn,
              {
                backgroundColor: isPaused ? colors.success : colors.primary,
                borderRadius: isCyberpunk ? 0 : 999,
                paddingHorizontal: topBarMetrics.btnPadX,
                paddingVertical: topBarMetrics.btnPadY,
                transform: [{ scale: pressed ? 0.95 : 1 }]
              }
            ]}
            onPress={() => {
              SoundManager.play('decide');
              setIsPaused(!isPaused);
              setIsTimerActive(isPaused);
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: topBarMetrics.gap }}>
              {isPaused
                ? <><Play size={topBarMetrics.iconSize} color={isCyberpunk ? '#000' : '#fff'} /><Text style={[styles.pauseBtnText, { color: isCyberpunk ? '#000' : '#fff', fontWeight: 'bold', fontSize: topBarMetrics.btnFontSize }]}>再開</Text></>
                : <><Pause size={topBarMetrics.iconSize} color={isCyberpunk ? '#000' : '#fff'} /><Text style={[styles.pauseBtnText, { color: isCyberpunk ? '#000' : '#fff', fontWeight: 'bold', fontSize: topBarMetrics.btnFontSize }]}>一時停止</Text></>}
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.quitBtnTop,
              {
                backgroundColor: pressed ? colors.error : colors.primary,
                borderRadius: isCyberpunk ? 0 : 20,
                paddingHorizontal: topBarMetrics.btnPadX,
                paddingVertical: topBarMetrics.btnPadY,
                transform: [{ scale: pressed ? 0.95 : 1 }]
              }
            ]}
            onPress={() => {
              SoundManager.play('decide');
              setShowConfirmModal(true);
            }}
          >
            <Text style={[styles.quitBtnTopText, { color: isCyberpunk ? '#000' : '#fff', fontWeight: 'bold', fontSize: topBarMetrics.btnFontSize }]}>
              {locale === 'ja' ? 'クイズを中断' : 'Quit Quiz'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.progressArea}>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <Animated.View
                style={[
                  styles.progressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 100],
                      outputRange: ['0%', '100%'],
                      extrapolate: 'clamp',
                    }),
                    backgroundColor: colors.primary,
                  },
                ]}
              />
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
              : getAnswerText(shuffledQuestions[currentIndex])}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <PressableButton
                    style={[{
                      width: 36, height: 36, borderRadius: 18,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSpeaking ? colors.primary : colors.primary + '20',
                      borderWidth: 1,
                      borderColor: colors.primary + '40',
                    }]}
                    onPress={handleSpeakQuestion}
                    title={locale === 'ja' ? '問題を読み上げ' : 'Read aloud'}
                    minTouchTarget={false}
                  >
                    <Volume2
                      size={18}
                      color={isSpeaking ? onPrimary : colors.primary}
                    />
                  </PressableButton>
                  <View
                    style={[
                      styles.questionCounterBadge,
                      {
                        backgroundColor: colors.primary + '20',
                        borderColor: colors.primary + '40',
                      },
                    ]}
                  >
                    <Text style={[styles.questionCounterText, { color: colors.primary }]}>
                      {currentIndex + 1} / {shuffledQuestions.length}{locale === 'ja' ? '問' : ''}
                    </Text>
                  </View>
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
                  const correctIndices = getCorrectIndices(currentQuestion);
                  const allowMultiple = currentQuestion.multipleChoice?.allowMultiple === true;
                  return currentQuestion.multipleChoice?.options.map((option, i) => {
                    const isSelected = selectedOptionIndices.includes(i);
                    const isCorrectOption = answered && correctIndices.includes(i);
                    const isWrongSelection = answered && isSelected && !correctIndices.includes(i);
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
                          if (allowMultiple) {
                            // 複数正解: タップでトグルする（まだ回答は確定しない）
                            setSelectedOptionIndices(prev =>
                              prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i],
                            );
                          } else {
                            // 単一正解: タップで即回答（従来通り）
                            setSelectedOptionIndices([i]);
                            handleAnswer(i);
                          }
                        }}
                        disabled={answered || isPaused}
                      >
                        <Text style={[styles.multipleNumber, { color: colors.primary }]}>{i + 1}</Text>
                        <Text style={[styles.multipleText, { color: colors.text }]}>{option}</Text>
                        {/* 複数正解モードではチェックボックス風で選択中であることを示す */}
                        {allowMultiple && (
                          <Text style={[styles.multipleText, { color: colors.primary, fontWeight: 'bold' }]}>
                            {isSelected ? '☑' : '☐'}
                          </Text>
                        )}
                      </PressableButton>
                    );
                  });
                })()}
                {/* 複数正解モード: 「回答する」ボタンで確定 */}
                {isMultipleAnswerMode && !answered && (
                  <PressableButton
                    style={[styles.multipleSubmitBtn, { backgroundColor: colors.primary, borderRadius: br }]}
                    onPress={() => {
                      if (selectedOptionIndices.length === 0) return;
                      handleAnswer(selectedOptionIndices);
                    }}
                    disabled={isPaused || selectedOptionIndices.length === 0}
                  >
                    <Text style={[styles.multipleText, { color: onPrimary, fontWeight: 'bold' }]}>
                      {locale === 'ja' ? '回答する' : 'Submit'}
                    </Text>
                  </PressableButton>
                )}
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
                        // 1つでも空欄が残っている場合は、join すると空欄が
                        // 未入力として扱われ、意図しない不正解になるため警告する。
                        // 何も1つも入力されていない場合（スキップ意図）のみ、そのまま送信する。
                        const hasAnyInput = userDescriptiveAnswers.some(a => a && a.trim());
                        const hasEmptyField =
                          userDescriptiveAnswers.length < correctKeywords.length ||
                          userDescriptiveAnswers.some(a => !a || !a.trim());
                        if (hasAnyInput && hasEmptyField) {
                          Alert.alert(
                            locale === 'ja' ? '未入力の空欄があります' : 'Some fields are empty',
                            locale === 'ja'
                              ? 'すべての空欄を埋めてから回答してください'
                              : 'Please fill in all fields before answering'
                          );
                          return;
                        }
                        const fullAnswer = userDescriptiveAnswers.join(' ');
                        handleAnswer(fullAnswer);
                      }}
                      disabled={answered || isPaused}
                    >
                      <Text style={[styles.descriptiveBtnText, { color: isCyberpunk ? '#000000' : '#fff' }]}>
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
                        <Text style={[styles.descriptiveBtnText, { color: isCyberpunk ? '#000000' : '#fff' }]}>{userDescriptiveAnswer.trim() ? t.checkAnswer : (locale === 'ja' ? 'スキップ' : 'Skip')}</Text>
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
            
            {showConfidencePrompt ? (
              <View style={{ marginTop: 16, width: '100%' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
                  {locale === 'ja' ? '答えに自信はありましたか？' : 'Were you confident?'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <PressableButton
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: 'center',
                    }}
                    onPress={() => handleConfidence(1)}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                      {locale === 'ja' ? '自信あった' : 'Confident'}
                    </Text>
                  </PressableButton>
                  <PressableButton
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: 'center',
                    }}
                    onPress={() => handleConfidence(2)}
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 14 }}>
                      {locale === 'ja' ? '自信なかった' : 'Unsure'}
                    </Text>
                  </PressableButton>
                </View>
              </View>
            ) : (
              <Text style={[styles.fullScreenTimer, { color: colors.textSecondary }]}>
                {locale === 'ja' ? '次の問題へ...' : 'Next question...'}
              </Text>
            )}
          </View>
          
        </View>
      </Modal>

      {/* 自動再生完了モーダル（リピート / ホーム戻る + 10秒自動リピート） */}
      <Modal visible={showCompleteModal} transparent animationType="fade">
        <View style={styles.completeModalOverlay}>
          <View style={[styles.completeModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.completeModalTitle, { color: colors.primary }]}>
              学習完了
            </Text>
            <Text style={[styles.completeModalMessage, { color: colors.text }]}>
              {locale === 'ja' ? '全問終了しました。もう一度挑戦しますか？' : 'All questions completed. Try again?'}
            </Text>
            <Text style={[styles.completeModalCountdown, { color: colors.warning }]}>
              {locale === 'ja' ? `あと ${completeCountdown}秒で自動リピート` : `Auto-repeat in ${completeCountdown}s`}
            </Text>
            <View style={styles.completeModalButtons}>
              <PressableButton
                style={[styles.completeModalBtn, { backgroundColor: colors.primary }]}
                onPress={handleAutoPlayRepeat}
              >
                <Text style={[styles.completeModalBtnText, { color: onPrimary }]}>
                  {locale === 'ja' ? 'もう一度繰り返す' : 'Repeat'}
                </Text>
              </PressableButton>
              <PressableButton
                style={[styles.completeModalBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
                onPress={handleGoHome}
              >
                <Text style={[styles.completeModalBtnText, { color: colors.text }]}>
                  {locale === 'ja' ? 'ホームに戻る' : 'Go Home'}
                </Text>
              </PressableButton>
            </View>
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
    paddingBottom: 100,
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
  // minWidth は指定しない。スマホ幅で topBar の3要素を押し広げてしまうため
  timer: { fontSize: 20, fontWeight: 'bold', letterSpacing: 0.2 },
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
  // 背景色・ボーダー色は JSX でテーマ色（colors.primary）を指定する。
  // 白背景（rgba(255,255,255,0.9)）はダークテーマ上で眩しく、
  // シアンテキストとのコントラストが不自然だったため、
  // 半透明シアン背景 + シアンテキストに変更した。
  questionCounterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
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
  // 複数正解モードの「回答する」ボタン
  multipleSubmitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 4,
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
  // 自動再生完了モーダル
  completeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  completeModal: {
    width: '92%',
    maxWidth: 420,
    borderWidth: 1,
    borderRadius: 4,
    padding: 24,
    alignItems: 'center',
  },
  completeModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  completeModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  completeModalCountdown: {
    fontSize: 12,
    marginBottom: 20,
  },
  completeModalButtons: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  completeModalBtn: {
    minHeight: 44,
    minWidth: 44,
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeModalBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

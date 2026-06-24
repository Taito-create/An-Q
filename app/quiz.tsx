import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, TouchableOpacity, Alert,
  ScrollView, Text, View, Animated, TextInput, Dimensions, Modal, Switch
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { incrementStat, recordQuizAnswers } from './missions';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { useQuestions } from './hooks/useQuestions';
import { getAnswerText } from './utils/answerUtils';
import { STORAGE_KEYS } from './constants/storageKeys';
import { Question } from './types/question';

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
      if (timeAttackMode) {
        // タイムアタックモード: 時間切れ = 不正解として処理
        handleAnswer('');
      } else {
        handleTimeUp();
      }
      return;
    }
    const id = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(id);
  }, [isTimerActive, timeLeft, quizStarted, timeAttackMode]);

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
    }
    
    setIsCorrect(correct);
    setShowFeedback(true);
    if (correct) setScore(s => s + 1);

    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    // タイムアタックモードのタイマー停止
    if (timeAttackMode) {
      setIsTimerActive(false);
    }

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
  };

  // ──────────────────────────────────────────────
  // クイズ終了
  // ──────────────────────────────────────────────
  const finishQuizWithResults = async (finalResults: QuizResult[]) => {
    setIsTimerActive(false);
    setShowReview(true);

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
      await updateStreak();
      const answers = finalResults.map(r => ({
        isCorrect: r.isCorrect,
        tags: shuffledQuestions.find(q => q.id === r.questionId)?.tags ?? [],
      }));
      await recordQuizAnswers(answers);
      
      let xpReward = finalScore * 5;
      let coinReward = finalScore;  // 1問正解 = 1コイン
      let bookReward = 0;

      // 全問正解ボーナス
      const isPerfect = finalScore === totalQuestions;
      if (isPerfect) {
        coinReward += 10;  // ボーナス +10コイン
      }

      // チャレンジモードの処理
      let challengeBet = 0;
      if (challengeMode) {
        challengeBet = parseInt(await AsyncStorage.getItem('challenge_bet') || '0', 10);

        if (isPerfect) {
          // ✅ 全問正解: 賭け金返還 + 報酬2倍
          xpReward *= 2;
          coinReward *= 2;
          // 賭け金は後で加算（すでに消費済みのため戻す）
        }
        // 失敗時は賭け金没収（すでに消費済みのため何もしない）
      }

      // ボス討伐モード（weak）: +50% XP
      const quizMode = await AsyncStorage.getItem('quiz_mode');
      const isBossMode = quizMode === 'weak';
      if (isBossMode) {
        xpReward = Math.floor(xpReward * 1.5);
        await AsyncStorage.removeItem('quiz_mode');
      }

      // サドンデス: 連続正解ボーナス
      if (suddenDeathMode && maxCombo > 0) {
        coinReward += Math.floor(maxCombo / 2);
      }

      const currentCoins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
      const currentXP = parseInt(await AsyncStorage.getItem('user_xp') || '0', 10);
      
      // コイン計算（賭け金返還を含む）
      let newCoins = currentCoins + coinReward;
      if (challengeMode && isPerfect && challengeBet > 0) {
        newCoins += challengeBet;  // 賭け金返還
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

      await AsyncStorage.setItem('user_coins', newCoins.toString());
      
      // レベルアップ処理
      const currentLevel = parseInt(await AsyncStorage.getItem('user_level') || '1', 10);
      const nextLevelThresh = currentLevel * 100;
      const newXP = currentXP + xpReward;
      
      let levelUpMessage = '';
      if (newXP >= nextLevelThresh) {
        const newLevel = currentLevel + 1;
        const remainingXP = newXP - nextLevelThresh;
        await AsyncStorage.setItem('user_level', newLevel.toString());
        await AsyncStorage.setItem('user_xp', remainingXP.toString());
        
        // レベルアップコインボーナス（レベル × 20）
        const coinBonus = newLevel * 20;
        const coinsAfterLevelUp = newCoins + coinBonus;
        await AsyncStorage.setItem('user_coins', coinsAfterLevelUp.toString());
        newCoins = coinsAfterLevelUp;
        
        levelUpMessage = locale === 'ja' 
          ? `\n🎉 レベルアップ！ Lv.${newLevel} (+${coinBonus}コインボーナス！)`
          : `\n🎉 Level Up! Lv.${newLevel} (+${coinBonus} coin bonus!)`;
      } else {
        await AsyncStorage.setItem('user_xp', newXP.toString());
      }

      // 統計更新（missions 経由）
      try {
        const { loadStats: loadStats3, saveStats: saveStats3 } = await import('./missions');
        const stats = await loadStats3();
        stats.totalCoinsEarned = (stats.totalCoinsEarned || 0) + coinReward;
        await saveStats3(stats);
      } catch (e) {
        console.error('Failed to update coin stats:', e);
      }
      
      // 報酬メッセージを表示
      let rewardMessage = locale === 'ja' 
        ? `${finalScore}/${totalQuestions} 正解\n⚡ +${xpReward} XP\n✨ +${coinReward} Qコイン${levelUpMessage}`
        : `${finalScore}/${totalQuestions} correct\n⚡ +${xpReward} XP\n✨ +${coinReward} Q Coins${levelUpMessage}`;
      
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
  const timerColor = timeLeft > timerLimit * 0.4 ? colors.success : timeLeft > timerLimit * 0.2 ? colors.warning : colors.error;
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

          {/* チャレンジモード */}
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
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
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
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
          <View style={[{ backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 }]}>
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
      {/* スクロールしないヘッダー部分 */}
      <View style={styles.topBar}>
        <Text style={[styles.timer, { color: timerColor }]}>
          {preTimerMinutes === null ? (locale === 'ja' ? 'なし' : 'No limit') : `${timeMin}:${String(timeSec).padStart(2, '0')}`}
        </Text>
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
        <View style={[styles.questionBox, { backgroundColor: colors.primary + '15', borderColor: colors.border }]}>
          {currentQuestion.topic && <Text style={[styles.topicBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{currentQuestion.topic}</Text>}
          
          {currentQuestion.image && (
            <View style={[{ position: 'relative', backgroundColor: '#f0f0f0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }]}>
              <img
                src={currentQuestion.image}
                alt="問題の画像"
                style={{ width: '100%', height: 'auto', maxHeight: 300 }}
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
        </View>

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
              <TextInput
                style={[styles.descriptiveInput, { borderColor: colors.border, backgroundColor: colors.card }]}
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

      {/* 中断確認モーダル（フルスクリーン改善） */}
      {showConfirmModal && (
        <View style={styles.fullScreenOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
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
  reviewAnswerLabel: { fontSize: 14, fontWeight: '600' },
  reviewAnswerValue: { fontSize: 14, fontWeight: 'bold' },
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
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
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
  },
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});

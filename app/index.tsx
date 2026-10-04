import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    StyleSheet, Text, View, Image,
  ScrollView, StatusBar, Alert, Animated, ActivityIndicator
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import PressableButton from './components/PressableButton';
import RomeaSpeechBubble from './components/RomeaSpeechBubble';
import TerminalLog, { TerminalLogHandle } from './components/TerminalLog';
import PatternBackground from './patternBackground';
import { IMAGES } from './constants/images';
import { Platform } from 'react-native';
import { Svg, Circle } from 'react-native-svg';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { STORAGE_KEYS } from './constants/storageKeys';
import { 
  Play,
  Calendar,
  ClipboardList,
  Home,
  User,
  TrendingUp,
  Target,
  BookOpen,
  ChevronRight,
  Coins,
  AlertTriangle,
  Lightbulb,
  GraduationCap,
  CheckCircle2,
  Flame,
  Square,
  Zap,
  Award,
  Sprout,
  Crown,
  Pencil,
  Building2,
  Trophy
} from 'lucide-react';
import { MISSIONS, loadProgress, loadStats, getMissionProgress, Mission, UserStats, loadTodayCorrect, loadWeeklyProgress, WeeklyProgress, TITLE_BADGES } from './missions';
import { AnimationLevel, createShakeAnimation, createPulseAnimation } from './animations';
import { useAuth } from './auth/AuthContext';
import { readUserProfileDocument, readLocalProfileImage, getTitleDisplay } from '../src/utils/userProgress';
import { useQuestionsContext } from './context/QuestionsContext';
import { safeParse, safeParseArray } from './utils/storageUtils';
import LottieView from 'lottie-react-native';
import FireAnimation from '../src/assets/animations/Fire.json';
import { useTerminalEffects } from './hooks/useTerminalEffects';
import CountUpText from './components/CountUpText';
import { isDueForReview } from './utils/srs';

// レスポンシブ判定用フック
const useResponsive = () => {
  const [screenType, setScreenType] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');

  useEffect(() => {
    const checkScreen = () => {
      const width = window.innerWidth;
      if (width < 640) setScreenType('mobile');
      else if (width < 1024) setScreenType('tablet');
      else setScreenType('desktop');
    };
    
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  return screenType;
};

const badgeIconMap: Record<string, React.ComponentType<any>> = {
  sprout: Sprout,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  crown: Crown,
  pencil: Pencil,
  'building-2': Building2,
  'check-circle-2': CheckCircle2,
  flame: Flame,
  zap: Zap,
  trophy: Trophy,
  calendar: Calendar,
};

// 疑似ターミナルログは app/components/TerminalLog.tsx に分離（ref で addLog 公開）
const TERMINAL_LOG_HEAD = [
  'システムを起動しています...',
  'ユーザー入力待機中...',
  'ステータス: オンライン',
];

const HomeScreen = React.memo(() => {
  const navigate = useNavigate();

  // 遷移は同期実行する。
  // 過去に requestAnimationFrame で 1 フレーム待ってから navigate していたが、
  // モバイル（特に iOS Safari）では rAF の発火がユーザー操作のコンテキスト外で
  // スキップ・遅延され、ボタンを押しても遷移しない事象が発生していた。
  // 遷移にアニメーションは伴わないためフレーム待ちは不要であり、
  // ユーザー操作の同一コンテキスト内で navigate を呼ぶのが最も確実。
  // （万一この同期化で描画ラグが再発する場合は
  //   setTimeout(() => navigate(path), 0) へ変更すること。rAF は使わない。）
  const navigateWithAnimation = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);
  const { colors, fs, pattern, onPrimary, isCyberpunk, br } = useTheme();
  const locale = useLocale();
  const [currentLocale, setCurrentLocale] = useState<'ja' | 'en'>(locale);
  const screenType = useResponsive();
  const terminalEffects = useTerminalEffects();
  const { user } = useAuth();
    const { questions: questionsFromHook, loading: questionsLoading } = useQuestionsContext();
  const [userLevel, setUserLevel] = useState(1);
  const [userCoins, setUserCoins] = useState(0);
  const [profile, setProfile] = useState<any>(null);
  // プロフィール画像は AsyncStorage が唯一の保存先（Firestore には保存しない）
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [xpProgress, setXpProgress] = useState(0);
  const fireAnimationRef = useRef<LottieView>(null);

  // データロード完了フラグ（初回遷移時のフリッカー防止）
  const [isDataReady, setIsDataReady] = useState(false);

  // メインプレイボタンのパルスアニメーション（押下スケールは PressableButton が担当）
  const playButtonPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 初回マウント時のフリッカー防止のため、少し遅らせてパルス開始
    let anim: ReturnType<typeof Animated.loop> | null = null;
    const timeout = setTimeout(() => {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(playButtonPulse, { toValue: 1.03, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(playButtonPulse, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
        ])
      );
      anim.start();
    }, 200);
    return () => {
      clearTimeout(timeout);
      anim?.stop();
    };
  }, [playButtonPulse]);

  // アニメーションレベル設定
  const [animationLevel, setAnimationLevel] = useState<AnimationLevel>('standard');

  // 言語変更の即時反映
  useEffect(() => {
    const checkLanguage = async () => {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.USER_LANGUAGE);
      if (saved === 'ja' || saved === 'en') {
        setCurrentLocale(saved);
      }
    };
    checkLanguage();
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.USER_LANGUAGE) {
        if (e.newValue === 'ja' || e.newValue === 'en') {
          setCurrentLocale(e.newValue);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleVisibilityChange = () => {
      if (!document.hidden) checkLanguage();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync currentLocale with locale from hook to prevent inconsistency
  useEffect(() => {
    if (locale !== currentLocale) {
      setCurrentLocale(locale);
    }
  }, [locale, currentLocale]);

  useEffect(() => {
    const loadAnimationLevel = async () => {
      try {
        const level = await AsyncStorage.getItem('animation_level');
        if (level) setAnimationLevel(level as AnimationLevel);
      } catch (e) {
        console.error('Failed to load animation level:', e);
      }
    };
    loadAnimationLevel();
  }, []);

  // デバイス別コンテナスタイル
  const containerStyles = {
    mobile: {
      maxWidth: '100%' as const,
      padding: 16,
      paddingTop: Platform.OS !== 'web' ? 44 : 16,
    },
    tablet: {
      maxWidth: '100%' as const,
      padding: 24,
      paddingTop: 24,
    },
    desktop: {
      maxWidth: 1200,
      marginLeft: 'auto' as const,
      marginRight: 'auto' as const,
      padding: 32,
      paddingTop: 32,
    },
  };

  // カード・ボタンサイズ（角丸は theme の共通トークン br=4 に統一：P2-9）

  const cardPadding = {
    mobile: { padding: 12 },
    tablet: { padding: 14 },
    desktop: { padding: 16 },
  };

  const buttonPadding = {
    mobile: { paddingVertical: 14, paddingHorizontal: 12 },
    tablet: { paddingVertical: 15, paddingHorizontal: 14 },
    desktop: { paddingVertical: 18, paddingHorizontal: 16 },
  };

  const fontSize = {
    title: screenType === 'desktop' ? 18 : screenType === 'tablet' ? 16 : 15,
    body: screenType === 'desktop' ? 15 : screenType === 'tablet' ? 14 : 13,
    small: screenType === 'desktop' ? 12 : screenType === 'tablet' ? 12 : 12,
  };

  const t = translations[currentLocale];

  const toggleLanguage = async () => {
    const newLocale = currentLocale === 'ja' ? 'en' : 'ja';
    setCurrentLocale(newLocale);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.USER_LANGUAGE, newLocale);
      SoundManager.play('decide');
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [displayTimer, setDisplayTimer] = useState<string | null>(null);
  const [todayQuestion, setTodayQuestion] = useState<any | null>(null);
  const [weakQuestionCount, setWeakQuestionCount] = useState(0);
  const [reviewDueCount, setReviewDueCount] = useState(0);
  const [dailyQuests, setDailyQuests] = useState<Mission[]>([]);
  const [questProgress, setQuestProgress] = useState<{ current: number; completed: boolean }[]>([]);
  // 最終アクション時刻（STATUS: STANDBY (nH nM SINCE LAST TRANSFER) 用）
  const [lastActionAt, setLastActionAt] = useState<number | null>(null);
  // 30秒ごとの再描画トリガー（SINCE LAST TRANSFER の経過時間をライブ更新：P2-7）
  const [statusTick, setStatusTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setStatusTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  // SYSTEM LOG の動的ログ（学習を始める 押下時に追加）
  // SYSTEM LOG の ref（addLog を外部から呼び出す）
  const terminalLogRef = useRef<TerminalLogHandle>(null);
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const [examDates, setExamDates] = useState<any[]>([]);
  const [examCountdown, setExamCountdown] = useState<{daysLeft: number, examName: string} | null>(null);
  const [quickReviewQuestions, setQuickReviewQuestions] = useState<any[]>([]);
  const [examProgress, setExamProgress] = useState(0);
  // 統計カード用のステート
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [todayCorrect, setTodayCorrect] = useState(0);
  const [weeklyProgress, setWeeklyProgress] = useState<WeeklyProgress>({ thisWeek: 0, lastWeek: 0, changePercent: 0 });
  // デイリーゴール（デフォルト10問）
  const [dailyGoal, setDailyGoal] = useState(10);

  // ─────────────────────────────────────────────
  // 「今日の1問」：日付シードによる選出（同日は再選出しない）
  // ※ ログ付き・初回「よろしく/やっほー」のようなテストデータ確認用
  // ─────────────────────────────────────────────
  const TODAY_QUESTION_DATE_KEY = 'today_question_last_date';

  const pickTodayQuestion = useCallback(async (questions: any[]) => {
    if (!questions || questions.length === 0) return null;
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    let lastDate: string | null = null;
    try {
      lastDate = await AsyncStorage.getItem(TODAY_QUESTION_DATE_KEY);
    } catch { /* noop */ }

    // 同じ日にすでに選出済みなら再選出しない（日が変わったときだけ更新）
    if (lastDate === dateKey) {
      console.log('[今日の1問] 同日のため再選出をスキップ (date=' + dateKey + ')');
      return null;
    }

    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const idx = seed % questions.length;
    const picked = questions[idx];
    setTodayQuestion(picked);
    try {
      await AsyncStorage.setItem(TODAY_QUESTION_DATE_KEY, dateKey);
    } catch { /* noop */ }

    const createdAtInfo = picked?.createdAt
      ? new Date(picked.createdAt).toISOString()
      : '(none)';
    console.log(
      '[今日の1問] seed=' + seed +
      ', index=' + idx +
      ', date=' + dateKey +
      ', id=' + (picked?.id ?? '(none)') +
      ', createdAt=' + (picked?.createdAt ?? '(none)') + ' (' + createdAtInfo + ')' +
      ', question="' + (picked?.question ?? '') + '"'
    );
    return picked;
  }, [setTodayQuestion]);

  // questionsFromHookが更新されたら問題数を反映
  useEffect(() => {
    if (questionsFromHook.length > 0) {
      setTotalQuestions(questionsFromHook.length);
      // 今日の問題も更新（日付シード＋同日再選出防止）
      pickTodayQuestion(questionsFromHook);
      // 苦手問題も更新
      const weak = questionsFromHook.filter((q: any) => (q.mistakeCount ?? 0) > 0);
      setWeakQuestionCount(weak.length);
      // 復習タイミングの問題も更新（未学習(srsなし)は除外する）
      const learnedDue = questionsFromHook.filter(
        (q: any) => q.srs !== undefined && isDueForReview(q.srs)
      );
      setReviewDueCount(learnedDue.length);
    }
  }, [questionsFromHook, pickTodayQuestion]);

  // 最終アクション時刻を読み込み（STATUS: STANDBY 表示用）
  useEffect(() => {
    const loadLastAction = async () => {
      try {
        const raw = await AsyncStorage.getItem('last_action_timestamp');
        if (raw) setLastActionAt(Number(raw) || null);
      } catch { /* noop */ }
    };
    loadLastAction();
  }, []);

  useEffect(() => {
    // 非同期処理をバックグラウンドで実行（ノンブロッキング）
    const loadAllData = async () => {
      try {
        await loadSettings();
        SoundManager.initialize();
        await loadExamCountdown();
        await loadQuickReviewQuestions();
        await updateTimerDisplay();
        await loadUserProgress();
        await loadDailyGoal();
      } catch (error) {
        console.error('Failed to initialize home screen:', error);
      }
      // 読み込み完了（エラー時も表示は行う）
      setIsDataReady(true);
    };

    loadAllData();

    // リアルタイム監視（500ms ごと）
    const interval = setInterval(() => {
      updateTimerDisplay();
    }, 500);

    return () => clearInterval(interval);
  }, [currentLocale]);

  const updateTimerDisplay = async () => {
    try {
      const timerLabel = await AsyncStorage.getItem('active_timer_label');
      
      if (timerLabel === null) {
        setDisplayTimer(currentLocale === 'ja' ? 'なし' : 'No limit');
      } else {
        setDisplayTimer(timerLabel || (currentLocale === 'ja' ? 'なし' : 'No limit'));
      }
    } catch (error) {
      console.error('Failed to update timer:', error);
    }
  };

  const loadUserProgress = async () => {
    try {
      // 0. プロフィール画像は AsyncStorage を唯一の保存先として読み込む
      //    (Firestore には保存しないため profile.profileImage は通常 null)
      setProfileImage(await readLocalProfileImage());

      // 1. まずローカルのキャッシュ（AsyncStorage）から最速で読み込んで、画面に即表示！
      const cachedLevel = await AsyncStorage.getItem(STORAGE_KEYS.USER_LEVEL);
      const cachedCoins = await AsyncStorage.getItem(STORAGE_KEYS.USER_COINS);
      const cachedProfile = await AsyncStorage.getItem('user_profile_cache');
      
      if (cachedLevel) setUserLevel(parseInt(cachedLevel, 10));
      if (cachedCoins) setUserCoins(parseInt(cachedCoins, 10));
      if (cachedProfile) { const p: any = safeParse(cachedProfile, null); setProfile(p); if (p && p.nextLevelXP) setXpProgress(Math.min((p.currentXP || 0) / p.nextLevelXP * 100, 100)); }

      // 2. その後、裏で Firestore から最新データを取得し、差分があればアップデート！
      if (user?.uid) {
        const userProfile = await readUserProfileDocument(user.uid);
        if (userProfile) {
          setUserLevel(userProfile.level);
          setUserCoins(userProfile.totalCoins);
          setProfile(userProfile);
          
          // 最新データを次回遷移時のために最速でキャッシュに保存しておく
          await AsyncStorage.setItem(STORAGE_KEYS.USER_LEVEL, userProfile.level.toString());
          await AsyncStorage.setItem(STORAGE_KEYS.USER_COINS, userProfile.totalCoins.toString());
          await AsyncStorage.setItem('user_profile_cache', JSON.stringify(userProfile));
          
          const progress = Math.min((userProfile.currentXP / userProfile.nextLevelXP) * 100, 100);
          setXpProgress(progress);
        }
      }
    } catch (error) {
      console.error('Failed to load user progress:', error);
    }
  };

  // XP獲得後にHome画面のリングを更新するためのリフレッシュ関数
  const refreshProfile = useCallback(() => {
    loadUserProgress();
  }, [loadUserProgress]);

  // ページにフォーカスが戻ったとき（クイズ完了・問題作成後にHomeへ戻ったとき）にプロフィールを再読み込み
  useEffect(() => {
    const handleFocus = () => {
      refreshProfile();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshProfile();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshProfile]);

  const loadQuickReviewQuestions = async () => {
    try {
      const stored = await AsyncStorage.getItem('quiz_questions');
      if (stored) {
        const allQuestions = safeParseArray(stored, []);
        const weakQuestions = allQuestions.filter((q: any) => q.mistakeCount > 0);
        const shuffled = [...weakQuestions].sort(() => Math.random() - 0.5).slice(0, 3);
        setQuickReviewQuestions(shuffled);
      }
    } catch (e) {
      console.error('Failed to load quick review:', e);
    }
  };

  const loadExamCountdown = async () => {
    try {
      // 1. Load from calendar_events (same as calendar screen)
      const eventsRaw = await AsyncStorage.getItem('calendar_events');
      if (!eventsRaw) {
        setExamCountdown(null);
        return;
      }

      const events = safeParseArray<{ date: string; name: string }>(eventsRaw, []);
      
      // 2. Extract exam events (events with name containing "試験")
      const examEvents = events.filter((event: any) => 
        event.name && event.name.includes('試験')
      );

      if (examEvents.length === 0) {
        setExamCountdown(null);
        return;
      }

      // 3. Get today and find the nearest upcoming exam
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let nearestExam = null;
      for (const exam of examEvents) {
        const examDate = new Date(exam.date);
        if (examDate >= today) {
          if (!nearestExam || examDate < new Date(nearestExam.date)) {
            nearestExam = exam;
          }
        }
      }

      if (nearestExam) {
        const examDate = new Date(nearestExam.date);
        const daysLeft = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        setExamCountdown({ daysLeft, examName: nearestExam.name });
      } else {
        setExamCountdown(null);
      }
    } catch (e) {
      console.error('Failed to load exam countdown:', e);
      setExamCountdown(null);
    }
  };

  useEffect(() => {
    loadExamDates();
  }, []);

  useEffect(() => {
    checkAndShowMotivationalMessage();
  }, [examDates]);

  // 試験までの進捗率を計算
  useEffect(() => {
    if (examCountdown && totalQuestions > 0) {
      // Calculate progress: more questions = better progress
      // You can adjust this formula
      const progress = Math.min(100, Math.round((totalQuestions / (totalQuestions + weakQuestionCount + 1)) * 100));
      setExamProgress(progress);
    }
  }, [examCountdown, totalQuestions, weakQuestionCount]);

  const loadExamDates = async () => {
    try {
      const saved = await AsyncStorage.getItem('EXAM_DATES');
      if (saved) {
        setExamDates(safeParseArray(saved, []));
      }
    } catch (error) {
      console.error('Error loading exam dates:', error);
    }
  };

  const checkAndShowMotivationalMessage = () => {
    if (examDates.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingExams = examDates
      .map(exam => ({
        ...exam,
        dateObj: new Date(exam.date)
      }))
      .filter(exam => exam.dateObj >= today)
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

    if (upcomingExams.length > 0) {
      const nearestExam = upcomingExams[0];
      const daysUntil = Math.ceil((nearestExam.dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil <= 7) {
        const messages = locale === 'ja' ? [
          '「諦めたらそこで試合終了ですよ」— 安西先生（スラムダンク）',
          '「努力した者が全て報われるとは限らん。しかし、成功した者は皆すべからく努力しておる」— 鴨川源二（はじめの一歩）',
          '「継続は力なり」— 格言',
          '「七転び八起き」— 日本のことわざ',
          '「石の上にも三年」— 日本のことわざ',
          '「天才とは、1%のひらめきと99%の努力である」— トーマス・エジソン',
          '「成功とは、失敗を重ねても熱意を失わない能力である」— ウィンストン・チャーチル',
          '「できると思えばできる、できないと思えばできない。これは揺るぎない絶対的な法則である」— パブロ・ピカソ',
          '「夢を見ることができれば、それは実現できる」— ウォルト・ディズニー',
          '「困難の中に、機会がある」— アルベルト・アインシュタイン',
          '「今日の自分を超えるのは、昨日の自分だ」— 格言',
          '「一歩一歩、着実に進め」— 格言',
        ] : [
          '"It always seems impossible until it\'s done." — Nelson Mandela',
          '"The secret of getting ahead is getting started." — Mark Twain',
          '"Believe you can and you\'re halfway there." — Theodore Roosevelt',
          '"Success is not final, failure is not fatal." — Winston Churchill',
          '"The only way to do great work is to love what you do." — Steve Jobs',
          '"In the middle of difficulty lies opportunity." — Albert Einstein',
          '"Dream big and dare to fail." — Norman Vaughan',
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        const daysText = locale === 'ja' ? `${daysUntil}日` : `${daysUntil} days`;
        setMotivationalMessage(`${daysText}! ${randomMessage}`);
      } else {
        setMotivationalMessage('');
      }
    } else {
      setMotivationalMessage('');
    }
  };

  const checkLoginBonus = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const lastBonus = await AsyncStorage.getItem('daily_login_bonus_date');
      const streakRaw = await AsyncStorage.getItem('login_streak');
      let streak = parseInt(streakRaw || '0');
      
      if (lastBonus !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastBonus === yesterdayStr) {
          streak = Math.min(streak + 1, 30);  // 最大30日
        } else {
          streak = 1;
        }
        
        // ボーナス計算: 5 + (streak-1) * 0.5 → 最大約20コイン
        let bonus = 5 + Math.floor((streak - 1) * 0.5);
        if (bonus > 20) bonus = 20;
        
        const currentCoins = parseInt(await AsyncStorage.getItem(STORAGE_KEYS.USER_COINS) || '0', 10);
        await AsyncStorage.setItem(STORAGE_KEYS.USER_COINS, (currentCoins + bonus).toString());
        await AsyncStorage.setItem('daily_login_bonus_date', today);
        await AsyncStorage.setItem('login_streak', streak.toString());
        
        // ボーナス通知（初回のみ）
        Alert.alert(
          currentLocale === 'ja' ? 'ログインボーナス' : 'Login Bonus',
          currentLocale === 'ja'
            ? `${streak}日連続ログイン！ ${bonus}コインを獲得しました！`
            : `${streak} day streak! You got ${bonus} coins!`
        );
      }
    } catch (e) {
      console.error('checkLoginBonus error:', e);
    }
  };

    // デイリーゴール設定を読み込み
  const loadDailyGoal = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_GOAL);
      const parsed = raw ? parseInt(raw, 10) : NaN;
      setDailyGoal(Number.isFinite(parsed) && parsed > 0 ? parsed : 10);
    } catch {
      setDailyGoal(10);
    }
  };

  const loadSettings = async () => {
    try {
      // 未ログイン時のみローカルストレージから読み込み
      if (!user) {
        const savedQuestions = await AsyncStorage.getItem('quiz_questions');
        if (savedQuestions) {
          const questions = safeParseArray(savedQuestions, []);
          setTotalQuestions(questions.length);
          if (questions.length > 0) {
            // 今日の問題も更新（日付シード＋同日再選出防止）
            await pickTodayQuestion(questions);
          }
          const weak = questions.filter((q: any) => (q.mistakeCount ?? 0) > 0);
          setWeakQuestionCount(weak.length);
        }
      }

      await loadTimerSetting();
      await checkLoginBonus();

      const savedLayout = await AsyncStorage.getItem('home_layout_mode');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadTimerSetting = async () => {
    try {
      let timerValue = await AsyncStorage.getItem('APP_TIMER_SETTING');
      let storedMinutes = timerValue ? parseInt(timerValue, 10) : null;

      if (storedMinutes === null) {
        const oldTimerValue = await AsyncStorage.getItem('timerSetting');
        if (oldTimerValue !== null) {
          storedMinutes = parseInt(oldTimerValue, 10);
          await AsyncStorage.setItem('APP_TIMER_SETTING', storedMinutes.toString());
          await AsyncStorage.removeItem('timerSetting');
        }
      }

      const finalMinutes = (storedMinutes !== null && !isNaN(storedMinutes)) ? storedMinutes : 5;
      setTimerMinutes(finalMinutes);
    } catch (error) {
      console.error('Failed to load timer setting:', error);
      setTimerMinutes(5);
    }
  };

  const showTimerAlert = () => {
    SoundManager.play('decide');
    const options = [
      { text: locale === 'ja' ? 'なし（制限なし）' : 'No Limit', onPress: () => saveTimer(0) },
      { text: '1min', onPress: () => saveTimer(1) },
      { text: '3min', onPress: () => saveTimer(3) },
      { text: '5min', onPress: () => saveTimer(5) },
      { text: '10min', onPress: () => saveTimer(10) },
      { text: t.cancel, style: 'cancel' as const }
    ];
    
    Alert.alert(
      locale === 'ja' ? 'タイマー設定' : 'Timer Settings',
      locale === 'ja' ? 'クイズの制限時間を選択してください' : 'Select quiz time limit',
      options
    );
  };

  const saveTimer = async (minutes: number) => {
    try {
      setTimerMinutes(minutes);
      await AsyncStorage.setItem('APP_TIMER_SETTING', minutes.toString());
      SoundManager.play('complete');
    } catch (error) {
      console.error('Failed to save timer settings:', error);
    }
  };

  // アニメーション用
  const shakeAnim = animationLevel !== 'none' ? createShakeAnimation(animationLevel === 'rich' ? 2 : 1) : undefined;
  const pulseIntensity = animationLevel === 'rich' ? 1.08 : animationLevel === 'standard' ? 1.05 : 1;
  const pulseAnim = animationLevel !== 'none' && animationLevel !== 'lite' ? createPulseAnimation(pulseIntensity) : undefined;

  // メインコンテンツスタイル
  // モバイル／タブレット／デスクトップすべて1カラムで同じ順序に統一する。
  // デスクトップのみ幅広なので maxWidth で中央寄せする。
  const mainContentStyle = {
    mobile: { flexDirection: 'column' as const, gap: 12, width: '100%' as const },
    tablet: { flexDirection: 'column' as const, gap: 12, width: '100%' as const },
    desktop: {
      flexDirection: 'column' as const,
      gap: 16,
      width: '100%' as const,
      maxWidth: 720,
      marginLeft: 'auto' as const,
      marginRight: 'auto' as const,
    },
  };

  const primaryTextColor = onPrimary;

  // デイリークエスト読み込み
  useEffect(() => {
    const loadQuests = async () => {
      try {
        const stats = await loadStats();
        const progress = await loadProgress();
        const dailyMissions = MISSIONS.filter(m => m.period === 'daily');
        setDailyQuests(dailyMissions);
        const qp = dailyMissions.map(m => {
          const p = getMissionProgress(m, progress, stats);
          return { current: p.current, completed: p.completed };
        });
        setQuestProgress(qp);
      } catch (error) {
        console.error('Failed to load quests:', error);
      }
    };
    loadQuests();
  }, []);

  // 統計カードのデータ読み込み（streak・accuracy・today・weekly）
  const loadStatSnapshot = async () => {
    try {
      const [stats, today, weekly] = await Promise.all([
        loadStats(),
        loadTodayCorrect(),
        loadWeeklyProgress(),
      ]);
      setUserStats(stats);
      setTodayCorrect(today);
      setWeeklyProgress(weekly);
    } catch (e) {
      console.error('Failed to load stats snapshot:', e);
    }
  };

  // 統計カード読み込み（画面表示中はフォーカス復帰時にも更新）
  useEffect(() => {
    loadStatSnapshot();
    const refresh = () => {
      if (!document.hidden) loadStatSnapshot();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [currentLocale]);

  const renderStatsCard = () => {
    const stats = userStats;
    const streak = stats?.loginStreak ?? 0;
    const accuracy = stats && stats.quizPlayed > 0
      ? Math.min(100, Math.round((stats.correctAnswers / stats.quizPlayed) * 100))
      : 0;

    // 週間進捗の表示テキスト
    const weekly = weeklyProgress;
    const weeklyChangeText =
      weekly.lastWeek === 0 && weekly.thisWeek === 0
        ? t.noWeeklyChange
        : `${weekly.thisWeek}${locale === 'ja' ? '' : ' '}${t.weeklyAnsweredUnit} ・ ${weekly.changePercent >= 0 ? '+' : ''}${weekly.changePercent}% ${t.vsLastWeek}`;
    const isWeeklyUp = weekly.changePercent >= 0;

    const statItems: {
      key: string;
      icon: React.ReactNode;
      value: number;
      suffix?: string;
      empty?: boolean;
      emptyText?: string;
      label: string;
    }[] = [
      { key: 'total', icon: <ClipboardList size={18} color={colors.primary} />, value: totalQuestions, label: t.questionsCountLabel },
      { key: 'today', icon: <CheckCircle2 size={18} color={colors.success} />, value: todayCorrect, label: t.todayCorrectLabel },
      { key: 'streak', icon: <View style={{ position: 'relative', width: 18, height: 18 }}>
          <Flame size={18} color={colors.warning} />
          {streak >= 3 && (
            <LottieView
              ref={fireAnimationRef}
              source={FireAnimation}
              autoPlay
              loop
              style={styles.fireAnimation}
              resizeMode="contain"
            />
          )}
        </View>, value: streak, label: t.streakLabel },
      { key: 'accuracy', icon: <Target size={18} color={colors.secondary} />, value: accuracy, suffix: '%', empty: accuracy <= 0, emptyText: '--', label: t.accuracyLabel },
    ];

    return (
      <View style={[styles.statsContainer, cardPadding[screenType], { backgroundColor: colors.card, borderRadius: br }]}>
        {/* 2×2 グリッド：問題数・今日の正解・連続学習・正答率 */}
        <View style={styles.statsGrid}>
          {statItems.map(item => (
            <View key={item.key} style={styles.statsTile}>
              {item.icon}
              <CountUpText
                value={item.value}
                suffix={item.suffix}
                empty={item.empty}
                emptyText={item.emptyText}
                enabled={terminalEffects}
                style={[styles.statNumber, { color: colors.primary, fontSize: fs(20) }]}
              />
              <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* 週間進捗（サマリー表示 - 統計画面への導線は「すべての統計を見る」に統一） */}
        <View
          style={[styles.weeklyRow, { backgroundColor: colors.primary + '0D', borderColor: colors.border }]}
        >
          <Calendar size={16} color={colors.primary} />
          <View style={styles.weeklyRowText}>
            <Text style={[styles.weeklyRowTitle, { color: colors.text, fontSize: fontSize.small }]}>{t.weeklyProgressLabel}</Text>
            <Text style={[styles.weeklyRowDesc, { color: colors.textSecondary, fontSize: fontSize.small }]} numberOfLines={1}>{weeklyChangeText}</Text>
          </View>
          <TrendingUp size={16} color={isWeeklyUp ? colors.success : colors.error} />
        </View>

        {/* ストリークマイルストーン */}
        {streak >= 3 && (
          <View style={styles.streakMilestone}>
            <Flame size={14} color={colors.warning} />
            <Text style={[styles.streakMilestoneText, { color: colors.warning, fontSize: fontSize.small }]}>
              {streak}{t.daysInRow}
            </Text>
          </View>
        )}

        {/* すべての統計を見る */}
        <PressableButton
          style={styles.seeAllRow}
          onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/statistics'); }}
        >
          <Text style={[styles.seeAllText, { color: colors.primary, fontSize: fontSize.small }]}>{t.seeAllStats}</Text>
          <ChevronRight size={16} color={colors.primary} />
        </PressableButton>
      </View>
    );
  };

  // 統計データが空のときのオンボーディング表示（「ゼロの祭壇」撲滅）
  // カード自体をタップ可能なCTAに格上げ（押すと問題作成へ）＝solid 枠＋薄いシアン背景
  const renderEmptyStats = () => (
    <PressableButton
      style={[styles.statsContainer, cardPadding[screenType], {
        backgroundColor: colors.primary + '08',
        borderRadius: br,
        alignItems: 'center',
        paddingVertical: screenType === 'mobile' ? 22 : 28,
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'solid',
      }]}
      onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/create'); }}
    >
      <RomeaSpeechBubble
        message={
          locale === 'ja'
            ? 'ようこそ！まずは問題を作成して、学習を始めましょう。'
            : 'Welcome! Create your first question to install your first memory.'
        }
        romeaSize={screenType === 'mobile' ? 64 : 80}
        style={{ marginBottom: 16 }}
      />
      <View style={[styles.emptyStatsIcon, { borderColor: colors.primary + '55' }]}>
        <Zap size={22} color={colors.primary} />
      </View>
      <Text style={[styles.emptyStatsTitle, { color: colors.primary }]}>
        {locale === 'ja' ? '問題を作成して始めましょう' : 'Create your first question'}
      </Text>
      <Text style={[styles.emptyStatsDesc, { color: colors.textSecondary }]}>
        {locale === 'ja' ? 'タップして最初の1問を作成。正解すると統計が反映されます' : 'TAP TO CREATE — ANSWER YOUR FIRST QUESTION TO BOOT THE STATS MODULE'}
      </Text>
      {/* オンボーディングの具体的ステップ（P1：ゼロ状態UX改善） */}
      <View style={{ marginTop: 14, gap: 5, alignSelf: 'stretch' }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19 }} numberOfLines={1}>
          {locale === 'ja' ? '① 作成  —  最初の問題を作成' : '① CREATE  —  Make your first question'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19 }} numberOfLines={1}>
          {locale === 'ja' ? '② 学習  —  クイズに挑戦して正解' : '② TRANSFER  —  Answer it correctly'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 19 }} numberOfLines={1}>
          {locale === 'ja' ? '③ 記録  —  統計モジュールが起動' : '③ BOOT  —  Stats module boots up'}
        </Text>
      </View>
    </PressableButton>
  );

  const renderTodayQuestion = () => {
    if (!todayQuestion) return null;
    return (
      <PressableButton
        style={[styles.todayCard, cardPadding[screenType], { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderRadius: br, borderWidth: 1 }]}
        onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/quiz'); }}
      >
        <View style={styles.todayHeader}>
        <Image source={IMAGES.book} style={{ width: 18, height: 18, resizeMode: 'contain' }} />
        <Text style={[styles.todayLabel, { color: colors.primary, fontSize: fontSize.body }]}>
          {t.todayQuestion}
        </Text>
        </View>
        <Text style={[styles.todayQuestion, { color: colors.text, fontSize: fontSize.body }]} numberOfLines={2}>
          {todayQuestion.question}
        </Text>
      </PressableButton>
    );
  };

  const renderWeakCard = () => {
    if (weakQuestionCount <= 0) return null;
    return (
      <PressableButton
        style={[styles.weakCard, cardPadding[screenType], { backgroundColor: colors.error + '15', borderColor: colors.error, borderRadius: br, borderWidth: 1 }]}
        onPress={async () => {
          SoundManager.play('decide');
          await AsyncStorage.setItem('quiz_mode', 'weak');
          navigateWithAnimation('/quiz');
        }}
      >
        <AlertTriangle size={20} color={colors.error} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.weakLabel, { color: colors.error, fontSize: fontSize.body }]}>
            {t.weakQuestionsQuiz}
          </Text>
          <Text style={[styles.weakDesc, { color: colors.textSecondary, fontSize: fontSize.small }]}>
            {locale === 'ja' ? `${weakQuestionCount}${t.reviewWeakQuestions}` : `${t.reviewWeakQuestions} (${weakQuestionCount})`}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.error} />
      </PressableButton>
    );
  };

  // ── 今日の復習カード（SRS） ──
  const renderReviewCard = () => {
    if (reviewDueCount <= 0) return null;
    return (
      <PressableButton
        style={[styles.reviewCard, cardPadding[screenType], {
          backgroundColor: colors.success + '15',
          borderColor: colors.success,
          borderRadius: br,
          borderWidth: 1,
        }]}
        onPress={async () => {
          SoundManager.play('decide');
          await AsyncStorage.setItem('quiz_mode', 'review');
          navigateWithAnimation('/quiz');
        }}
      >
        <Calendar size={20} color={colors.success} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.reviewLabel, { color: colors.success, fontSize: fontSize.body }]}>
            {locale === 'ja' ? '今日の復習' : "Today's Review"}
          </Text>
          <Text style={[styles.reviewDesc, { color: colors.textSecondary, fontSize: fontSize.small }]}>
            {locale === 'ja'
              ? `${reviewDueCount}問の復習タイミングです`
              : `${reviewDueCount} questions ready for review`}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.success} />
      </PressableButton>
    );
  };

  // ─────────────────────────────────────────────
  // 転送モード選択カード（RAPID / DAILY / DEEP）
  // ─────────────────────────────────────────────
  const questMetaById: Record<string, { code: string; rewardJp: string; rewardEn: string }> = {
    d1: { code: 'クイズ', rewardJp: '+50 XP', rewardEn: '+50 XP' },
    d2: { code: '問題作成', rewardJp: '称号「設計者」を解放', rewardEn: 'UNLOCK: TITLE ARCHITECT' },
    d3: { code: '全問正解', rewardJp: 'パルスモード起動', rewardEn: 'ACTIVATE: PULSE MODE' },
  };

  // STATUS 行（SYSTEM LOG 先頭に表示。ヘッダーからは撤去）
  const statusText = (() => {
    void statusTick; // 30秒ごとのライブ更新トリガー
    if (lastActionAt) {
      const diffMin = Math.floor((Date.now() - lastActionAt) / 60000);
      let elapsed: string;
      if (diffMin < 1) elapsed = 'たった今';
      else if (diffMin < 60) elapsed = `${diffMin}分前`;
      else elapsed = `${Math.floor(diffMin / 60)}時間 ${diffMin % 60}分前`;
      return `最終学習: ${elapsed}`;
    }
    return 'まだ学習していません';
  })();

  // NEXT RANK 進行情報（ヘッダー表示用：次の未取得称号と現在値）
  const RANK_THRESHOLDS: Record<string, { get: (s: UserStats) => number; target: number }> = {
    beginner: { get: (s) => s.quizPlayed, target: 1 },
    studious: { get: (s) => s.quizPlayed, target: 10 },
    scholar: { get: (s) => s.quizPlayed, target: 50 },
    master: { get: (s) => s.quizPlayed, target: 100 },
    creator: { get: (s) => s.questionsCreated, target: 10 },
    architect: { get: (s) => s.questionsCreated, target: 50 },
    perfecter: { get: (s) => s.perfectQuiz, target: 5 },
    streak7: { get: (s) => s.maxStreak, target: 7 },
    streak30: { get: (s) => s.maxStreak, target: 30 },
    centurion: { get: (s) => s.correctAnswers, target: 100 },
    millionaire: { get: (s) => s.totalBooks, target: 100 },
    planner: { get: (s) => s.calendarEvents, target: 5 },
  };
  const nextRankText = (() => {
    if (!userStats) return '';
    const unlocked = Array.isArray(userStats.unlockedTitles) ? userStats.unlockedTitles : [];
    const next = TITLE_BADGES.find((b) => !unlocked.includes(b.id));
    if (!next) return '称号: 全解除';
    const meta = RANK_THRESHOLDS[next.id];
    const name = locale === 'ja' ? next.titleJa : next.titleEn;
    if (!meta) return `次の称号: ${name}`;
    const cur = Math.min(meta.get(userStats), meta.target);
    return `次の称号: ${name} (${cur}/${meta.target})`;
  })();

  // ヘッダー用：最終転送からの経過時間（30秒ごとにライブ更新：P2-7）
  const lastTransferElapsed = (() => {
    void statusTick;
    if (!lastActionAt) return locale === 'ja' ? 'まだ学習していません' : 'No activity yet';
    const diffMin = Math.floor((Date.now() - lastActionAt) / 60000);
    if (diffMin < 1) return locale === 'ja' ? 'たった今' : 'Just now';
    if (diffMin < 60) return locale === 'ja' ? `${diffMin}分前` : `${diffMin}m ago`;
    return locale === 'ja'
      ? `${Math.floor(diffMin / 60)}時間 ${diffMin % 60}分前`
      : `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`;
  })();

  // MEMORY CORE 表示（TerminalLog 用：初回正解まで HIDDEN）
  const accuracyRate = userStats && userStats.quizPlayed > 0
    ? (userStats.correctAnswers / userStats.quizPlayed) * 100
    : 0;
  const memoryCoreText = todayCorrect === 0 || accuracyRate === 0
    ? '正答率: 未計測 — 最初の学習を待っています'
    : `正答率: ${accuracyRate.toFixed(1)}%`;

  const handleInitiateTransfer = () => {
    SoundManager.play('decide');
    // 最終アクション時刻を記録（STATUS: STANDBY の経過表示用）
    const now = Date.now();
    try {
      AsyncStorage.setItem('last_action_timestamp', String(now));
      setLastActionAt(now);
    } catch { /* noop */ }
    // SYSTEM LOG に学習開始ログを追加（ref 経由でコンポーネントへ）
    terminalLogRef.current?.addLog('学習を開始');

    if (questionsFromHook.length === 0) {
      Alert.alert(
        locale === 'ja' ? '問題がありません' : 'No Questions',
        locale === 'ja' ? 'まずは「作成」タブから問題を作りましょう！' : 'Create some questions in the "Create" tab first!'
      );
      return;
    }
    // 問題数の選択は quiz.tsx の設定画面で行うため、ここでは遷移するだけ
    navigateWithAnimation('/quiz');
  };

  // 問題数の選択は quiz.tsx の設定画面で行うため、モード選択は設けない
  const renderTransferSelector = () => (
    <View style={[styles.transferCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Animated.View style={{ width: '100%', alignItems: 'center' }}>
        <PressableButton
          style={[
            styles.mainPlayButton,
            { backgroundColor: colors.primary },
            // スマホ縦画面で窮屈にならないよう高さと余白を縮め、幅広は maxWidth で抑える
            screenType === 'mobile' && { height: 68, paddingVertical: 20 },
            screenType !== 'mobile' && { height: 80, paddingVertical: 28, maxWidth: 520 },
          ]}
          onPress={handleInitiateTransfer}
        >
          <Play size={28} color={onPrimary} strokeWidth={2} />
          <Text numberOfLines={1} style={[styles.mainPlayText, { color: onPrimary }]}>
            学習を始める
          </Text>
        </PressableButton>
      </Animated.View>
    </View>
  );

  // 問題が0件のときの空状態
  const renderEmptyState = () => (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ClipboardList size={48} color={colors.primary} style={styles.emptyStateIcon} />
      <Text style={[styles.emptyStateTitle, { color: colors.text }]}>{t.emptyStateTitle}</Text>
      <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>{t.emptyStateDesc}</Text>
      <PressableButton
        style={[styles.emptyStateButton, { backgroundColor: colors.primary }]}
        onPress={() => {
          SoundManager.play('decide');
          navigateWithAnimation('/create');
        }}
      >
        <Text style={[styles.emptyStateButtonText, { color: onPrimary }]}>{t.goCreate}</Text>
      </PressableButton>
    </View>
  );

  // renderMainActions / renderQuickActions は renderTransferSelector に統合・置き換え済み

  // デイリークエストカード
  const renderDailyQuests = () => {
    if (dailyQuests.length === 0) return null;
    return (
      <View style={[styles.questCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.questHeader}>
          <Target size={18} color={colors.primary} />
          <Text style={[styles.questTitle, { color: colors.text }]}>
            {locale === 'ja' ? '今日のクエスト' : 'Daily Quests'}
          </Text>
        </View>
        {dailyQuests.map((mission, index) => {
          const prog = questProgress[index];
          const current = prog?.current ?? 0;
          const done = !!prog?.completed;
          const meta = questMetaById[mission.id] ?? {
            code: locale === 'ja' ? mission.titleJa : mission.titleEn,
            rewardJp: `+${mission.reward} XP`,
            rewardEn: `+${mission.reward} XP`,
          };
          const rewardText = locale === 'ja' ? meta.rewardJp : meta.rewardEn;
          const progressText = done
            ? '[完了]'
            : current > 0
              ? `[${current}/${mission.goal}]`
              : '[未達成]';
          return (
            <View key={mission.id} style={styles.questItem}>
              {done
                ? <CheckCircle2 size={16} color={colors.success} style={{ marginRight: 8 }} />
                : <Square size={16} color={colors.border} style={{ marginRight: 8 }} />}
              <Text style={[styles.questTitleCol, { color: colors.text }]} numberOfLines={2}>
                {meta.code}
              </Text>
              <Text style={[styles.questRewardCol, { color: colors.primary }]} numberOfLines={2}>
                {rewardText}
              </Text>
              <Text style={[styles.questStatusCol, { color: done ? colors.success : colors.textSecondary }]}>
                {progressText}
              </Text>
            </View>
          );
        })}
        <PressableButton
          style={[styles.questMoreBtn, { borderColor: colors.border }]}
          onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/missions'); }}
        >
          <Text style={[styles.questMoreText, { color: colors.primary }]}>
            {locale === 'ja' ? 'すべてのミッションを見る →' : 'View all missions →'}
          </Text>
        </PressableButton>
      </View>
    );
  };

  // アチーブメントバッジ
  const renderAchievementBadges = () => {
    const unlocked = userStats?.unlockedTitles ?? [];
    const badges = TITLE_BADGES.filter((b) => unlocked.includes(b.id));
    if (badges.length === 0) return null;
    return (
      <View style={styles.achievementSection}>
        <View style={styles.achievementHeader}>
          <Text style={[styles.achievementHeaderTitle, { color: colors.textSecondary, fontSize: fontSize.small }]}>
            {t.achievements}
          </Text>
          <PressableButton
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
            onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/achievements'); }}
          >
            <Text style={[styles.achievementMoreText, { color: colors.primary, fontSize: fontSize.small }]}>{t.viewAllAchievements}</Text>
            <ChevronRight size={14} color={colors.primary} />
          </PressableButton>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }} style={{ width: '100%' }}>
          {badges.map((badge, index) => {
            const IconComp = badgeIconMap[badge.icon] ?? Award;
            const palette = [colors.warning, colors.success, colors.primary, colors.secondary, colors.error];
            const accent = palette[index % palette.length];
            return (
              <View
                key={badge.id}
                style={[styles.achievementBadge, { backgroundColor: accent + '20', borderColor: accent }]}
              >
                <IconComp size={16} color={accent} />
                <Text style={[styles.achievementBadgeLabel, { color: colors.text }]} numberOfLines={1}>
                  {locale === 'ja' ? badge.titleJa : badge.titleEn}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  // ヘッダー（プロフィール画像＋XPリング）
  const renderHeader = () => {
    const titleDisplay = user ? getTitleDisplay(profile?.currentTitle || 'apprentice', currentLocale) : '見習い暗記人';
    // 画像は AsyncStorage (profileImage state) を優先し、未取得時のみ
    // Firestore 側の http(s) URL（旧データ）にフォールバックする
    const imageUri = profileImage || (profile as any)?.profileImage || null;

    // リングの設定
    const ringSize = screenType === 'desktop' ? 64 : 56;
    const ringRadius = screenType === 'desktop' ? 28 : 24;
    const strokeWidth = 5;
    const circumference = 2 * Math.PI * ringRadius;
    const progress = Math.min(xpProgress, 100);
    const strokeDashoffset = circumference * (1 - progress / 100);
    const imageSize = ringSize - strokeWidth * 4;

    // レベルバッジの設定
    const badgeHeight = 20;
    const badgeWidth = 48;

    // 長押しで表示する次のレベルまでのXP
    const nextLevelXP = profile?.nextLevelXP || 100;
    const currentXP = profile?.currentXP || 0;
    const remainingXP = Math.max(0, nextLevelXP - currentXP);

    // プロフィール未取得の間はヘッダーにローディングを表示（未初期値・デフォルト名の一瞬表示＝フラッシュ防止）
    if (!profile) {
      return (
        <View style={[styles.header, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>
            {locale === 'ja' ? '読み込み中...' : 'Loading...'}
          </Text>
        </View>
      );
    }

    return (
    <View style={[
      styles.header,
      {
        zIndex: 1000,
        position: 'relative',
        // ヘッダーのボーダー下線は全 screenType で統一する
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      },
    ]}>
      <View style={{ flex: 1 }}>
        {/* メイン行：画像＋称号＋ユーザー名＋コイン/本 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          {/* 左：プロフィール画像＋XPリング＋レベルバッジ（モンスト風） */}
          <View style={{ position: 'relative', width: ringSize, height: ringSize + badgeHeight, marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
            <PressableButton
              style={{ width: ringSize, height: ringSize, justifyContent: 'center', alignItems: 'center' }}
              onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/profile'); }}
              onLongPress={() => {
                SoundManager.play('decide');
                const msg = locale === 'ja'
                  ? `現在のXP: ${currentXP}\n次のレベルまであと ${remainingXP} XP です`
                  : `Current XP: ${currentXP}\n${remainingXP} XP until next level`;
                Alert.alert(locale === 'ja' ? 'レベル情報' : 'Level Info', msg);
              }}
            >
              <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
                {/* 背景の薄いリング（ベース） */}
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={colors.textSecondary}
                  strokeWidth={strokeWidth}
                  fill="none"
                />
                {/* 進捗リング（実線） */}
                <Circle
                  cx={ringSize / 2}
                  cy={ringSize / 2}
                  r={ringRadius}
                  stroke={colors.primary}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  rotation="-90"
                  originX={ringSize / 2}
                  originY={ringSize / 2}
                />
              </Svg>
              {/* プロフィール画像 */}
              <View style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, overflow: 'hidden', backgroundColor: colors.border }}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={{ width: imageSize, height: imageSize }} resizeMode="cover" />
                ) : (
                  <View style={{ width: imageSize, height: imageSize, backgroundColor: colors.primary + '30', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={imageSize * 0.4} color={colors.primary} />
                  </View>
                )}
              </View>
            </PressableButton>
            {/* レベルバッジ（円の下端に接する） */}
            <View style={{
              position: 'absolute',
              bottom: 0,
              left: (ringSize - badgeWidth) / 2,
              backgroundColor: colors.primary,
              borderRadius: br,
              paddingHorizontal: 6,
              paddingVertical: 2,
              minWidth: badgeWidth,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ color: onPrimary, fontSize: 10, fontWeight: '700' }}>
                Lv. {userLevel}
              </Text>
            </View>
          </View>

          {/* 中央：称号＋ユーザー名（横並び） */}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <View style={[styles.titleBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
              <Text style={[styles.titleText, { color: colors.primary, fontSize: fs(screenType === 'desktop' ? 16 : 14) }]} numberOfLines={1}>
                {titleDisplay}
              </Text>
            </View>
            <Text style={[styles.usernameText, { color: colors.text, fontSize: fs(screenType === 'desktop' ? 18 : 16), flexShrink: 1 }]} numberOfLines={1}>
              {profile?.username || 'An-Q Learner'}
            </Text>
          </View>

          {/* 右：コイン・本 */}
          <View style={[styles.currencyContainer, { gap: 8, marginLeft: 8 }]}>
            <View style={[styles.currencyBadge, { backgroundColor: colors.primary + '10', borderBottomWidth: 3, borderBottomColor: '#66FFD9' }]}>
              <Image source={IMAGES.coin} style={{ width: 36, height: 36, resizeMode: 'contain' }} />
              <Text style={[styles.currencyText, { color: colors.primary, fontSize: fs(screenType === 'desktop' ? 18 : 16) }]}>
                {userCoins}
              </Text>
            </View>
            <View style={[styles.currencyBadge, { backgroundColor: colors.primary + '10', borderBottomWidth: 3, borderBottomColor: '#66FFD9' }]}>
              <Image source={IMAGES.book} style={{ width: 36, height: 36, resizeMode: 'contain' }} />
              <Text style={[styles.currencyText, { color: colors.primary, fontSize: fs(screenType === 'desktop' ? 18 : 16) }]}>
                {profile?.totalBooks || 0}
              </Text>
            </View>
          </View>
        </View>

        {/* 2行目：DAILY TARGET */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <Target size={14} color={colors.primary} />
          <Text style={[styles.dailyGoalLabel, { color: colors.text, fontSize: fontSize.small }]}>
            {t.dailyGoalLabel}: {todayCorrect}/{dailyGoal}
          </Text>
          <View style={[styles.dailyGoalBar, { backgroundColor: colors.border, flex: 1 }]}>
            <View style={[styles.dailyGoalFill, {
              width: `${Math.min(100, dailyGoal > 0 ? (todayCorrect / dailyGoal) * 100 : 0)}%`,
              backgroundColor: colors.primary,
            }]} />
          </View>
        </View>

        {/* 3行目：SINCE LAST TRANSFER（30秒ごとにライブ更新：P2-7） */}
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            letterSpacing: 0.5,
            marginTop: 6,
          }}
          numberOfLines={1}
        >
          {`最終学習: ${lastTransferElapsed}`}
        </Text>
      </View>

    </View>
  );
};

  // データ未準備・問題読み込み中の間はローディングを表示
  // （ヘッダーや「問題がありません」の一瞬表示＝フラッシュを防止するため、
  //   isDataReady と questionsLoading の両方が完了するまで何も出さない）
  if (!isDataReady || questionsLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.text, fontSize: 14, marginTop: 12 }}>{locale === 'ja' ? '読み込み中...' : 'Loading...'}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, minHeight: '100%' }}>
    <PatternBackground pattern={pattern} color={colors.primary} style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView 
          style={{ backgroundColor: colors.background, flex: 1 }}
          contentContainerStyle={[
            styles.content, 
            containerStyles[screenType],
            { 
              flexGrow: 1, 
              paddingBottom: 100,
              backgroundColor: colors.background,
            }
          ]}
        >
          <StatusBar barStyle="light-content" />
          
          {/* 試験カウントダウン */}
          {examCountdown && (
            <PressableButton
              style={[styles.examCard, { 
                backgroundColor: examCountdown.daysLeft <= 7 ? '#FFEBEE' : examCountdown.daysLeft <= 30 ? '#FFF3E0' : colors.primary + '15',
                borderColor: colors.border,
              }]}
              onPress={() => { SoundManager.play('decide'); navigateWithAnimation('/calendar'); }}
            >
              <View style={styles.examHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <GraduationCap size={16} color={examCountdown.daysLeft <= 7 ? '#D32F2F' : examCountdown.daysLeft <= 30 ? '#F57C00' : colors.primary} />
                  <Text style={[styles.examTitle, { 
                    color: examCountdown.daysLeft <= 7 ? '#D32F2F' : examCountdown.daysLeft <= 30 ? '#F57C00' : colors.primary 
                  }]}>
                    {examCountdown.examName}
                  </Text>
                </View>
                <Text style={[styles.examDays, {
                  color: examCountdown.daysLeft <= 7 ? '#D32F2F' : examCountdown.daysLeft <= 30 ? '#F57C00' : colors.primary,
                  fontWeight: 'bold',
                  fontSize: 18,
                }]}>
                  {locale === 'ja' ? `あと ${examCountdown.daysLeft} 日` : `${examCountdown.daysLeft} days left`}
                </Text>
              </View>

              {/* 進捗バー */}
              <View style={styles.examProgressContainer}>
                <View style={[styles.examProgressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.examProgressFill, { 
                    width: `${examProgress}%`, 
                    backgroundColor: examCountdown.daysLeft <= 7 ? '#D32F2F' : examCountdown.daysLeft <= 30 ? '#F57C00' : colors.primary 
                  }]} />
                </View>
                <Text style={[styles.examProgressText, { color: colors.textSecondary }]}>
                  {examProgress}% 完了
                </Text>
              </View>

            </PressableButton>
          )}

          {/* Header */}
          {renderHeader()}

          {/* モチベーションメッセージ */}
          {/* 文字列 state は '' のとき View の子として text node 判定されるため boolean 化する */}
          {!!motivationalMessage && (
            <View style={[styles.motivationalContainer, { backgroundColor: colors.primary + '15', marginBottom: 12 }]}>
                <Lightbulb size={14} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.motivationalText, { color: colors.text, fontSize: fontSize.small }]} numberOfLines={3}>
                  {motivationalMessage}
                </Text>
            </View>
          )}

                    {/* 問題が0件のときは空状態ガイドを表示（ローディング中はスピナーで「問題がありません」の一瞬表示を防止） */}
          {questionsLoading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : questionsFromHook.length === 0 ? (
            renderEmptyState()
          ) : (
            /* モバイル／タブレット／デスクトップ：1カラムレイアウト（PCの視覚順序に統一） */
            <View style={mainContentStyle[screenType]}>
              {renderTransferSelector()}
              {totalQuestions === 0 || todayCorrect === 0 ? renderEmptyStats() : renderStatsCard()}
              {renderReviewCard()}
              {renderWeakCard()}
              {renderDailyQuests()}
              <TerminalLog
                ref={terminalLogRef}
                statusLine={statusText}
                initialLines={[...TERMINAL_LOG_HEAD, memoryCoreText]}
              />
              {renderTodayQuestion()}
              {renderAchievementBadges()}
            </View>
          )}

        </ScrollView>
    </PatternBackground>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    padding: 20,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 8,
  },
  appTitle: {
    fontWeight: 'bold',
  },
  appSubtitle: {
    marginTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  titleText: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  currencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyBadge: {
    // 下線デザイン（枠・背景・角丸・グローは廃止）
    // borderBottomColor / 薄い背景色はテーマ依存のため JSX のインラインスタイルで指定
    paddingHorizontal: 4,
    paddingBottom: 4,
    borderBottomWidth: 3,
  },
  currencyText: {
    fontWeight: '700',
  },
  usernameText: {
    fontWeight: '600',
  },
  xpBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  xpText: {
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'right',
  },
  languageText: {
    fontWeight: 'bold',
  },
  levelText: {
    fontWeight: '600',
  },
  todayCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  todayEmoji: { fontSize: 16 },
  todayLabel: { fontWeight: 'bold' },
  todayQuestion: { lineHeight: 20 },
  weakCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  weakEmoji: { fontSize: 20 },
  weakLabel: { fontWeight: 'bold', marginBottom: 2 },
  weakDesc: {},
  reviewCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  reviewLabel: { fontWeight: 'bold', marginBottom: 2 },
  reviewDesc: {},
  motivationalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  motivationalText: {
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 16,
  },
  examCard: {
    marginHorizontal: 0,
    marginVertical: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  examHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  examTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  examDays: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  examProgressContainer: {
    marginBottom: 12,
  },
  examProgressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  examProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  examProgressText: {
    fontSize: 12,
    textAlign: 'right',
  },
  statsContainer: {
    flexDirection: 'column',
    marginBottom: 12,
    borderRadius: 12,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statsTile: {
    width: '50%',
    alignItems: 'flex-start',
    paddingVertical: 6,
    gap: 2,
  },
  statNumber: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    color: '#666',
    marginTop: 4,
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  weeklyRowText: {
    flex: 1,
  },
  weeklyRowTitle: {
    fontWeight: '600',
  },
  weeklyRowDesc: {
    marginTop: 2,
  },
  seeAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
    paddingVertical: 4,
  },
  seeAllText: {
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  emptyStateIcon: {
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 1,
  },
  emptyStateText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  emptyStateButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  emptyStatsIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStatsTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  emptyStatsDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.85,
  },
  emptyStateButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  primaryButton: {
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontWeight: 'bold',
    marginLeft: 12,
  },
  secondaryButton: {
    borderWidth: 2,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontWeight: 'bold',
    marginLeft: 12,
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    minWidth: '22%',
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
    paddingHorizontal: 10,
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  featureCard: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  featureCardIcon: {
    marginBottom: 8,
  },
  featureCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  featureCardSubtitle: {
    fontSize: 12,
  },
  progressBarSmall: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  statBlock: {
    borderRadius: 12,
    alignItems: 'center',
  },
  statBlockNumber: {
    fontWeight: 'bold',
  },
  statBlockLabel: {
    marginTop: 4,
  },
  mainActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  actionCard: {
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    minHeight: 120,
  },
  actionCardTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginTop: 8,
  },
  actionCardSub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  mainPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    borderRadius: 28,
    width: '88%',
    alignSelf: 'center',
    height: 80,
    paddingVertical: 28,
    paddingHorizontal: 24,
    // 3D効果：フラット3D（光沢なし）＋サイバーグロー
    borderBottomWidth: 6,
    borderBottomColor: 'rgba(0,0,0,0.2)',
    boxShadow: '0px 10px 40px rgba(0,255,200,0.35)',
    elevation: 12,
  },
  mainPlayText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 24,
    letterSpacing: 1,
  },
  transferCard: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  questCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    boxShadow: '0px 3px 8px rgba(0,0,0,0.05)',
    elevation: 3,
  },
  questHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  questTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  questItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  questTitleCol: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1.5,
  },
  questRewardCol: {
    fontSize: 13,
    fontWeight: '600',
    flex: 2,
    flexShrink: 0,
  },
  questStatusCol: {
    fontSize: 12,
    fontWeight: '500',
    width: 90,
    textAlign: 'right',
    flexShrink: 0,
  },
  questMoreBtn: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  questMoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  terminalLog: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  terminalLogTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  terminalLogLine: {
    fontSize:  12,
    lineHeight: 18,
  },
  dailyGoalLabel: {
    fontWeight: '600',
    minWidth: 90,
  },
  dailyGoalBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  dailyGoalFill: {
    height: '100%',
    borderRadius: 4,
  },
  streakMilestone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
  },
  streakMilestoneText: {
    fontWeight: '600',
  },
  achievementSection: {
    marginTop: 12,
    marginBottom: 8,
    width: '100%',
    overflow: 'hidden',
  },
  achievementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  achievementHeaderTitle: {
    fontWeight: '600',
  },
  achievementMoreText: {
    fontWeight: '600',
  },
  achievementBadge: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 64,
  },
  achievementBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  fireAnimation: {
    position: 'absolute',
    width: 24,
    height: 24,
    top: -6,
    right: -6,
  },
});

const HomeScreenWrapper = () => {
  return <HomeScreen />;
};

export default HomeScreenWrapper;

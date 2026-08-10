import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, StatusBar, Alert, Animated, ActivityIndicator
} from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TooltipButton from './tooltipButton';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import PatternBackground from './patternBackground';
import { Platform } from 'react-native';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { STORAGE_KEYS } from './constants/storageKeys';
import { 
  Play, 
  Plus, 
  Calendar, 
  Inbox, 
  ClipboardList, 
  Home, 
  User, 
  Settings,
  TrendingUp,
  Target,
  BookOpen,
  ChevronRight,
  PenSquare,
  Share2,
  Package,
  RefreshCw,
  Palette,
  Music,
  Upload,
  Crown,
  Coins,
  AlertTriangle,
  Lightbulb,
  GraduationCap,
  Timer,
  BarChart3,
  CheckCircle2,
  Square
} from 'lucide-react';
import { AnimationLevel, createShakeAnimation, createPulseAnimation, bgDurationMap } from './animations';
import { useAuth } from './auth/AuthContext';
import { readUserProfileDocument, getTitleDisplay } from '../src/utils/userProgress';
import { useQuestionsContext } from './context/QuestionsContext';
import { safeParse, safeParseArray } from './utils/storageUtils';
import { MISSIONS, loadProgress, loadStats, getMissionProgress, Mission } from './missions';

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

const HomeScreen = () => {
  const navigate = useNavigate();
  const { colors, fs, pattern, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const [currentLocale, setCurrentLocale] = useState<'ja' | 'en'>(locale);
  const screenType = useResponsive();
  const { user } = useAuth();
  const { questions: questionsFromHook } = useQuestionsContext();
  const [userLevel, setUserLevel] = useState(1);
  const [userCoins, setUserCoins] = useState(0);
  const [profile, setProfile] = useState<any>(null);
  const [xpProgress, setXpProgress] = useState(0);
  const [showMenu, setShowMenu] = useState(false);

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

  // カード・ボタンサイズ
  const cpR: number | undefined = isCyberpunk ? 0 : undefined;
  const cpB: number | undefined = isCyberpunk ? 2 : undefined;

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
    small: screenType === 'desktop' ? 12 : screenType === 'tablet' ? 11 : 10,
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
  const [dailyQuests, setDailyQuests] = useState<Mission[]>([]);
  const [questProgress, setQuestProgress] = useState<{ current: number; completed: boolean }[]>([]);
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const [examDates, setExamDates] = useState<any[]>([]);
  const [examCountdown, setExamCountdown] = useState<{daysLeft: number, examName: string} | null>(null);
  const [quickReviewQuestions, setQuickReviewQuestions] = useState<any[]>([]);
  const [examProgress, setExamProgress] = useState(0);

  // questionsFromHookが更新されたら問題数を反映
  useEffect(() => {
    if (questionsFromHook.length > 0) {
      setTotalQuestions(questionsFromHook.length);
      // 今日の問題も更新
      const today = new Date();
      const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      const idx = seed % questionsFromHook.length;
      setTodayQuestion(questionsFromHook[idx]);
      // 苦手問題も更新
      const weak = questionsFromHook.filter((q: any) => (q.mistakeCount ?? 0) > 0);
      setWeakQuestionCount(weak.length);
    }
  }, [questionsFromHook]);

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
      } catch (error) {
        console.error('Failed to initialize home screen:', error);
      }
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
      // 1. まずローカルのキャッシュ（AsyncStorage）から最速で読み込んで、画面に即表示！
      const cachedLevel = await AsyncStorage.getItem(STORAGE_KEYS.USER_LEVEL);
      const cachedCoins = await AsyncStorage.getItem(STORAGE_KEYS.USER_COINS);
      const cachedProfile = await AsyncStorage.getItem('user_profile_cache');
      
      if (cachedLevel) setUserLevel(parseInt(cachedLevel, 10));
      if (cachedCoins) setUserCoins(parseInt(cachedCoins, 10));
      if (cachedProfile) setProfile(safeParse(cachedProfile, null));

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

  const loadSettings = async () => {
    try {
      // 未ログイン時のみローカルストレージから読み込み
      if (!user) {
        const savedQuestions = await AsyncStorage.getItem('quiz_questions');
        if (savedQuestions) {
          const questions = safeParseArray(savedQuestions, []);
          setTotalQuestions(questions.length);
          if (questions.length > 0) {
            const today = new Date();
            const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
            const idx = seed % questions.length;
            setTodayQuestion(questions[idx]);
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
  const mainContentStyle = {
    mobile: { flexDirection: 'column' as const, gap: 12 },
    tablet: { flexDirection: 'column' as const, gap: 14 },
    desktop: { 
      display: 'flex' as const,
      flexDirection: 'row' as const,
      gap: 16,
      marginBottom: 24,
    },
  };

  const leftColumnStyle = {
    mobile: { flex: 1 },
    tablet: { flex: 1 },
    desktop: { flex: 2, minWidth: 0 },
  };

  const rightColumnStyle = {
    mobile: { flex: 1 },
    tablet: { flex: 1 },
    desktop: { flex: 1, minWidth: 0 },
  };

  const primaryTextColor = isCyberpunk ? '#1A1A1A' : onPrimary;

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

  const renderStatsCard = () => {
    const isNoLimit = displayTimer === (locale === 'ja' ? 'なし' : 'No limit') || timerMinutes === 0;

    return (
      <View style={[styles.statsContainer, cardPadding[screenType], { backgroundColor: colors.card, borderRadius: cpR ?? 12 }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{totalQuestions}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.questionsCountLabel}</Text>
        </View>
        <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 20 }]}>
          {displayTimer === null ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : isNoLimit ? (
            <Timer size={24} color={colors.success} />
          ) : (
            <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>
              {displayTimer}
            </Text>
          )}
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>
            {isNoLimit ? (locale === 'ja' ? '制限なし' : 'No Limit') : t.timer}
          </Text>
        </View>
      </View>
    );
  };

  const renderTodayQuestion = () => {
    if (!todayQuestion) return null;
    return (
      <TouchableOpacity
        style={[styles.todayCard, cardPadding[screenType], { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderRadius: cpR ?? 12, borderWidth: cpB ?? 1 }]}
        onPress={() => { SoundManager.play('decide'); navigate('/quiz'); }}
      >
        <View style={styles.todayHeader}>
        <BookOpen size={16} color={colors.primary} />
        <Text style={[styles.todayLabel, { color: colors.primary, fontSize: fontSize.body }]}>
          {t.todayQuestion}
        </Text>
        </View>
        <Text style={[styles.todayQuestion, { color: colors.text, fontSize: fontSize.body }]} numberOfLines={2}>
          {todayQuestion.question}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderWeakCard = () => {
    if (weakQuestionCount <= 0) return null;
    return (
      <TouchableOpacity
        style={[styles.weakCard, cardPadding[screenType], { backgroundColor: colors.error + '15', borderColor: colors.error, borderRadius: cpR ?? 12, borderWidth: cpB ?? 1 }]}
        onPress={async () => {
          SoundManager.play('decide');
          await AsyncStorage.setItem('quiz_mode', 'weak');
          navigate('/quiz');
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
      </TouchableOpacity>
    );
  };

  const renderMainActions = () => (
    <View style={{ marginHorizontal: 4, marginBottom: 16 }}>
      <TouchableOpacity
        style={[styles.mainPlayButton, { backgroundColor: colors.primary }]}
        onPress={() => {
          SoundManager.play('decide');
          if (questionsFromHook.length === 0) {
            Alert.alert(
              locale === 'ja' ? '問題がありません' : 'No Questions',
              locale === 'ja' ? 'まずは「作成」タブから問題を作りましょう！' : 'Create some questions in the "Create" tab first!'
            );
            return;
          }
          navigate('/quiz');
        }}
      >
        <Play size={32} color="#fff" strokeWidth={2} />
        <Text style={styles.mainPlayText}>
          {locale === 'ja' ? '問題を解く' : 'Start Quiz'}
        </Text>
      </TouchableOpacity>
    </View>
  );

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
          const done = questProgress[index]?.completed;
          return (
            <View key={mission.id} style={styles.questItem}>
              {done
                ? <CheckCircle2 size={18} color={colors.success} style={{ marginRight: 10 }} />
                : <Square size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />}
              <Text style={[styles.questText, { color: colors.text }]}>
                {locale === 'ja' ? mission.titleJa : mission.titleEn}
              </Text>
              <Text style={[styles.questCount, { color: colors.textSecondary }]}>
                {questProgress[index]?.current ?? 0}/{mission.goal}
              </Text>
            </View>
          );
        })}
        <TouchableOpacity
          style={[styles.questMoreBtn, { borderColor: colors.border }]}
          onPress={() => { SoundManager.play('decide'); navigate('/missions'); }}
        >
          <Text style={[styles.questMoreText, { color: colors.primary }]}>
            {locale === 'ja' ? 'すべてのミッションを見る →' : 'View all missions →'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ヘッダー（ゲーム風UI）
  const renderHeader = () => {
    const titleDisplay = user ? getTitleDisplay(profile?.currentTitle || 'apprentice', currentLocale) : '見習い暗記人';
    
    return (
    <View style={[
      styles.header,
      { 
        zIndex: 1000,
        position: 'relative',
      },
      screenType === 'desktop' && { 
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }
    ]}>
      <View style={{ flex: 1 }}>
        {/* 1段目：称号 + コイン・本 */}
        <View style={[styles.headerRow, { justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }]}>
          <View style={[styles.titleBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
            <Text style={[styles.titleText, { color: colors.primary, fontSize: fs(screenType === 'desktop' ? 16 : 14) }]}>
              {titleDisplay}
            </Text>
          </View>
          <View style={[styles.currencyContainer, { gap: 8 }]}>
            <View style={[styles.currencyBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <Coins size={14} color={colors.warning} />
              <Text style={[styles.currencyText, { color: colors.warning, fontSize: fs(screenType === 'desktop' ? 13 : 11) }]}>
                {userCoins}
              </Text>
            </View>
            <View style={[styles.currencyBadge, { backgroundColor: colors.success + '20', borderColor: colors.success, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              <BookOpen size={14} color={colors.success} />
              <Text style={[styles.currencyText, { color: colors.success, fontSize: fs(screenType === 'desktop' ? 13 : 11) }]}>
                {profile?.totalBooks || 0}
              </Text>
            </View>
          </View>
        </View>

        {/* 2段目：ユーザー名 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <User size={20} color={colors.text} />
          <Text style={[styles.usernameText, { color: colors.text, fontSize: fs(screenType === 'desktop' ? 18 : 16) }]}>
            {profile?.username || 'An-Q Learner'}
          </Text>
        </View>

        {/* 3段目：レベル + プログレスバー */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[styles.levelText, { color: colors.primary, fontSize: fs(screenType === 'desktop' ? 15 : 13) }]}>
            Lv. {userLevel}
          </Text>
          <View style={[styles.xpBarContainer, { backgroundColor: colors.border, flex: 1 }]}>
            <View style={[styles.xpBarFill, { 
              width: `${xpProgress}%`, 
              backgroundColor: colors.primary 
            }]} />
          </View>
          <Text style={[styles.xpText, { color: colors.textSecondary, fontSize: fs(screenType === 'desktop' ? 11 : 10) }]}>
            {profile?.currentXP || 0} / {profile?.nextLevelXP || 100} XP
          </Text>
        </View>
      </View>

      {/* 右側：設定ボタン + ドロップダウンメニュー */}
      <View style={[styles.topButtons, { zIndex: 1001 }, screenType === 'desktop' && { gap: 12 }]}>
        <View style={{ position: 'relative' }}>
          <TooltipButton 
            style={[styles.iconButton, { 
              width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
              height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
              borderRadius: isCyberpunk ? 0 : (screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18),
              borderColor: colors.primary,
              borderWidth: cpB ?? 1,
            }]} 
            onPress={() => { 
              SoundManager.play('decide'); 
              setShowMenu(!showMenu); 
            }} 
            label={t.appSettings}
          >
            <Settings size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
          </TooltipButton>

          {/* ドロップダウンメニュー */}
          {showMenu && (
            <View style={[styles.dropdownMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity 
                style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  SoundManager.play('decide');
                  window.location.reload();
                  setShowMenu(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <RefreshCw size={16} color={colors.text} />
                  <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                    {locale === 'ja' ? '更新' : 'Reload'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  SoundManager.play('decide');
                  navigate('/settings');
                  setShowMenu(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Palette size={16} color={colors.text} />
                  <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                    {locale === 'ja' ? 'テーマ設定' : 'Theme Settings'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  SoundManager.play('decide');
                  navigate('/music');
                  setShowMenu(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Music size={16} color={colors.text} />
                  <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                    {locale === 'ja' ? '音楽設定' : 'Music Settings'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.dropdownItem, { borderBottomColor: colors.border }]}
                onPress={() => {
                  SoundManager.play('decide');
                  navigate('/multi');
                  setShowMenu(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Upload size={16} color={colors.text} />
                  <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                    {locale === 'ja' ? 'マルチ共有' : 'Multi Share'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dropdownItem}
                onPress={() => {
                  SoundManager.play('decide');
                  navigate('/appSettings');
                  setShowMenu(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Settings size={16} color={colors.text} />
                  <Text style={[styles.dropdownItemText, { color: colors.text }]}>
                    {locale === 'ja' ? '全般' : 'General'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

  // モバイル用：正答率のみ（本日の学習時間削除）
  const renderMobileInfoSections = () => {
    if (screenType === 'desktop') return null;
    return (
      <View style={{ marginTop: 12, gap: 12 }}>
        {/* 今日の1問 */}
        {todayQuestion && (
          <TouchableOpacity
            style={[styles.todayCard, { padding: 14, backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
            onPress={() => { SoundManager.play('decide'); navigate('/quiz'); }}
          >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <BookOpen size={16} color={colors.primary} />
            <Text style={[styles.mobileSectionLabel, { color: colors.primary }]}>{t.todayQuestion}</Text>
          </View>
            <Text style={[styles.mobileQuestionText, { color: colors.text, marginTop: 8 }]}>
              {todayQuestion.question}
            </Text>
          </TouchableOpacity>
        )}

        {/* 今週の正答率（本日の学習時間削除） */}
        <View style={[styles.infoCard, { padding: 14, backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <BarChart3 size={16} color={colors.primary} />
            <Text style={[styles.mobileSectionLabel, { color: colors.primary }]}>{locale === 'ja' ? '今週の正答率' : 'Weekly Accuracy'}</Text>
          </View>
          <Text style={[styles.mobileAccuracyValue, { color: colors.primary, marginTop: 8 }]}>
            78%
          </Text>
          <Text style={[styles.mobileInfoSubtext, { color: colors.textSecondary }]}>
            {locale === 'ja' ? '先週比 +5%' : '+5% vs last week'}
          </Text>
        </View>
      </View>
    );
  };

  const BottomNavBar = () => {
    const navItems = [
      { id: 'home', icon: Home, label: 'ホーム', path: '/' },
      { id: 'create', icon: PenSquare, label: '作成', path: '/create' },
      { id: 'multi', icon: Share2, label: 'マルチ', path: '/multi' },
      { id: 'sub', icon: Package, label: 'サブ', path: '/appSettings' },
    ];

    return (
      <View style={[styles.bottomNav, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.navItem}
            onPress={() => {
              SoundManager.play('decide');
              if (item.path !== '#') navigate(item.path);
            }}
          >
            <item.icon size={24} color={colors.primary} strokeWidth={1.5} />
            <Text style={[styles.navLabel, { color: colors.textSecondary }]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

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
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.examCard, { 
                backgroundColor: examCountdown.daysLeft <= 7 ? '#FFEBEE' : examCountdown.daysLeft <= 30 ? '#FFF3E0' : colors.primary + '15',
                borderColor: colors.border,
              }]}
              onPress={() => { SoundManager.play('decide'); navigate('/calendar'); }}
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

            </TouchableOpacity>
          )}

          {/* Header */}
          {renderHeader()}

          {/* モチベーションメッセージ */}
          {motivationalMessage && (
            <View style={[styles.motivationalContainer, { backgroundColor: colors.primary + '15', marginBottom: 12 }]}>
                <Lightbulb size={14} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.motivationalText, { color: colors.text, fontSize: fontSize.small }]} numberOfLines={3}>
                  {motivationalMessage}
                </Text>
            </View>
          )}

          {/* デスクトップ時1カラムレイアウト（右カラム削除） */}
          {screenType === 'desktop' ? (
            <View style={{ flexDirection: 'column' as const, gap: 0 }}>
              {renderStatsCard()}
              {renderWeakCard()}
              {/* メインアクション（解く） */}
              {renderMainActions()}
              {/* Main Actions */}
              {renderDailyQuests()}
            </View>
          ) : (
            <View style={mainContentStyle[screenType]}>
              {renderStatsCard()}
              {renderWeakCard()}
              {/* メインアクション（解く） */}
              {renderMainActions()}
              {/* Main Actions */}
              {renderDailyQuests()}
              {renderMobileInfoSections()}
            </View>
          )}

        </ScrollView>
    </PatternBackground>
    <BottomNavBar />
    </View>
  );
};

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
  topButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
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
  },
  currencyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
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
  iconButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageText: {
    fontWeight: 'bold',
  },
  levelText: {
    fontWeight: '600',
  },
  todayCard: { borderWidth: 1, borderRadius: 12, marginBottom: 12 },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  todayEmoji: { fontSize: 16 },
  todayLabel: { fontWeight: 'bold' },
  todayQuestion: { lineHeight: 20 },
  weakCard: { borderWidth: 1, borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  weakEmoji: { fontSize: 20 },
  weakLabel: { fontWeight: 'bold', marginBottom: 2 },
  weakDesc: {},
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
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
    borderRadius: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    color: '#666',
    marginTop: 4,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    paddingBottom: 20,
    borderTopWidth: 1,
    position: 'sticky' as any,
    bottom: 0,
    zIndex: 100,
    ...(Platform.OS !== 'web' && {
      position: 'absolute',
      left: 0,
      right: 0,
    }),
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  featureCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
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
  mobileSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  mobileQuestionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  mobileInfoValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  mobileAccuracyValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  mobileInfoSubtext: {
    fontSize: 12,
    marginTop: 4,
  },
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
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
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  dropdownItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '500',
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
    gap: 10,
    borderRadius: 16,
    paddingVertical: 26,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  mainPlayText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 20,
  },
  questCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
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
    paddingVertical: 6,
  },
  questText: {
    fontSize: 14,
    flex: 1,
  },
  questCount: {
    fontSize: 12,
    fontWeight: '500',
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
});

const HomeScreenWrapper = () => {
  return <HomeScreen />;
};

export default HomeScreenWrapper;
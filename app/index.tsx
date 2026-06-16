import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, StatusBar, Alert, Animated
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
import { Play, Plus, Music, Settings, Globe, Palette, Share2, User } from 'lucide-react';
import { AnimationLevel, createShakeAnimation, createPulseAnimation, bgDurationMap } from './animations';

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
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const [examDates, setExamDates] = useState<any[]>([]);
  const [examCountdown, setExamCountdown] = useState<{daysLeft: number, examName: string} | null>(null);
  const [quickReviewQuestions, setQuickReviewQuestions] = useState<any[]>([]);

  useEffect(() => {
    loadSettings();
    SoundManager.initialize();
    loadExamCountdown();
    loadQuickReviewQuestions();
    updateTimerDisplay();

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

  const loadQuickReviewQuestions = async () => {
    try {
      const stored = await AsyncStorage.getItem('quiz_questions');
      if (stored) {
        const allQuestions = JSON.parse(stored);
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
      const examDatesRaw = await AsyncStorage.getItem('EXAM_DATES');
      if (!examDatesRaw) return;
      
      const examDates: Array<{ date: string; name: string }> = JSON.parse(examDatesRaw);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let nextExam = null;
      for (const exam of examDates) {
        const examDate = new Date(exam.date);
        if (examDate >= today && (!nextExam || examDate < new Date(nextExam.date))) {
          nextExam = exam;
        }
      }
      
      if (nextExam) {
        const nextExamDate = new Date(nextExam.date);
        const daysLeft = Math.ceil((nextExamDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        setExamCountdown({ daysLeft, examName: nextExam.name });
      }
    } catch (e) {
      console.error('Failed to load exam countdown:', e);
    }
  };

  useEffect(() => {
    loadExamDates();
  }, []);

  useEffect(() => {
    checkAndShowMotivationalMessage();
  }, [examDates]);

  const loadExamDates = async () => {
    try {
      const saved = await AsyncStorage.getItem('EXAM_DATES');
      if (saved) {
        setExamDates(JSON.parse(saved));
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
        
        const currentCoins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
        await AsyncStorage.setItem('user_coins', (currentCoins + bonus).toString());
        await AsyncStorage.setItem('daily_login_bonus_date', today);
        await AsyncStorage.setItem('login_streak', streak.toString());
        
        // ボーナス通知（初回のみ）
        Alert.alert(
          currentLocale === 'ja' ? '📅 ログインボーナス' : '📅 Login Bonus',
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
      const savedQuestions = await AsyncStorage.getItem('quiz_questions');
      if (savedQuestions) {
        const questions = JSON.parse(savedQuestions);
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
    Alert.alert(
      t.selectTimer,
      '',
      [
        { text: '1min', onPress: () => saveTimer(1) },
        { text: '3min', onPress: () => saveTimer(3) },
        { text: '5min', onPress: () => saveTimer(5) },
        { text: '10min', onPress: () => saveTimer(10) },
        { text: t.cancel, style: 'cancel' }
      ]
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

  const renderStatsCard = () => (
    <View style={[styles.statsContainer, cardPadding[screenType], { backgroundColor: colors.card, borderRadius: cpR ?? 12 }]}>
      <View style={styles.statItem}>
        <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{totalQuestions}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.questionsCountLabel}</Text>
      </View>
      <View style={styles.statItem}>
        <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{displayTimer || `${timerMinutes}${t.minutes}`}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.timer}</Text>
      </View>
    </View>
  );

  const renderTodayQuestion = () => {
    if (!todayQuestion) return null;
    return (
      <TouchableOpacity
        style={[styles.todayCard, cardPadding[screenType], { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderRadius: cpR ?? 12, borderWidth: cpB ?? 1 }]}
        onPress={() => { SoundManager.play('decide'); navigate('/quiz'); }}
      >
        <View style={styles.todayHeader}>
          <Text style={styles.todayEmoji}>◧</Text>
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
        <Text style={styles.weakEmoji}>⚠</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.weakLabel, { color: colors.error, fontSize: fontSize.body }]}>
            {t.weakQuestionsQuiz}
          </Text>
          <Text style={[styles.weakDesc, { color: colors.textSecondary, fontSize: fontSize.small }]}>
            {locale === 'ja' ? `${weakQuestionCount}${t.reviewWeakQuestions}` : `${t.reviewWeakQuestions} (${weakQuestionCount})`}
          </Text>
        </View>
        <Text style={{ fontSize: 16, color: colors.error }}>›</Text>
      </TouchableOpacity>
    );
  };

  const renderMainButtons = () => (
    <View style={{ gap: buttonPadding[screenType].paddingVertical }}>
      {/* クイズ開始ボタン（Shakeアニメーション対応） */}
      {animationLevel !== 'none' ? (
        <Animated.View style={shakeAnim}>
          <TouchableOpacity
            style={[styles.primaryButton, buttonPadding[screenType], { backgroundColor: colors.primary, borderRadius: cpR ?? 12, borderWidth: cpB, borderColor: isCyberpunk ? colors.border : undefined }]}
            onPress={() => { SoundManager.play('decide'); navigate('/quiz'); }}
          >
            <Play size={screenType === 'desktop' ? 24 : 20} color={primaryTextColor} style={{ marginRight: 8 }} />
            <Text style={[styles.primaryButtonText, { color: primaryTextColor, fontSize: fs(screenType === 'desktop' ? 20 : 18) }]}>{t.startQuizButton}</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <TouchableOpacity
          style={[styles.primaryButton, buttonPadding[screenType], { backgroundColor: colors.primary, borderRadius: cpR ?? 12, borderWidth: cpB, borderColor: isCyberpunk ? colors.border : undefined }]}
          onPress={() => { SoundManager.play('decide'); navigate('/quiz'); }}
        >
          <Play size={screenType === 'desktop' ? 24 : 20} color={primaryTextColor} style={{ marginRight: 8 }} />
          <Text style={[styles.primaryButtonText, { color: primaryTextColor, fontSize: fs(screenType === 'desktop' ? 20 : 18) }]}>{t.startQuizButton}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.secondaryButton, buttonPadding[screenType], { borderColor: colors.primary, backgroundColor: colors.card, borderRadius: cpR ?? 12, borderWidth: cpB ?? 2 }]}
        onPress={() => { SoundManager.play('decide'); navigate('/create'); }}
      >
        <Plus size={screenType === 'desktop' ? 28 : 24} color={isCyberpunk ? '#E0E0E0' : colors.primary} style={{ marginRight: 8 }} />
        <Text style={[styles.secondaryButtonText, { color: isCyberpunk ? '#E0E0E0' : colors.primary, fontSize: fontSize.title }]}>{t.createQuestion}</Text>
      </TouchableOpacity>
    </View>
  );

  // セカンダリボタン行：予定登録 / タイマー / ミッション / 受信ボックス
  const renderSecondaryButtons = () => {
    const buttons = [
      { label: '予定登録', onPress: () => { SoundManager.play('decide'); navigate('/calendar'); } },
      { label: 'タイマー', onPress: () => { SoundManager.play('decide'); navigate('/manage'); } },
      { label: 'ミッション', onPress: () => { SoundManager.play('decide'); navigate('/missions'); } },
      { label: '受信', onPress: () => { SoundManager.play('decide'); navigate('/inbox'); } },
    ];
    // 英語の場合
    const labels = currentLocale === 'en' 
      ? ['Calendar', 'Timer', 'Missions', 'Inbox']
      : ['予定登録', 'タイマー', 'ミッション', '受信'];

    const secBtnBg = isCyberpunk ? colors.card : colors.background;

    return (
      <View style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'nowrap' as const,
        gap: screenType === 'desktop' ? 12 : 8,
        marginBottom: screenType === 'desktop' ? 20 : 12,
      }}>
        {buttons.map((btn, i) => {
          const btnContent = (
            <TouchableOpacity style={[styles.secondaryBtn, { 
              flex: 1,
              paddingVertical: buttonPadding[screenType].paddingVertical,
              paddingHorizontal: buttonPadding[screenType].paddingHorizontal,
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderRadius: cpR ?? 10,
              borderWidth: cpB ?? 1,
            }]} onPress={btn.onPress}>
              <Text style={{ fontSize: fontSize.body, color: isCyberpunk ? '#E0E0E0' : colors.text }}>{labels[i]}</Text>
            </TouchableOpacity>
          );
          // standard/rich でパルス効果
          if (pulseAnim && (i === 0 || i === 1)) {
            return <Animated.View key={i} style={{ flex: 1 }}>{btnContent}</Animated.View>;
          }
          return <React.Fragment key={i}>{btnContent}</React.Fragment>;
        })}
      </View>
    );
  };

  // フィーチャーカード：問題管理 + 週間目標
  const renderFeatureCards = () => (
    <View style={styles.featureCardsRow}>
      <TouchableOpacity
        style={[styles.featureCard, { flex: 1, backgroundColor: colors.primary + '10', borderColor: colors.border, borderRadius: cpR ?? 12, borderWidth: cpB ?? 1 }]}
        onPress={() => { SoundManager.play('decide'); navigate('/browse'); }}
      >
        <Text style={[styles.featureCardIcon, { fontSize: 24 }]}>📝</Text>
        <Text style={[styles.featureCardTitle, { color: colors.primary }]}>
          {locale === 'ja' ? '問題管理' : 'Manage'}
        </Text>
        <Text style={[styles.featureCardSubtitle, { color: colors.textSecondary }]}>
          {locale === 'ja' ? '一覧・編集' : 'View & Edit'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.featureCard, { flex: 1, backgroundColor: colors.primary + '10', borderColor: colors.border, borderRadius: cpR ?? 12, borderWidth: cpB ?? 1 }]}
        onPress={() => { SoundManager.play('decide'); navigate('/statistics'); }}
      >
        <Text style={[styles.featureCardIcon, { fontSize: 24 }]}>📊</Text>
        <Text style={[styles.featureCardTitle, { color: colors.primary }]}>
          {locale === 'ja' ? '週間目標' : 'Weekly Goal'}
        </Text>
        <View style={[styles.progressBarSmall, { backgroundColor: colors.border }]}>
          <View style={[styles.progressFill, { width: '68%', backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.featureCardSubtitle, { color: colors.textSecondary, marginTop: 4 }]}>
          68% {locale === 'ja' ? '達成中' : 'completed'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // ヘッダー
  const renderHeader = () => (
    <View style={[
      styles.header,
      screenType === 'desktop' && { 
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }
    ]}>
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.appTitle,
          {
            fontSize: screenType === 'desktop' ? 32 : screenType === 'tablet' ? 28 : 24,
            fontWeight: 'bold',
            color: colors.primary,
          }
        ]}>An-Q</Text>
        <Text style={[
          styles.appSubtitle,
          {
            fontSize: screenType === 'desktop' ? 13 : screenType === 'tablet' ? 12 : 11,
            color: colors.textSecondary,
            marginTop: 4,
          }
        ]}>
          {currentLocale === 'ja' ? '覚えるな、脳にインストールせよ' : "Don't memorize, install into your brain"}
        </Text>
      </View>

      {/* 右側：アイコンボタン */}
      <View style={[
        styles.topButtons,
        screenType === 'desktop' && { gap: 12 }
      ]}>
        {/* マルチボタン */}
        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: isCyberpunk ? 0 : (screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18),
          borderColor: colors.primary,
          borderWidth: cpB ?? 1,
        }]} onPress={() => { SoundManager.play('decide'); navigate('/multi'); }} label={t.multiShare || 'Multi Share'}>
          <Share2 size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
        </TooltipButton>

        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: isCyberpunk ? 0 : (screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18),
          borderColor: colors.primary,
          borderWidth: cpB ?? 1,
        }]} onPress={() => { SoundManager.play('decide'); navigate('/settings'); }} label={t.themeSetting}>
          <Palette size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
        </TooltipButton>

        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: isCyberpunk ? 0 : (screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18),
          borderColor: colors.primary,
          borderWidth: cpB ?? 1,
        }]} onPress={toggleLanguage} label={t.language}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={screenType === 'desktop' ? 14 : 12} color={colors.primary} />
            <Text style={[styles.languageText, { color: colors.primary, fontSize: screenType === 'desktop' ? 10 : 9, marginTop: 1 }]}>
              {currentLocale === 'ja' ? 'JP' : 'EN'}
            </Text>
          </View>
        </TooltipButton>

        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: isCyberpunk ? 0 : (screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18),
          borderColor: colors.primary,
          borderWidth: cpB ?? 1,
        }]} onPress={() => { SoundManager.play('decide'); navigate('/music'); }} label={t.musicSettings}>
          <Music size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
        </TooltipButton>

        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: isCyberpunk ? 0 : (screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18),
          borderColor: colors.primary,
          borderWidth: cpB ?? 1,
        }]} onPress={() => { SoundManager.play('decide'); navigate('/appSettings'); }} label={t.appSettings}>
          <Settings size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
        </TooltipButton>
      </View>
    </View>
  );

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
            <Text style={[styles.mobileSectionLabel, { color: colors.primary }]}>◧ {t.todayQuestion}</Text>
            <Text style={[styles.mobileQuestionText, { color: colors.text, marginTop: 8 }]}>
              {todayQuestion.question}
            </Text>
          </TouchableOpacity>
        )}

        {/* 今週の正答率（本日の学習時間削除） */}
        <View style={[styles.infoCard, { padding: 14, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.mobileSectionLabel, { color: colors.primary }]}>📈 {locale === 'ja' ? '今週の正答率' : 'Weekly Accuracy'}</Text>
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <PatternBackground pattern={pattern} color={colors.primary} style={{ backgroundColor: 'transparent' }}>
        <ScrollView 
          style={{ backgroundColor: 'transparent' }}
          contentContainerStyle={[
            styles.content, 
            containerStyles[screenType],
            { 
              flexGrow: 1, 
              paddingBottom: 40,
              backgroundColor: colors.background,
            }
          ]}
        >
          <StatusBar barStyle="light-content" />
          
          {/* 試験カウントダウン */}
          {examCountdown && (
            <View style={[styles.examCountdownBox, {
              backgroundColor: examCountdown.daysLeft <= 7 ? '#FFEBEE' : examCountdown.daysLeft <= 30 ? '#FFF3E0' : colors.primary + '15',
              borderColor: colors.border,
            }]}>
              <Text style={[styles.examCountdownTitle, { color: examCountdown.daysLeft <= 7 ? '#D32F2F' : examCountdown.daysLeft <= 30 ? '#F57C00' : colors.primary }]}>
                {examCountdown.examName}
              </Text>
              <Text style={[styles.examCountdownDays, {
                color: examCountdown.daysLeft <= 7 ? '#D32F2F' : examCountdown.daysLeft <= 30 ? '#F57C00' : colors.primary,
                fontSize: fs(28),
                fontWeight: 'bold',
              }]}>
                {locale === 'ja' ? `${examCountdown.examName} まであと ${examCountdown.daysLeft} 日` : `${examCountdown.daysLeft} days until ${examCountdown.examName}`}
              </Text>
            </View>
          )}

          {/* Header */}
          {renderHeader()}

          {/* モチベーションメッセージ */}
          {motivationalMessage && (
            <View style={[styles.motivationalContainer, { backgroundColor: colors.primary + '15', marginBottom: 12 }]}>
              <Text style={{ fontSize: 14, color: colors.primary, marginRight: 6 }}>💡</Text>
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
              {renderMainButtons()}
              {renderSecondaryButtons()}
              {renderFeatureCards()}
            </View>
          ) : (
            <View style={mainContentStyle[screenType]}>
              {renderStatsCard()}
              {renderWeakCard()}
              {renderMainButtons()}
              {renderSecondaryButtons()}
              {renderFeatureCards()}
              {renderMobileInfoSections()}
            </View>
          )}

        </ScrollView>
    </PatternBackground>
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
  iconButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageText: {
    fontWeight: 'bold',
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
  examCountdownBox: {
    marginHorizontal: 0,
    marginVertical: 12,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)'
  },
  examCountdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  examCountdownDays: {
    fontSize: 20,
    fontWeight: 'bold'
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
});

export default HomeScreen;
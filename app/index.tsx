import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, StatusBar, Alert
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
import { Play, Plus, BarChart3, Music, Calendar, Settings, Globe, ScrollText, Award, ShoppingBag, Timer, Palette, Repeat2 } from 'lucide-react';

// === 修正1: レスポンシブ判定用フック ===
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
  const { colors, fs, pattern, onPrimary } = useTheme();
  const locale = useLocale();
  const [currentLocale, setCurrentLocale] = useState<'ja' | 'en'>(locale);
  const screenType = useResponsive();

  // === 修正2: デバイス別コンテナスタイル ===
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

  // === 修正5: カード・ボタンサイズ ===
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

  // 言語変更を監視
  useEffect(() => {
    const checkLanguage = async () => {
      const saved = await AsyncStorage.getItem('user_language');
      if (saved === 'ja' || saved === 'en') {
        setCurrentLocale(saved);
      }
    };
    checkLanguage();
    
    const interval = setInterval(checkLanguage, 100);
    return () => clearInterval(interval);
  }, []);
  const t = translations[currentLocale];

  const toggleLanguage = async () => {
    const newLocale = currentLocale === 'ja' ? 'en' : 'ja';
    setCurrentLocale(newLocale);
    try {
      await AsyncStorage.setItem('user_language', newLocale);
      SoundManager.play('decide');
    } catch (error) {
      console.error('Failed to save language:', error);
    }
  };

  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [todayQuestion, setTodayQuestion] = useState<any | null>(null);
  const [weakQuestionCount, setWeakQuestionCount] = useState(0);
  const [motivationalMessage, setMotivationalMessage] = useState('');
  const [examDates, setExamDates] = useState<any[]>([]);
  const [examCountdown, setExamCountdown] = useState<{daysLeft: number, examName: string} | null>(null);
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [cardOrder, setCardOrder] = useState<string[]>(['browse', 'music', 'calendar']);
  const [navMode, setNavMode] = useState<'compact' | 'bigGrid'>('compact');
  const [reorderSelection, setReorderSelection] = useState<string[]>([]);
  const [reorderMode, setReorderMode] = useState(false);
  // 右上ボタンの順序（コンパクトモード用）
  const [buttonOrder, setButtonOrder] = useState<string[]>([
    'calendar', 'mission', 'title', 'shop', 'manage', 'themeSettings',
  ]);

  useEffect(() => {
    loadSettings();
    SoundManager.initialize();
    loadExamCountdown();
  }, []);

  const loadExamCountdown = async () => {
    try {
      const examDatesRaw = await AsyncStorage.getItem('EXAM_DATES');
      if (!examDatesRaw) return;
      
      const examDates: Array<{ date: string; name: string }> = JSON.parse(examDatesRaw);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Find the next exam date
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

    // Find the nearest upcoming exam date
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

      // Show motivational message if exam is within 7 days
      if (daysUntil <= 7) {
        const messages = locale === 'ja' ? [
          // 日本の偉人・著名人
          '「諦めたらそこで試合終了ですよ」— 安西先生（スラムダンク）',
          '「努力した者が全て報われるとは限らん。しかし、成功した者は皆すべからく努力しておる」— 安西先生',
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

  const loadSettings = async () => {
    try {
      // Load questions
      const savedQuestions = await AsyncStorage.getItem('quiz_questions');
      if (savedQuestions) {
        const questions = JSON.parse(savedQuestions);
        setTotalQuestions(questions.length);
        // 今日の1問（日付をシードにしてランダム選択）
        if (questions.length > 0) {
          const today = new Date();
          const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
          const idx = seed % questions.length;
          setTodayQuestion(questions[idx]);
        }
        // 苦手問題数（mistakeCount > 0）
        const weak = questions.filter((q: any) => (q.mistakeCount ?? 0) > 0);
        setWeakQuestionCount(weak.length);
      }

      // Load timer setting with migration from old keys
      await loadTimerSetting();

      // Load layout settings
      const savedLayout = await AsyncStorage.getItem('home_layout_mode');
      if (savedLayout === 'grid' || savedLayout === 'list') setLayoutMode(savedLayout);
      const savedOrder = await AsyncStorage.getItem('home_card_order');
      if (savedOrder) setCardOrder(JSON.parse(savedOrder));
      const savedNavMode = await AsyncStorage.getItem('home_nav_mode');
      if (savedNavMode === 'compact' || savedNavMode === 'bigGrid') setNavMode(savedNavMode);
      const savedButtonOrder = await AsyncStorage.getItem('home_button_order');
      if (savedButtonOrder) setButtonOrder(JSON.parse(savedButtonOrder));
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const loadTimerSetting = async () => {
    try {
      // 1. 'APP_TIMER_SETTING' キーで保存された値を優先的に読み込む
      let timerValue = await AsyncStorage.getItem('APP_TIMER_SETTING');
      let storedMinutes = timerValue ? parseInt(timerValue, 10) : null;

      // 2. 値が存在しない場合、古いキーをチェックして移行する
      if (storedMinutes === null) {
        const oldTimerValue = await AsyncStorage.getItem('timerSetting');
        if (oldTimerValue !== null) {
          storedMinutes = parseInt(oldTimerValue, 10);
          // 古いキーの値を新しいキーにコピー
          await AsyncStorage.setItem('APP_TIMER_SETTING', storedMinutes.toString());
          // 古いキーは削除
          await AsyncStorage.removeItem('timerSetting');
          console.log(`Migrated timer setting from 'timerSetting' to 'APP_TIMER_SETTING': ${storedMinutes}`);
        }
      }

      // 3. 最終的に有効な分数を設定する（デフォルトは5分）
      const finalMinutes = (storedMinutes !== null && !isNaN(storedMinutes)) ? storedMinutes : 5;
      setTimerMinutes(finalMinutes);
    } catch (error) {
      console.error('Failed to load timer setting:', error);
      setTimerMinutes(5); // エラー時はデフォルト値に設定
    }
  };

  const showTimerAlert = () => {
    SoundManager.play('decide');
    Alert.alert(
      t.selectTimer,
      '',
      [
        {
          text: '1min',
          onPress: () => saveTimer(1)
        },
        {
          text: '3min',
          onPress: () => saveTimer(3)
        },
        {
          text: '5min',
          onPress: () => saveTimer(5)
        },
        {
          text: '10min',
          onPress: () => saveTimer(10)
        },
        {
          text: t.cancel,
          style: 'cancel'
        }
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

  const toggleLayoutMode = async () => {
    const next = layoutMode === 'grid' ? 'list' : 'grid';
    setLayoutMode(next);
    await AsyncStorage.setItem('home_layout_mode', next);
    SoundManager.play('select');
  };

  const toggleNavMode = async () => {
    const next = navMode === 'compact' ? 'bigGrid' : 'compact';
    setNavMode(next);
    setReorderSelection([]);
    setReorderMode(false);
    await AsyncStorage.setItem('home_nav_mode', next);
    SoundManager.play('select');
  };

  // ボタン配置換えモード開始/タップ処理
  const startReorderMode = () => {
    setReorderMode(true);
    setReorderSelection([]);
    SoundManager.play('select');
  };

  const handleReorderTap = (key: string) => {
    if (!reorderMode) return;
    const allKeys = navMode === 'compact'
      ? buttonOrder
      : ['calendar', 'mission', 'title', 'shop', 'manage', 'themeSettings'];

    const newSel = reorderSelection.includes(key)
      ? reorderSelection.filter(k => k !== key)
      : [...reorderSelection, key];
    setReorderSelection(newSel);

    if (newSel.length === allKeys.length) {
      // 全選択完了 → 確認画面へ
      const before = navMode === 'compact' ? buttonOrder : cardOrder.filter(k => k in { calendar: 1, mission: 1, title: 1, shop: 1, manage: 1, themeSettings: 1 });
      navigate(`/reorderConfirm?before=${encodeURIComponent(JSON.stringify(before.length ? before : allKeys))}&after=${encodeURIComponent(JSON.stringify(newSel))}&mode=${navMode}&locale=${locale}`);
      setReorderMode(false);
      setReorderSelection([]);
    }
  };

  const cancelReorderMode = () => {
    setReorderMode(false);
    setReorderSelection([]);
    SoundManager.play('decide');
  };

  const moveCard = async (index: number, direction: 'up' | 'down') => {
    const newOrder = [...cardOrder];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newOrder.length) return;
    [newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]];
    setCardOrder(newOrder);
    await AsyncStorage.setItem('home_card_order', JSON.stringify(newOrder));
    SoundManager.play('select');
  };

  // === 修正4: メインコンテンツスタイル ===
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

  // === 修正10: ホバー状態（PCのみ） ===
  const [hovered, setHovered] = useState(false);
  const hoverProps = screenType === 'desktop' ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};

  // ナビゲーションカードの固定カード定義
  const fixedCards = [
    { key: 'browse', icon: 'barChart', iconBg: colors.primary + '20',   iconColor: colors.primary,   route: '/browse', titleKey: 'manageQuestions' as keyof typeof t, descKey: 'learningDesc' as keyof typeof t },
    { key: 'music',  icon: 'music', iconBg: colors.secondary + '30', iconColor: colors.secondary, route: '/music',  titleKey: 'musicSettings'   as keyof typeof t, descKey: 'musicDesc'     as keyof typeof t },
  ];

  const defaultExtraOrder = ['calendar', 'mission', 'title', 'shop', 'manage', 'themeSettings'];
  const extraDefs: Record<string, { icon: React.ReactNode; label: string; route: string }> = {
    calendar:      { icon: <Calendar size={26} color={colors.primary} />,                     label: t.calendar,       route: '/calendar' },
    mission:       { icon: <ScrollText size={26} color={colors.primary} />,                  label: t.mission,        route: '/mission' },
    title:         { icon: <Award size={26} color={colors.primary} />,                       label: t.titleLabel,     route: '/title' },
    shop:          { icon: <ShoppingBag size={26} color={colors.primary} />,                 label: t.shop,           route: '/shop' },
    manage:        { icon: <Timer size={26} color={colors.primary} />,                       label: t.timerSettings,  route: '/manage' },
    themeSettings: { icon: <Palette size={26} color={colors.primary} />,                     label: t.themeSetting,    route: '/settings' },
  };

  const renderStatsCard = () => (
    <View style={[styles.statsContainer, cardPadding[screenType], { backgroundColor: colors.card }]}>
      <View style={styles.statItem}>
        <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{totalQuestions}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.questionsCountLabel}</Text>
      </View>
      <View style={styles.statItem}>
        <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{timerMinutes}{t.minutes}</Text>
        <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.timer}</Text>
      </View>
    </View>
  );

  const renderTodayQuestion = () => {
    if (!todayQuestion) return null;
    return (
      <TouchableOpacity
        style={[styles.todayCard, cardPadding[screenType], { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
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
        style={[styles.weakCard, cardPadding[screenType], { backgroundColor: colors.error + '15', borderColor: colors.error }]}
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
      <TouchableOpacity
        style={[styles.primaryButton, buttonPadding[screenType], { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); navigate('/quiz'); }}
        {...(screenType === 'desktop' ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) } : {})}
      >
        <Play size={screenType === 'desktop' ? 24 : 20} color={onPrimary} style={{ marginRight: 8 }} />
        <Text style={[styles.primaryButtonText, { color: onPrimary, fontSize: fs(screenType === 'desktop' ? 20 : 18) }]}>{t.startQuizButton}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.secondaryButton, buttonPadding[screenType], { borderColor: colors.primary, backgroundColor: colors.card }]}
        onPress={() => { SoundManager.play('decide'); navigate('/create'); }}
      >
        <Plus size={screenType === 'desktop' ? 28 : 24} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={[styles.secondaryButtonText, { color: colors.primary, fontSize: fontSize.title }]}>{t.createQuestion}</Text>
      </TouchableOpacity>
    </View>
  );

  // === 修正6: セカンダリボタン行 ===
  const renderSecondaryButtons = () => (
    <View style={{
      display: 'flex',
      flexDirection: 'row',
      flexWrap: 'nowrap' as const,
      gap: screenType === 'desktop' ? 12 : 8,
      marginBottom: screenType === 'desktop' ? 20 : 12,
    }}>
      <TouchableOpacity style={[styles.secondaryBtn, { 
        flex: 1,
        paddingVertical: buttonPadding[screenType].paddingVertical,
        paddingHorizontal: buttonPadding[screenType].paddingHorizontal,
        backgroundColor: colors.card,
        borderColor: colors.border,
      }]} onPress={() => { SoundManager.play('decide'); navigate('/create'); }}>
        <Text style={{ fontSize: fontSize.body, color: colors.text }}>{t.createQuestion}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryBtn, { 
        flex: 1,
        paddingVertical: buttonPadding[screenType].paddingVertical,
        paddingHorizontal: buttonPadding[screenType].paddingHorizontal,
        backgroundColor: colors.card,
        borderColor: colors.border,
      }]} onPress={() => { SoundManager.play('decide'); navigate('/browse'); }}>
        <Text style={{ fontSize: fontSize.body, color: colors.text }}>{t.manageQuestions}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondaryBtn, { 
        flex: 1,
        paddingVertical: buttonPadding[screenType].paddingVertical,
        paddingHorizontal: buttonPadding[screenType].paddingHorizontal,
        backgroundColor: colors.card,
        borderColor: colors.border,
      }]} onPress={() => { SoundManager.play('decide'); navigate('/results'); }}>
        <Text style={{ fontSize: fontSize.body, color: colors.text }}>{t.viewResults}</Text>
      </TouchableOpacity>
    </View>
  );

  // === 修正8: ナビゲーションリンク（PC時非表示） ===
  const renderNavLinks = () => {
    if (screenType === 'desktop') return null;
    return (
      <View style={{ gap: 8, marginTop: 12 }}>
        <TouchableOpacity style={styles.linkButton} onPress={() => { SoundManager.play('decide'); navigate('/credits'); }}>
          <Text style={{ color: colors.primary, fontSize: fontSize.body }}>{t.aboutApp}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkButton} onPress={() => { SoundManager.play('decide'); navigate('/feedback'); }}>
          <Text style={{ color: colors.primary, fontSize: fontSize.body }}>{t.submitFeedback}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ナビゲーションカードセクション（既存のコードを統合）
  const renderNavigationCards = () => {
    const extraOrder: string[] = (cardOrder.filter(k => k in extraDefs).length === Object.keys(extraDefs).length)
      ? cardOrder.filter(k => k in extraDefs)
      : defaultExtraOrder;
    const orderedExtra = extraOrder.map(k => ({ key: k, ...extraDefs[k] }));

    if (navMode === 'bigGrid') {
      return (
        <View>
          <View style={styles.grid}>
            {fixedCards.map(card => {
              const IconComponent = card.icon === 'barChart' ? BarChart3 : Music;
              return (
                <TouchableOpacity key={card.key} style={[styles.navCard, { backgroundColor: colors.card }]} onPress={() => { SoundManager.play('decide'); navigate(card.route); }}>
                  <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
                    <IconComponent size={28} color={card.iconColor} />
                  </View>
                  <Text style={[styles.navTitle, { color: colors.text, fontSize: fontSize.title }]}>{t[card.titleKey]}</Text>
                  <Text style={[styles.navDesc, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t[card.descKey]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.reorderHint, { color: colors.textSecondary, marginTop: 16, marginBottom: 6 }]}>
            {reorderMode
              ? (`${reorderSelection.length}/${orderedExtra.length} ${t.reorderModeActive}`)
              : (t.moreFeatures)}
          </Text>
          <View style={styles.bigGrid}>
            {orderedExtra.map(btn => {
              const selIdx = reorderSelection.indexOf(btn.key);
              const isSelected = selIdx !== -1;
              return (
                <TouchableOpacity
                  key={btn.key}
                  style={[styles.bigCard, {
                    backgroundColor: isSelected ? colors.primary + '20' : colors.card,
                    borderColor: isSelected ? colors.primary : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  }]}
                  onPress={() => {
                    if (reorderMode) {
                      handleReorderTap(btn.key);
                    } else {
                      SoundManager.play('decide');
                      navigate(btn.route);
                    }
                  }}
                >
                  {isSelected && (
                    <View style={[styles.selBadge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.selBadgeText, { color: onPrimary }]}>{selIdx + 1}</Text>
                    </View>
                  )}
                  <View style={[styles.bigCardIcon, { backgroundColor: colors.primary + '20' }]}>
                    {btn.icon}
                  </View>
                  <Text style={[styles.bigCardTitle, { color: colors.text, fontSize: fontSize.body }]}>
                    {btn.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    // compact mode
    return (
      <View style={styles.fixedCardRow}>
        {fixedCards.map(card => {
          const IconComponent = card.icon === 'barChart' ? BarChart3 : Music;
          return (
            <TouchableOpacity key={card.key} style={[styles.fixedCard, { backgroundColor: colors.card }]} onPress={() => { SoundManager.play('decide'); navigate(card.route); }}>
              <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
                <IconComponent size={28} color={card.iconColor} />
              </View>
              <Text style={[styles.navTitle, { color: colors.text, fontSize: fontSize.title }]}>{t[card.titleKey]}</Text>
              <Text style={[styles.navDesc, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t[card.descKey]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // === 共通のheaderとtopButtons（修正3） ===
  const renderHeader = () => (
    <View style={[
      styles.header,
      screenType === 'desktop' && { 
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }
    ]}>
      {/* 左側：タイトル */}
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.appTitle,
          {
            fontSize: screenType === 'desktop' ? 32 : screenType === 'tablet' ? 28 : 24,
            fontWeight: 'bold',
            color: colors.primary,
          }
        ]}>
          An-Q
        </Text>
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
        {navMode === 'compact' && !reorderMode && (
          <>
            {buttonOrder.map(key => {
              const btnDef: Record<string, { icon: React.ReactNode; label: string; route: string }> = {
                calendar:      { icon: <Calendar size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />,                     label: t.calendar,       route: '/calendar' },
                mission:       { icon: <ScrollText size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />,                  label: t.mission,        route: '/mission' },
                title:         { icon: <Award size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />,                       label: t.titleLabel,     route: '/title' },
                shop:          { icon: <ShoppingBag size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />,                 label: t.shop,           route: '/shop' },
                manage:        { icon: <Timer size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />,                       label: t.timerSettings,  route: '/manage' },
                themeSettings: { icon: <Palette size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />,                     label: t.themeSetting,    route: '/settings' },
              };
              const def = btnDef[key];
              if (!def) return null;
              return (
                <TooltipButton key={key} style={[styles.iconButton, { 
                  width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
                  height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
                  borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
                  borderColor: colors.primary 
                }]} onPress={() => { SoundManager.play('decide'); navigate(def.route); }} label={def.label}>
                  {def.icon}
                </TooltipButton>
              );
            })}
          </>
        )}
        {navMode === 'compact' && reorderMode && (
          <>
            {buttonOrder.map(key => {
              const iconMap: Record<string, string> = {
                calendar: '◧', mission: '◰',
                title: '◱', shop: '◲',
                manage: '◳', themeSettings: '◴',
              };
              const selIdx = reorderSelection.indexOf(key);
              return (
                <TouchableOpacity key={key} style={[styles.iconButton, { 
                  width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
                  height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
                  borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
                  borderColor: selIdx >= 0 ? colors.primary : colors.border, backgroundColor: selIdx >= 0 ? colors.primary + '20' : 'transparent' 
                }]} onPress={() => handleReorderTap(key)}>
                  {selIdx >= 0
                    ? <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 13 }}>{selIdx + 1}</Text>
                    : <Text style={{ fontSize: 16, color: colors.textSecondary }}>{iconMap[key]}</Text>}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.iconButton, { 
              width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
              height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
              borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
              borderColor: colors.error 
            }]} onPress={cancelReorderMode}>
              <Text style={{ fontSize: 16, color: colors.error }}>✕</Text>
            </TouchableOpacity>
          </>
        )}
        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
          borderColor: colors.primary 
        }]} onPress={toggleNavMode} label={t.navModeToggle}>
          <Repeat2 size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
        </TooltipButton>
        <TooltipButton style={[styles.iconButton, { 
          width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
          borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
          borderColor: reorderMode ? colors.warning : colors.primary 
        }]} onPress={reorderMode ? cancelReorderMode : startReorderMode} label={t.reorderButtons}>
          <Text style={{ fontSize: 16, color: reorderMode ? colors.warning : colors.primary }}>⇄</Text>
        </TooltipButton>
        <TooltipButton
          style={[styles.iconButton, { 
            width: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
            height: screenType === 'desktop' ? 48 : screenType === 'tablet' ? 42 : 36,
            borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
            borderColor: colors.primary 
          }]}
          onPress={toggleLanguage}
          label={t.language}
        >
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
          borderRadius: screenType === 'desktop' ? 24 : screenType === 'tablet' ? 21 : 18,
          borderColor: colors.primary 
        }]} onPress={() => { SoundManager.play('decide'); navigate('/appSettings'); }} label={t.settings}>
          <Settings size={screenType === 'desktop' ? 20 : screenType === 'tablet' ? 18 : 16} color={colors.primary} />
        </TooltipButton>
      </View>
    </View>
  );

  return (
    <PatternBackground pattern={pattern} color={colors.primary} style={{ backgroundColor: colors.background }}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, containerStyles[screenType]]}>
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

      {/* === 修正4: デスクトップ時2カラムレイアウト === */}
      {screenType === 'desktop' ? (
        <View style={mainContentStyle.desktop}>
          {/* 左カラム */}
          <View style={leftColumnStyle.desktop}>
            {renderStatsCard()}
            {renderWeakCard()}
            {renderMainButtons()}
            {renderSecondaryButtons()}
            {renderNavigationCards()}
          </View>

          {/* 右カラム */}
          <View style={rightColumnStyle.desktop}>
            {/* スタッツ（縦積み） */}
            <View style={{ gap: 12 }}>
              <View style={[styles.statBlock, { backgroundColor: colors.card, ...cardPadding.desktop }]}>
                <Text style={[styles.statBlockNumber, { color: colors.primary, fontSize: fs(28) }]}>{totalQuestions}</Text>
                <Text style={[styles.statBlockLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.questionsCountLabel}</Text>
              </View>
              <View style={[styles.statBlock, { backgroundColor: colors.card, ...cardPadding.desktop }]}>
                <Text style={[styles.statBlockNumber, { color: colors.error, fontSize: fs(28) }]}>{weakQuestionCount}</Text>
                <Text style={[styles.statBlockLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.weakQuestionsQuiz}</Text>
              </View>
              <View style={[styles.statBlock, { backgroundColor: colors.card, ...cardPadding.desktop }]}>
                <Text style={[styles.statBlockNumber, { color: colors.primary, fontSize: fs(28) }]}>{timerMinutes}{t.minutes}</Text>
                <Text style={[styles.statBlockLabel, { color: colors.textSecondary, fontSize: fontSize.small }]}>{t.timer}</Text>
              </View>
            </View>
            
            {/* 今日の1問 */}
            <View style={{ marginTop: 16 }}>
              {renderTodayQuestion()}
            </View>
          </View>
        </View>
      ) : (
        <View style={mainContentStyle[screenType]}>
          {/* モバイル・タブレット：1列で順番に並ぶ */}
          {renderStatsCard()}
          {todayQuestion && (
            <TouchableOpacity
              style={[styles.todayCard, cardPadding[screenType], { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
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
          )}
          {renderWeakCard()}
          {renderMainButtons()}
          {renderSecondaryButtons()}
          {renderNavigationCards()}
          {renderNavLinks()}
        </View>
      )}

    </ScrollView>
    </PatternBackground>
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
  },
  topButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  timerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageText: {
    fontWeight: 'bold',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  headerContent: {
    flex: 1,
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
  mainActions: {
    marginBottom: 30,
    gap: 15,
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
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  fixedCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fixedCard: {
    flex: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  navCard: {
    width: '47%',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconSimple: {
    fontSize: 22,
    fontWeight: '300',
    textAlign: 'center',
  },
  navTitle: {
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  navDesc: {
    color: '#666',
    textAlign: 'center',
  },
  listContainer: {
    gap: 10,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  listCardText: {
    flex: 1,
  },
  orderButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  orderBtn: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 4,
  },
  bigGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  bigCard: {
    width: '47%',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  bigCardIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bigCardTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  bigCardDesc: {
    textAlign: 'center',
  },
  selBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  reorderHint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkButton: {
    paddingVertical: 10,
    alignItems: 'center',
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
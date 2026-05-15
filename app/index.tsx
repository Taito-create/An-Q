import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, StatusBar, Alert, Image
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import TooltipButton from './tooltipButton';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import PatternBackground from './patternBackground';
import { Platform } from 'react-native';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { responsive, getDeviceType } from './responsive';
import { checkAccountExists } from './utils/authStorage';

const HomeScreen = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const hasAccount = await checkAccountExists();
        setIsAuthenticated(hasAccount);
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // ログイン画面が必要な場合は表示
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>読み込み中...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>ログインが必要です</Text>
      </View>
    );
  }

  const scrollViewRef = useRef<ScrollView>(null);
  const { colors, fs, pattern, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const toggleLanguage = () => {
    const newLocale = locale === 'ja' ? 'en' : 'ja';
    AsyncStorage.setItem('user_language', newLocale);
    // Force reload to apply new language
    router.replace('/');
  };

  const handleIconPress = () => {
    try {
      // ホーム画面の最上部にスクロール
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      
      // 効果音を再生
      SoundManager.play('decide');
    } catch (error) {
      console.error('Icon press error:', error);
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
    
    // アプリ起動時にBGMを再生
    setTimeout(async () => {
      await SoundManager.initialize();
      SoundManager.playBGM();
    }, 1500); // 1.5秒後にBGM開始
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

      // Load timer setting - use APP_TIMER_SETTING
      const appTimerSetting = await AsyncStorage.getItem('APP_TIMER_SETTING');
      
      if (appTimerSetting && appTimerSetting !== 'null' && appTimerSetting !== null) {
        setTimerMinutes(parseInt(appTimerSetting));
      } else {
        setTimerMinutes(5);
      }

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
      router.push({
        pathname: '/reorderConfirm',
        params: {
          before: JSON.stringify(before.length ? before : allKeys),
          after: JSON.stringify(newSel),
          mode: navMode,
          locale,
        },
      });
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

  return (
    <PatternBackground pattern={pattern} color={colors.primary} style={{ backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
      >
        <StatusBar barStyle="light-content" />
        
        {/* Header */}
      <View style={[styles.header, Platform.OS !== 'web' && styles.headerMobile]}>
        <View style={styles.headerContent}>
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
          {/* タイトルと名言を横並び */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text, fontSize: fs(28) }]}>{t.appTitle}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fs(14) }]}>{t.subtitle}</Text>
            </View>
            {motivationalMessage && (
              <View style={[styles.motivationalContainer, { backgroundColor: colors.primary + '15', flex: 1.2 }]}>
                <Ionicons name="bulb" size={14} color={colors.primary} style={styles.bulbIcon} />
                <Text style={[styles.motivationalText, { color: colors.text, fontSize: fs(11) }]} numberOfLines={3}>
                  {motivationalMessage}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Top Buttons */}
        <View style={[styles.topButtons, Platform.OS !== 'web' && styles.topButtonsMobile]}>
          {navMode === 'compact' && !reorderMode && (
            <>
              {buttonOrder.map(key => {
                const btnDef: Record<string, { icon: string; label: string; route: string }> = {
                  calendar:      { icon: 'calendar-outline',      label: t.calendar,       route: '/calendar' },
                  mission:       { icon: 'clipboard-outline',     label: t.mission,        route: '/mission' },
                  title:         { icon: 'ribbon-outline',        label: t.titleLabel,     route: '/title' },
                  shop:          { icon: 'storefront-outline',    label: t.shop,           route: '/shop' },
                  manage:        { icon: 'timer-outline',         label: t.timerSettings,  route: '/manage' },
                  themeSettings: { icon: 'color-palette-outline', label: t.themeSetting,    route: '/settings' },
                };
                const def = btnDef[key];
                if (!def) return null;
                return (
                  <TooltipButton key={key} style={[styles.iconButton, { borderColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); router.push(def.route as any); }} label={def.label}>
                    <Ionicons name={def.icon as any} size={16} color={colors.primary} />
                  </TooltipButton>
                );
              })}
            </>
          )}
          {navMode === 'compact' && reorderMode && (
            <>
              {buttonOrder.map(key => {
                const iconMap: Record<string, string> = {
                  calendar: 'calendar-outline', mission: 'clipboard-outline',
                  title: 'ribbon-outline', shop: 'storefront-outline',
                  manage: 'timer-outline', themeSettings: 'color-palette-outline',
                };
                const selIdx = reorderSelection.indexOf(key);
                return (
                  <TouchableOpacity key={key} style={[styles.iconButton, { borderColor: selIdx >= 0 ? colors.primary : colors.border, backgroundColor: selIdx >= 0 ? colors.primary + '20' : 'transparent' }]} onPress={() => handleReorderTap(key)}>
                    {selIdx >= 0
                      ? <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 13 }}>{selIdx + 1}</Text>
                      : <Ionicons name={iconMap[key] as any} size={16} color={colors.textSecondary} />}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={[styles.iconButton, { borderColor: colors.error }]} onPress={cancelReorderMode}>
                <Ionicons name="close-outline" size={16} color={colors.error} />
              </TouchableOpacity>
            </>
          )}
          <TooltipButton style={[styles.iconButton, { borderColor: colors.primary }]} onPress={toggleNavMode} label={t.navModeToggle}>
            <Ionicons name={navMode === 'compact' ? 'apps-outline' : 'menu-outline'} size={16} color={colors.primary} />
          </TooltipButton>
          <TooltipButton style={[styles.iconButton, { borderColor: reorderMode ? colors.warning : colors.primary }]} onPress={reorderMode ? cancelReorderMode : startReorderMode} label={t.reorderButtons}>
            <Ionicons name="swap-horizontal-outline" size={16} color={reorderMode ? colors.warning : colors.primary} />
          </TooltipButton>
          <TooltipButton style={[styles.languageButton, { borderColor: colors.primary }]} onPress={toggleLanguage} label={t.language}>
            <Ionicons name="language-outline" size={16} color={colors.primary} />
            <Text style={[styles.languageText, { color: colors.primary }]}>{locale === 'ja' ? 'JP' : 'EN'}</Text>
          </TooltipButton>
          <TooltipButton style={[styles.iconButton, { borderColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); router.push('/appSettings'); }} label={t.settings}>
            <Ionicons name="settings-outline" size={16} color={colors.primary} />
          </TooltipButton>
        </View>
      </View>

      {/* Stats */}
      <View style={[styles.statsContainer, { backgroundColor: colors.card }]}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{totalQuestions}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fs(12) }]}>{t.questionsCountLabel}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: colors.primary, fontSize: fs(24) }]}>{timerMinutes}{t.minutes}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary, fontSize: fs(12) }]}>{t.timer}</Text>
        </View>
      </View>

      {/* 今日の1問 */}
      {todayQuestion && (
        <TouchableOpacity
          style={[styles.todayCard, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}
          onPress={() => { SoundManager.play('decide'); router.push('/quiz'); }}
        >
          <View style={styles.todayHeader}>
            <Text style={styles.todayEmoji}>📅</Text>
            <Text style={[styles.todayLabel, { color: colors.primary, fontSize: fs(13) }]}>
              {t.todayQuestion}
            </Text>
          </View>
          <Text style={[styles.todayQuestion, { color: colors.text, fontSize: fs(14) }]} numberOfLines={2}>
            {todayQuestion.question}
          </Text>
        </TouchableOpacity>
      )}

      {/* 苦手問題モード */}
      {weakQuestionCount > 0 && (
        <TouchableOpacity
          style={[styles.weakCard, { backgroundColor: colors.error + '15', borderColor: colors.error }]}
          onPress={async () => {
            SoundManager.play('decide');
            await AsyncStorage.setItem('quiz_mode', 'weak');
            router.push('/quiz');
          }}
        >
          <Text style={styles.weakEmoji}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.weakLabel, { color: colors.error, fontSize: fs(13) }]}>
              {t.weakQuestionsQuiz}
            </Text>
            <Text style={[styles.weakDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>
              {locale === 'ja' ? `${weakQuestionCount}${t.reviewWeakQuestions}` : `${t.reviewWeakQuestions} (${weakQuestionCount})`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.error} />
        </TouchableOpacity>
      )}

      {/* Main Actions */}
      <View style={styles.mainActions}>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }]} onPress={() => { SoundManager.play('decide'); router.push('/quiz'); }}>
          <Ionicons name="play" size={24} color={onPrimary} />
          <Text style={[styles.primaryButtonText, { color: onPrimary, fontSize: fs(18) }]}>{t.startQuizButton}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, { borderColor: colors.primary, backgroundColor: colors.card }]} onPress={() => { SoundManager.play('decide'); router.push('/create'); }}>
          <Ionicons name="add" size={24} color={colors.primary} />
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>{t.createQuestion}</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation Cards */}
      {(() => {
        // 上部固定カード（学習履歴・音楽設定のみ）
        const fixedCards = [
          { key: 'browse', icon: 'stats-chart',   iconBg: colors.primary + '20',   iconColor: colors.primary,   route: '/browse', titleKey: 'learningHistory' as keyof typeof t, descKey: 'learningDesc' as keyof typeof t },
          { key: 'music',  icon: 'musical-notes', iconBg: colors.secondary + '30', iconColor: colors.secondary, route: '/music',  titleKey: 'musicSettings'   as keyof typeof t, descKey: 'musicDesc'     as keyof typeof t },
        ];

        // 「その他の機能」ボタン（並び替え可能）
        const defaultExtraOrder = ['calendar', 'mission', 'title', 'shop', 'manage', 'themeSettings'];
        const extraDefs: Record<string, { icon: string; label: string; route: string }> = {
          calendar:      { icon: 'calendar-outline',      label: t.calendar,       route: '/calendar' },
          mission:       { icon: 'clipboard-outline',     label: t.mission,        route: '/mission' },
          title:         { icon: 'ribbon-outline',        label: t.titleLabel,     route: '/title' },
          shop:          { icon: 'storefront-outline',    label: t.shop,           route: '/shop' },
          manage:        { icon: 'timer-outline',         label: t.timerSettings,  route: '/manage' },
          themeSettings: { icon: 'color-palette-outline', label: t.themeSetting,    route: '/settings' },
        };
        const extraOrder: string[] = (cardOrder.filter(k => k in extraDefs).length === Object.keys(extraDefs).length)
          ? cardOrder.filter(k => k in extraDefs)
          : defaultExtraOrder;
        const orderedExtra = extraOrder.map(k => ({ key: k, ...extraDefs[k] }));

        // bigGridモード
        if (navMode === 'bigGrid') {
          return (
            <View>
              {/* 上部固定カード（グリッド） */}
              <View style={styles.grid}>
                {fixedCards.map(card => (
                  <TouchableOpacity key={card.key} style={[styles.navCard, { backgroundColor: colors.card }]} onPress={() => { SoundManager.play('decide'); router.push(card.route as any); }}>
                    <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
                      <Ionicons name={card.icon as any} size={20} color={card.iconColor} />
                    </View>
                    <Text style={[styles.navTitle, { color: colors.text, fontSize: fs(15) }]}>{t[card.titleKey]}</Text>
                    <Text style={[styles.navDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>{t[card.descKey]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* その他の機能 */}
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
                          router.push(btn.route as any);
                        }
                      }}
                    >
                      {isSelected && (
                        <View style={[styles.selBadge, { backgroundColor: colors.primary }]}>
                          <Text style={[styles.selBadgeText, { color: onPrimary }]}>{selIdx + 1}</Text>
                        </View>
                      )}
                      <View style={[styles.bigCardIcon, { backgroundColor: colors.primary + '20' }]}>
                        <Ionicons name={btn.icon as any} size={26} color={colors.primary} />
                      </View>
                      <Text style={[styles.bigCardTitle, { color: colors.text, fontSize: fs(14) }]}>
                        {btn.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        }

        // compactモード（学習履歴・音楽設定のみ、左右対称）
        return (
          <View style={styles.fixedCardRow}>
            {fixedCards.map(card => (
              <TouchableOpacity key={card.key} style={[styles.fixedCard, { backgroundColor: colors.card }]} onPress={() => { SoundManager.play('decide'); router.push(card.route as any); }}>
                <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
                  <Ionicons name={card.icon as any} size={20} color={card.iconColor} />
                </View>
                <Text style={[styles.navTitle, { color: colors.text, fontSize: fs(15) }]}>{t[card.titleKey]}</Text>
                <Text style={[styles.navDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>{t[card.descKey]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );
      })()}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  titleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  title: {
    fontSize: Platform.OS === 'web' ? 32 : 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  subtitle: {
    fontSize: Platform.OS === 'web' ? 16 : 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 24 : 20,
  },
  topButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  topButtonsMobile: {
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  timerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageButton: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  languageText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  calendarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  todayCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  todayHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  todayEmoji: { fontSize: 16 },
  todayLabel: { fontWeight: 'bold' },
  todayQuestion: { lineHeight: 20 },
  weakCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  bulbIcon: {
    marginRight: 6,
    marginTop: 2,
  },
  motivationalText: {
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 16,
  },
  examCountdownBox: {
    marginHorizontal: 16,
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
    marginBottom: 30,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  mainActions: {
    marginBottom: 30,
    gap: 15,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  secondaryButton: {
    backgroundColor: '#FFF',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 18,
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
    gap: 15,
  },
  fixedCard: {
    flex: 1,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  navCard: {
    width: Platform.OS === 'web' ? '47%' : '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: Platform.OS === 'web' ? 20 : 16,
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 120 : 100,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  navTitle: {
    fontSize: Platform.OS === 'web' ? 16 : 14,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 4,
    textAlign: 'center',
  },
  navDesc: {
    fontSize: Platform.OS === 'web' ? 12 : 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: Platform.OS === 'web' ? 18 : 16,
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
});

export default HomeScreen;

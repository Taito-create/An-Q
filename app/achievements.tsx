import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackButton from './components/BackButton';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { Lock, CheckCircle2 } from 'lucide-react';
import { TITLE_BADGES, loadStats, UserStats } from './missions';
import {
  Play, Calendar, ClipboardList, Home, User, Settings,
  TrendingUp, Target, BookOpen, ChevronRight, PenSquare,
  Share2, Package, RefreshCw, Palette, Music, Upload,
  Coins, AlertTriangle, Lightbulb, GraduationCap,
  CheckCircle2 as CheckCircle2Icon, Flame, Square, Zap, Award,
  Sprout, Crown, Pencil, Building2, Trophy
} from 'lucide-react';

const badgeIconMap: Record<string, React.ComponentType<any>> = {
  sprout: Sprout,
  'book-open': BookOpen,
  'graduation-cap': GraduationCap,
  crown: Crown,
  pencil: Pencil,
  'building-2': Building2,
  'check-circle-2': CheckCircle2Icon,
  flame: Flame,
  zap: Zap,
  trophy: Trophy,
  calendar: Calendar,
};

export default function AchievementsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const screenType = useResponsive();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const userStats = await loadStats();
      setStats(userStats);
    } catch (error) {
      console.error('Failed to load achievements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const unlockedTitles = stats?.unlockedTitles || [];
  const isUnlocked = (badgeId: string) => unlockedTitles.includes(badgeId);

  const renderBadgeCard = (badge: typeof TITLE_BADGES[0]) => {
    const unlocked = isUnlocked(badge.id);
    const IconComp = badgeIconMap[badge.icon] || Award;
    const title = locale === 'ja' ? badge.titleJa : badge.titleEn;
    const desc = locale === 'ja' ? badge.descJa : badge.descEn;

    return (
      <View
        key={badge.id}
        style={[
          styles.badgeCard,
          {
            backgroundColor: colors.card,
            borderColor: unlocked ? colors.success : colors.border,
            opacity: unlocked ? 1 : 0.6,
          },
        ]}
      >
        <View style={styles.badgeIconContainer}>
          <View
            style={[
              styles.badgeIconWrapper,
              {
                backgroundColor: unlocked ? colors.success + '20' : colors.border + '40',
              },
            ]}
          >
            <IconComp size={32} color={unlocked ? colors.success : colors.textSecondary} />
          </View>
          {!unlocked && (
            <View style={styles.lockOverlay}>
              <Lock size={20} color={colors.textSecondary} />
            </View>
          )}
          {unlocked && (
            <View style={styles.checkOverlay}>
              <CheckCircle2 size={20} color={colors.success} />
            </View>
          )}
        </View>

        <Text style={[styles.badgeTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.badgeDesc, { color: colors.textSecondary }]} numberOfLines={2}>
          {desc}
        </Text>

        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: unlocked ? colors.success + '20' : colors.border + '40',
            },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              {
                color: unlocked ? colors.success : colors.textSecondary,
              },
            ]}
          >
            {unlocked ? t.unlockedLabel : t.locked}
          </Text>
        </View>
      </View>
    );
  };

  const getGridColumns = () => {
    if (screenType === 'desktop') return 4;
    if (screenType === 'tablet') return 3;
    return 2;
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.text }]}>
          {locale === 'ja' ? '読み込み中...' : 'Loading...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 10,
          },
        ]}
      >
        <BackButton to="/sub" />
        <Text style={[styles.headerTitle, { color: colors.text, flex: 1 }]}>
          {t.achievements}
        </Text>
      </View>

      {/* Progress Summary */}
      <View style={[styles.progressSummary, { backgroundColor: colors.card }]}>
        <Text style={[styles.progressText, { color: colors.text }]}>
          {locale === 'ja'
            ? `${unlockedTitles.length} / ${TITLE_BADGES.length} 個達成`
            : `${unlockedTitles.length} / ${TITLE_BADGES.length} unlocked`}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(unlockedTitles.length / TITLE_BADGES.length) * 100}%`,
                backgroundColor: colors.success,
              },
            ]}
          />
        </View>
      </View>

      {/* Badges Grid */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.gridContainer,
          { paddingHorizontal: 16 },
        ]}
      >
        <View
          style={[
            styles.badgesGrid,
            {
              gridTemplateColumns: `repeat(${getGridColumns()}, 1fr)`,
            },
          ]}
        >
          {TITLE_BADGES.map((badge) => renderBadgeCard(badge))}
        </View>
      </ScrollView>
    </View>
  );
};

const useResponsive = () => {
  const [screenType, setScreenType] = React.useState<'mobile' | 'tablet' | 'desktop'>('mobile');

  React.useEffect(() => {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRight: {
    width: 60,
  },
  progressSummary: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  scrollView: {
    flex: 1,
  },
  gridContainer: {
    paddingBottom: 100,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    flex: 1,
    minWidth: '45%',
    maxWidth: '25%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    gap: 12,
  },
  badgeIconContainer: {
    position: 'relative',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    borderRadius: 10,
    padding: 2,
  },
  checkOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    borderRadius: 10,
    padding: 2,
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { Settings, Volume2, Package, ShoppingBag, Gift, Trophy, Calendar } from 'lucide-react';

// レスポンシブ判定用フック
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

// 特別カード（ゲーミフィケーション強調）のスタイル定義
// グラデーションは react-native-linear-gradient 未導入のため、
// ダークテーマ互換の濃色実体 + 金色/緑/アンバー/ブルーのアクセントで表現。
const specialCardStyles: Record<string, ViewStyle> = {
  shop:         { backgroundColor: '#065F46', borderColor: '#10B981' },
  gacha:        { backgroundColor: '#7C3AED', borderColor: '#FFD700' },
  achievements: { backgroundColor: '#92400E', borderColor: '#F59E0B' },
  calendar:     { backgroundColor: '#1E3A5F', borderColor: '#3B82F6' },
};

// サブ機能のハブ画面
export default function SubHubScreen() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const locale = useLocale();
  const screenType = useResponsive();

  // カードの列数を決定
  const getColumns = () => {
    switch (screenType) {
      case 'desktop':
        return 2;
      case 'tablet':
        return 2;
      case 'mobile':
        return 1;
    }
  };

  const menuItems = [
    {
      id: 'theme',
      icon: <Settings size={24} color={colors.primary} />,
      title: locale === 'ja' ? 'テーマ・外観' : 'Theme & Appearance',
      description: locale === 'ja' ? 'テーマやフォントサイズを変更' : 'Change theme and font size',
      onPress: () => navigate('/settings'),
    },
    {
      id: 'sound',
      icon: <Volume2 size={24} color={colors.primary} />,
      title: locale === 'ja' ? '音楽・サウンド' : 'Music & Sound',
      description: locale === 'ja' ? 'BGMや効果音を設定' : 'Configure BGM and sound effects',
      onPress: () => navigate('/music'),
    },
    {
      id: 'appSettings',
      icon: <Settings size={24} color={colors.primary} />,
      title: locale === 'ja' ? 'アプリ設定' : 'App Settings',
      description: locale === 'ja' ? 'サウンド・言語・ボイス' : 'Sound, Language, Voice',
      onPress: () => navigate('/appSettings'),
    },
    {
      id: 'shop',
      icon: <ShoppingBag size={24} color="#10B981" />,
      title: locale === 'ja' ? 'ショップ' : 'Shop',
      description: locale === 'ja' ? 'アイテムでスキンを購入' : 'Buy items and skins',
      onPress: () => navigate('/shop'),
    },
    {
      id: 'gacha',
      icon: <Gift size={24} color="#FFD700" />,
      title: locale === 'ja' ? 'ガチャ' : 'Gacha',
      description: locale === 'ja' ? 'レアアイテムをゲット' : 'Get rare items',
      onPress: () => navigate('/gacha'),
    },
    {
      id: 'achievements',
      icon: <Trophy size={24} color="#F59E0B" />,
      title: locale === 'ja' ? '実績' : 'Achievements',
      description: locale === 'ja' ? '実績を解除して称号をゲット' : 'Unlock achievements and titles',
      onPress: () => navigate('/achievements'),
    },
    {
      id: 'calendar',
      icon: <Calendar size={24} color="#3B82F6" />,
      title: locale === 'ja' ? 'カレンダー' : 'Calendar',
      description: locale === 'ja' ? '学習記録を確認' : 'Check your study records',
      onPress: () => navigate('/calendar'),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          <Package size={22} color={colors.primary} style={{ marginRight: 8 }} />{locale === 'ja' ? 'サブ機能' : 'Sub'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]}>
        <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }]}>
          {menuItems.map((item) => {
            const isSpecialCard = !!specialCardStyles[item.id];
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    width: `${100 / getColumns() - 2}%`,
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                    minHeight: 120,
                  },
                  isSpecialCard ? specialCardStyles[item.id] : null,
                  isSpecialCard ? styles.specialCard : null,
                  isSpecialCard ? styles.specialCardGlow : null,
                ]}
                onPress={() => { SoundManager.play('decide'); item.onPress(); }}
                activeOpacity={0.7}
              >
                <View style={styles.cardIcon}>{item.icon}</View>
                <View style={styles.cardContent}>
                  <Text style={[styles.cardTitle, { color: isSpecialCard ? '#FFFFFF' : colors.text, textAlign: 'center' }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.cardDescription, { color: isSpecialCard ? 'rgba(255,255,255,0.85)' : colors.textSecondary, textAlign: 'center' }]}>
                    {item.description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  content: { padding: 16 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardIcon: {
    marginBottom: 12,
  },
  cardContent: {
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  // 特別カード用スタイル
  specialCard: {
    borderWidth: 2,
    borderRadius: 16,
  },
  specialCardGlow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});

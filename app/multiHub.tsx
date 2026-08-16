import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';
import { Share2, Inbox, Globe } from 'lucide-react';

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

// マルチ機能のハブ画面
export default function MultiHubScreen() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const locale = useLocale();
  const ja = locale === 'ja';
  const screenType = useResponsive();

  // カードの列数を決定
  const getColumns = () => {
    switch (screenType) {
      case 'desktop':
        return 3;
      case 'tablet':
        return 2;
      case 'mobile':
        return 1;
    }
  };

  const menuItems = [
    {
      id: 'share',
      icon: <Share2 size={32} color={colors.primary} />,
      title: ja ? 'コードで共有' : 'Share via Code',
      description: ja ? '問題をコードで送信・受信' : 'Send and receive questions via code',
      onPress: () => navigate('/multi/share'),
    },
    {
      id: 'inbox',
      icon: <Inbox size={32} color={colors.primary} />,
      title: ja ? '受信ボックス' : 'Inbox',
      description: ja ? '受け取った問題を確認' : 'Check received questions',
      onPress: () => navigate('/inbox'),
    },
    {
      id: 'public',
      icon: <Globe size={32} color={colors.primary} />,
      title: ja ? '公開問題' : 'Public Questions',
      description: ja ? '公開中の問題を閲覧' : 'Browse shared public questions',
      onPress: () => navigate('/multi/public'),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          <Share2 size={22} color={colors.primary} style={{ marginRight: 8 }} />{ja ? 'マルチ機能' : 'Multi'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }]}>
          {menuItems.map((item) => (
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
                  padding: 20,
                  minHeight: 140,
                },
              ]}
              onPress={() => { SoundManager.play('decide'); item.onPress(); }}
              activeOpacity={0.7}
            >
              <View style={styles.cardIcon}>{item.icon}</View>
              <View style={styles.cardContent}>
                <Text style={[styles.cardTitle, { color: colors.text, textAlign: 'center' }]}>{item.title}</Text>
                <Text style={[styles.cardDescription, { color: colors.textSecondary, textAlign: 'center' }]}>{item.description}</Text>
              </View>
            </TouchableOpacity>
          ))}
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
    padding: 20,
    minHeight: 140,
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
});

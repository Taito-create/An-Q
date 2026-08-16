import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';
import { SoundManager } from './sound';
import { PenSquare, Image as ImageIcon, FolderOpen, Clock } from 'lucide-react';

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

// 作成タブのハブ画面
export default function CreateHubScreen() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
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
      id: 'create',
      icon: <PenSquare size={32} color={colors.primary} />,
      title: locale === 'ja' ? 'ゼロから問題を作成' : 'Create from Scratch',
      description: locale === 'ja' ? '1問ずつ手動で作成' : 'Create questions manually',
      onPress: () => navigate('/create/manual'),
    },
    {
      id: 'import',
      icon: <ImageIcon size={32} color={colors.primary} />,
      title: locale === 'ja' ? '画像から一括生成' : 'Generate from Image',
      description: locale === 'ja' ? 'OCRで画像から問題を生成' : 'Generate questions via OCR',
      onPress: () => navigate('/create/ocr'),
    },
    {
      id: 'manage',
      icon: <FolderOpen size={32} color={colors.primary} />,
      title: locale === 'ja' ? '問題を管理・編集' : 'Manage Questions',
      description: locale === 'ja' ? '既存の問題を閲覧・編集' : 'View and edit questions',
      onPress: () => navigate('/browse'),
    },
    {
      id: 'timer',
      icon: <Clock size={32} color={colors.primary} />,
      title: locale === 'ja' ? 'タイマー設定' : 'Timer Settings',
      description: locale === 'ja' ? 'クイズの制限時間を設定' : 'Set quiz time limit',
      onPress: () => navigate('/timer'),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          <PenSquare size={24} color={colors.primary} /> {t.createQuestion}
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

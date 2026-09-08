import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';
import { SoundManager } from './sound';
import { PenSquare, FolderOpen, Clock } from 'lucide-react';

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

  const [showCreateOptions, setShowCreateOptions] = useState(false);

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
      id: 'create',
      icon: <PenSquare size={24} color={colors.primary} />,
      title: locale === 'ja' ? '問題を作成' : 'Create Question',
      description: locale === 'ja' ? '手動で作成' : 'Create manually',
      onPress: () => setShowCreateOptions(true),
    },
    {
      id: 'manage',
      icon: <FolderOpen size={24} color={colors.primary} />,
      title: locale === 'ja' ? '問題を管理・編集' : 'Manage Questions',
      description: locale === 'ja' ? '既存の問題を閲覧・編集' : 'View and edit questions',
      onPress: () => navigate('/browse'),
    },
    {
      id: 'timer',
      icon: <Clock size={24} color={colors.primary} />,
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

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 100 }]}>
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
                  padding: 16,
                  minHeight: 120,
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

      {/* 作成方法選択モーダル */}
      <Modal
        visible={showCreateOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {locale === 'ja' ? '作成方法を選択' : 'Select creation method'}
            </Text>
            <TouchableOpacity
              style={[styles.modalOption, { borderColor: colors.border, backgroundColor: colors.background }]}
              onPress={() => { SoundManager.play('decide'); setShowCreateOptions(false); navigate('/create/manual'); }}
              activeOpacity={0.7}
            >
              <PenSquare size={20} color={colors.primary} />
              <Text style={[styles.modalOptionText, { color: colors.text }]}>
                {locale === 'ja' ? 'ゼロから手動で作成' : 'Create manually'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              onPress={() => { SoundManager.play('decide'); setShowCreateOptions(false); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                {locale === 'ja' ? 'キャンセル' : 'Cancel'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalOptionText: {
    fontSize: 16,
    flex: 1,
    textAlign: 'center',
  },
  modalCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  modalCancelText: {
    fontSize: 15,
  },
});

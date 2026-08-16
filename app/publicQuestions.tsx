import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { useQuestionsContext } from './context/QuestionsContext';
import { SoundManager } from './sound';
import { Globe, ChevronLeft, Share2 } from 'lucide-react';
import { Question } from './types/question';

// 公開問題一覧画面（プレースホルダー）。現在のユーザーが公開共有設定にした問題を表示する。
export default function PublicQuestionsScreen() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const locale = useLocale();
  const { questions } = useQuestionsContext();
  const ja = locale === 'ja';

  const sharedQuestions = questions.filter((q: Question) => q.isShared === true);

  const renderItem = ({ item }: { item: Question }) => (
    <View style={[styles.item, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.itemQuestion, { color: colors.text }]} numberOfLines={3}>{item.question}</Text>
      {item.sharedMark ? (
        <Text style={[styles.itemMark, { color: colors.primary }]}>{item.sharedMark}</Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => { SoundManager.play('decide'); navigate('/multi'); }}
        >
          <ChevronLeft size={22} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 14 }}>{ja ? '戻る' : 'Back'}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          <Globe size={22} color={colors.primary} style={{ marginRight: 8 }} />{ja ? '公開問題' : 'Public Questions'}
        </Text>
      </View>

      {sharedQuestions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Share2 size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {ja
              ? '公開中の問題はありません。\nコードで共有して公開してみましょう！'
              : "No public questions available yet.\nShare a question via code to publish it!"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sharedQuestions}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: 'bold' },
  list: { padding: 16, gap: 12 },
  item: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, gap: 10 },
  itemQuestion: { flex: 1, fontSize: 15 },
  itemMark: { fontSize: 18 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});

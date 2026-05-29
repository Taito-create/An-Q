import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate } from 'react-router-dom';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

// 共通の型定義
interface Question {
  id: number;
  question: string;
  answerType: 'descriptive' | 'truefalse' | 'multiple';
  descriptiveAnswer?: string;
  trueFalseAnswer?: boolean;
  multipleChoice?: {
    options: string[];
    correctAnswer: number;
  };
  enabled: boolean;
  tags: string[];
}

export default function BrowseQuestionsScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // タグ編集用 state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editTagInput, setEditTagInput] = useState('');
  const [showTagModal, setShowTagModal] = useState(false);

  // 回答表示用 state
  const [showAnswerId, setShowAnswerId] = useState<number | null>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const data = await AsyncStorage.getItem('quiz_questions');
      if (data) {
        const allQuestions: Question[] = JSON.parse(data);
        const filteredQuestions = allQuestions.filter((q: any) => {
          if (!q.answerType) {
            console.log('Skipping old format question:', q);
            return false;
          }
          return true;
        });
        setQuestions(filteredQuestions);
      }
    } catch (e) {
      console.error('Failed to load questions.');
    }
  };

  const handleDeleteRequest = (id: number) => {
    if (Platform.OS === 'web') {
      setPendingDeleteId(id);
    } else {
      Alert.alert(
        t.deleteConfirmTitle,
        t.deleteConfirmMsg,
        [
          { text: t.cancel, style: 'cancel' },
          { text: t.deleteAction, style: 'destructive', onPress: () => confirmDelete(id) }
        ]
      );
    }
  };

  const confirmDelete = async (id: number) => {
    try {
      const updatedList = questions.filter(q => q.id !== id);
      setQuestions(updatedList);
      setPendingDeleteId(null);
      await AsyncStorage.setItem('quiz_questions', JSON.stringify(updatedList));
      console.log(`Deleted ID: ${id}. Remaining: ${updatedList.length}`);
    } catch (e) {
      console.error("削除エラー:", e);
      loadQuestions();
    }
  };

  // タグ編集を開始
  const startEditTags = (question: Question) => {
    setEditingQuestion(question);
    setEditTagInput(question.tags ? question.tags.join(', ') : '');
    setShowTagModal(true);
  };

  // タグを保存
  const saveEditedTags = async () => {
    if (!editingQuestion) return;

    const newTags = editTagInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const updatedQuestions = questions.map(q => {
      if (q.id === editingQuestion.id) {
        return { ...q, tags: newTags };
      }
      return q;
    });

    try {
      await AsyncStorage.setItem('quiz_questions', JSON.stringify(updatedQuestions));
      setQuestions(updatedQuestions);
      setShowTagModal(false);
      setEditingQuestion(null);
      SoundManager.play('complete');
      Alert.alert(t.success, locale === 'ja' ? 'タグを更新しました。' : 'Tags updated.');
    } catch (e) {
      console.error('Failed to save tags:', e);
      Alert.alert(t.error, t.failedToSave);
    }
  };

  // 回答テキストを取得
  const getAnswerText = (item: Question): string => {
    switch (item.answerType) {
      case 'truefalse':
        return item.trueFalseAnswer ? '○' : '✕';
      case 'multiple':
        const correctIdx = item.multipleChoice?.correctAnswer ?? 0;
        const correctOption = item.multipleChoice?.options[correctIdx] || '';
        return `${correctIdx + 1}. ${correctOption}`;
      case 'descriptive':
        return item.descriptiveAnswer || '';
      default:
        return '';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {locale === 'en'
          ? `${t.manageQuestions} (All ${questions.length} ${t.questionsCountLabel})`
          : `${t.manageQuestions}（全 ${questions.length}${t.questionsCountLabel}）`}
      </Text>
      <ScrollView>
        {questions.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.typeBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>
                {item.answerType === 'multiple' ? t.multiple : item.answerType === 'truefalse' ? t.truefalse : t.descriptive}
              </Text>
              <View style={styles.cardActions}>
                {/* 回答を表示ボタン */}
                <TouchableOpacity
                  onPress={() => {
                    SoundManager.play('select');
                    setShowAnswerId(showAnswerId === item.id ? null : item.id);
                  }}
                >
                  <Text style={[styles.answerBtnText, { color: colors.primary }]}>
                    {showAnswerId === item.id ? t.hide : t.showAnswer}
                  </Text>
                </TouchableOpacity>
                {/* タグ編集ボタン */}
                <TouchableOpacity
                  onPress={() => {
                    SoundManager.play('select');
                    startEditTags(item);
                  }}
                >
                  <Text style={[styles.editTagBtnText, { color: colors.primary }]}>
                    {t.editTags}
                  </Text>
                </TouchableOpacity>
                {/* 削除ボタン */}
                <TouchableOpacity onPress={() => handleDeleteRequest(item.id)}>
                  <Text style={[styles.deleteText, { color: colors.error }]}>{t.deleteAction}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={[styles.questionText, { color: colors.text }]}>{item.question}</Text>

            {/* タグ表示 */}
            {item.tags && item.tags.length > 0 && (
              <View style={styles.tagRow}>
                {item.tags.map((tag, i) => (
                  <View key={i} style={[styles.miniTag, { backgroundColor: colors.primary + '20' }]}>
                    <Text style={[styles.miniTagText, { color: colors.primary }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* 回答表示 */}
            {showAnswerId === item.id && (
              <View style={[styles.answerBox, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                <Text style={[styles.answerLabel, { color: colors.success }]}>{t.answerDisplay}:</Text>
                <Text style={[styles.answerText, { color: colors.text }]}>{getAnswerText(item)}</Text>
              </View>
            )}
          </View>
        ))}
        {questions.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noQuestions}</Text>
        )}
      </ScrollView>
      <TouchableOpacity 
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>{t.back}</Text>
      </TouchableOpacity>

      {/* 削除確認 */}
      {pendingDeleteId !== null && (
        <View style={styles.confirmOverlay}>
          <Text style={styles.confirmText}>{t.deleteConfirmMsg}</Text>
          <View style={styles.confirmButtons}>
            <TouchableOpacity style={styles.confirmCancelButton} onPress={() => setPendingDeleteId(null)}>
              <Text style={styles.confirmCancelText}>{t.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmDeleteButton} onPress={() => confirmDelete(pendingDeleteId)}>
              <Text style={styles.confirmDeleteText}>{t.deleteAction}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* タグ編集モーダル */}
      <Modal visible={showTagModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.tagEditTitle}</Text>
            
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
              value={editTagInput}
              onChangeText={setEditTagInput}
              placeholder={t.enterTagsComma}
              placeholderTextColor={colors.textSecondary}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setShowTagModal(false);
                  setEditingQuestion(null);
                }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancelEdit}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={saveEditedTags}
              >
                <Text style={styles.modalSaveText}>{t.saveTags}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F5F7FA', paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  card: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 },
  cardHeader: { marginBottom: 8 },
  typeBadge: { fontSize: 12, color: '#007AFF', fontWeight: 'bold', backgroundColor: '#E1EFFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 6 },
  deleteText: { color: '#FF3B30', fontWeight: 'bold' },
  answerBtnText: { fontWeight: 'bold' },
  editTagBtnText: { fontWeight: 'bold' },
  questionText: { fontSize: 16, color: '#333' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  backButton: { marginTop: 20, padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  backButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  confirmOverlay: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ddd', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 8 },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 12, textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  confirmCancelButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  confirmCancelText: { color: '#666', fontWeight: 'bold', fontSize: 14 },
  confirmDeleteButton: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#ff4444', alignItems: 'center' },
  confirmDeleteText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  // タグ表示
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  miniTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  miniTagText: { fontSize: 11, fontWeight: '500' },
  // 回答表示ボックス
  answerBox: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  answerLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  answerText: { fontSize: 15 },
  // モーダル
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContainer: { width: '85%', maxWidth: 400, padding: 24, borderRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
]]>
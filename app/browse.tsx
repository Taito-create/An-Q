import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
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
}

export default function BrowseQuestionsScreen() {
  const router = useRouter();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const data = await AsyncStorage.getItem('quiz_questions');
      if (data) {
        const allQuestions: Question[] = JSON.parse(data);
        // 古い形式のデータをスキップ
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

  // 削除ボタンが押された時の処理
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{locale === 'en' ? `${t.manageQuestions} (All ${questions.length} ${t.questionsCountLabel})` : `${t.manageQuestions}（全 ${questions.length} ${t.questionsCountLabel}）`}</Text>
      <ScrollView>
        {questions.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.typeBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>
                {item.answerType === 'multiple' ? t.multiple : item.answerType === 'truefalse' ? t.truefalse : t.descriptive}
              </Text>
              <TouchableOpacity onPress={() => handleDeleteRequest(item.id)}>
                <Text style={[styles.deleteText, { color: colors.error }]}>{t.deleteAction}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.questionText, { color: colors.text }]}>{item.question}</Text>
          </View>
        ))}
        {questions.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noQuestions}</Text>
        )}
      </ScrollView>
      <TouchableOpacity 
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? router.back() : router.replace("/"); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>{t.back}</Text>
      </TouchableOpacity>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F5F7FA', paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  card: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 },  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  typeBadge: { fontSize: 12, color: '#007AFF', fontWeight: 'bold', backgroundColor: '#E1EFFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  deleteText: { color: '#FF3B30', fontWeight: 'bold' },
  questionText: { fontSize: 16, color: '#333' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  backButton: { marginTop: 20, padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  backButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  confirmOverlay: { position: 'absolute', bottom: 80, left: 20, right: 20, backgroundColor: 'white', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#ddd', elevation: 8 },
  confirmText: { fontSize: 14, color: '#333', marginBottom: 12, textAlign: 'center' },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  confirmCancelButton: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  confirmCancelText: { color: '#666', fontWeight: 'bold', fontSize: 14 },
  confirmDeleteButton: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: '#ff4444', alignItems: 'center' },
  confirmDeleteText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
});
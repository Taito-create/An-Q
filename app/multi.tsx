import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, StyleSheet, Share } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';

function base64Encode(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}

function base64Decode(str: string): string {
  return decodeURIComponent(Array.from(atob(str), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

export default function MultiScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();

  const [shareMode, setShareMode] = useState<'send' | 'receive'>('send');
  const [shareType, setShareType] = useState<'questions' | 'folders'>('questions');
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [shareCode, setShareCode] = useState('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const questionsRaw = await AsyncStorage.getItem('quiz_questions');
    const foldersRaw = await AsyncStorage.getItem('question_folders');
    setQuestions(questionsRaw ? JSON.parse(questionsRaw) : []);
    setFolders(foldersRaw ? JSON.parse(foldersRaw) : []);
  };

  const generateShareCode = async () => {
    let dataToShare: any;

    if (shareType === 'questions') {
      if (selectedQuestions.length === 0) {
        Alert.alert(locale === 'ja' ? '選択してください' : 'Select items');
        return;
      }
      dataToShare = {
        type: 'questions',
        data: questions.filter(q => selectedQuestions.includes(q.id))
      };
    } else {
      if (selectedFolders.length === 0) {
        Alert.alert(locale === 'ja' ? '選択してください' : 'Select items');
        return;
      }
      const selectedFolderData = folders.filter(f => selectedFolders.includes(f.id));
      // Include the actual questions for each folder
      const folderDataWithQuestions = selectedFolderData.map((f: any) => ({
        ...f,
        questionData: (f.questionIds || []).map((qId: number) => questions.find(q => q.id === qId)).filter(Boolean),
      }));
      dataToShare = {
        type: 'folders',
        data: folderDataWithQuestions
      };
    }

    const code = base64Encode(JSON.stringify(dataToShare));
    setShareCode(code);

    try {
      await Share.share({
        message: locale === 'ja'
          ? `[An-Q] ${shareType === 'questions' ? '問題' : '問題集'}シェアコード: ${code.substring(0, 50)}...`
          : `[An-Q] ${shareType === 'questions' ? 'Question' : 'Folder'} share code: ${code.substring(0, 50)}...`,
      });
    } catch (e) {
      try {
        await navigator.clipboard.writeText(code);
        Alert.alert(
          locale === 'ja' ? 'コピーしました' : 'Copied',
          locale === 'ja' ? 'コードを送信してください' : 'Share the code'
        );
      } catch {}
    }
  };

  const receiveFromCode = async () => {
    try {
      const decoded = base64Decode(shareCode);
      const receivedData = JSON.parse(decoded);

      if (!receivedData.type || !receivedData.data) {
        Alert.alert(locale === 'ja' ? 'エラー' : 'Error', locale === 'ja' ? 'コードが無効です' : 'Invalid code');
        return;
      }

      if (receivedData.type === 'questions') {
        const existing = JSON.parse(await AsyncStorage.getItem('quiz_questions') || '[]') as any[];
        const merged = [...existing, ...receivedData.data.map((q: any) => ({
          ...q,
          id: Date.now() + Math.floor(Math.random() * 10000),
          sharedFrom: true,
          importedDate: Date.now(),
        }))];
        await AsyncStorage.setItem('quiz_questions', JSON.stringify(merged));
      } else if (receivedData.type === 'folders') {
        // Import folders and their questions
        const existingQuestions = JSON.parse(await AsyncStorage.getItem('quiz_questions') || '[]') as any[];
        let newQuestions: any[] = [];
        const newFolders = receivedData.data.map((f: any) => {
          const importedQuestionIds: number[] = [];
          (f.questionData || []).forEach((q: any) => {
            const newId = Date.now() + Math.floor(Math.random() * 10000);
            importedQuestionIds.push(newId);
            newQuestions.push({
              ...q,
              id: newId,
              sharedFrom: true,
              importedDate: Date.now(),
            });
          });
          return {
            id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
            name: f.name,
            questionIds: importedQuestionIds,
            sharedFrom: true,
          };
        });

        const existingFolders = JSON.parse(await AsyncStorage.getItem('question_folders') || '[]') as any[];
        await AsyncStorage.setItem('quiz_questions', JSON.stringify([...existingQuestions, ...newQuestions]));
        await AsyncStorage.setItem('question_folders', JSON.stringify([...existingFolders, ...newFolders]));
      }

      await loadData();
      Alert.alert(
        locale === 'ja' ? '成功' : 'Success',
        locale === 'ja'
          ? `${shareType === 'questions' ? '問題' : '問題集'}を受信しました`
          : `${shareType === 'questions' ? 'Questions' : 'Folders'} received`
      );
      setShareCode('');
    } catch (error) {
      console.error('Failed to decode share code:', error);
      Alert.alert(locale === 'ja' ? 'エラー' : 'Error', locale === 'ja' ? 'コードが無効です' : 'Invalid code');
    }
  };

  const copyCodeToClipboard = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      Alert.alert(
        locale === 'ja' ? 'コピーしました' : 'Copied',
        locale === 'ja' ? 'コードを送信してください' : 'Share the code'
      );
    } catch {}
  };

  const canGenerate = shareType === 'questions' ? selectedQuestions.length > 0 : selectedFolders.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          🔗 {locale === 'ja' ? 'マルチ・共有' : 'Multi Share'}
        </Text>
        <TouchableOpacity onPress={() => { SoundManager.play('decide'); navigate('/'); }}>
          <Text style={[{ color: colors.primary, fontSize: 18 }]}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, { borderBottomColor: shareMode === 'send' ? colors.primary : 'transparent', borderBottomWidth: shareMode === 'send' ? 2 : 0 }]}
          onPress={() => setShareMode('send')}
        >
          <Text style={[styles.tabText, { color: shareMode === 'send' ? colors.primary : colors.textSecondary, fontWeight: shareMode === 'send' ? '700' : '500' }]}>
            📤 {locale === 'ja' ? '送信' : 'Send'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { borderBottomColor: shareMode === 'receive' ? colors.primary : 'transparent', borderBottomWidth: shareMode === 'receive' ? 2 : 0 }]}
          onPress={() => setShareMode('receive')}
        >
          <Text style={[styles.tabText, { color: shareMode === 'receive' ? colors.primary : colors.textSecondary, fontWeight: shareMode === 'receive' ? '700' : '500' }]}>
            📥 {locale === 'ja' ? '受信' : 'Receive'}
          </Text>
        </TouchableOpacity>
      </View>

      {shareMode === 'send' ? (
        <ScrollView style={styles.content}>
          {/* 問題 / 問題集 切り替え */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <TouchableOpacity
              style={[{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: shareType === 'questions' ? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setShareType('questions'); setSelectedFolders([]); }}
            >
              <Text style={[{ textAlign: 'center', color: shareType === 'questions' ? '#fff' : colors.text, fontWeight: '700' }]}>
                {locale === 'ja' ? '問題' : 'Questions'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: shareType === 'folders' ? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setShareType('folders'); setSelectedQuestions([]); }}
            >
              <Text style={[{ textAlign: 'center', color: shareType === 'folders' ? '#fff' : colors.text, fontWeight: '700' }]}>
                {locale === 'ja' ? '問題集' : 'Folders'}
              </Text>
            </TouchableOpacity>
          </View>

          {shareType === 'questions' ? (
            <>
              {questions.length === 0 && (
                <Text style={[{ color: colors.textSecondary, textAlign: 'center', padding: 20 }]}>
                  {locale === 'ja' ? '問題がありません' : 'No questions'}
                </Text>
              )}
              {questions.map((q) => (
                <TouchableOpacity
                  key={q.id}
                  style={[styles.questionItem, {
                    borderColor: selectedQuestions.includes(q.id) ? colors.primary : colors.border,
                    backgroundColor: selectedQuestions.includes(q.id) ? colors.primary + '20' : colors.card
                  }]}
                  onPress={() => {
                    if (selectedQuestions.includes(q.id)) {
                      setSelectedQuestions(selectedQuestions.filter(id => id !== q.id));
                    } else {
                      setSelectedQuestions([...selectedQuestions, q.id]);
                    }
                  }}
                >
                  <Text style={[{ fontSize: 16, color: selectedQuestions.includes(q.id) ? colors.primary : colors.textSecondary }]}>
                    {selectedQuestions.includes(q.id) ? '☑️' : '☐'}
                  </Text>
                  <Text style={[{ flex: 1, color: colors.text, fontSize: 13 }]}>{q.question?.substring(0, 50)}...</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <>
              {folders.length === 0 && (
                <Text style={[{ color: colors.textSecondary, textAlign: 'center', padding: 20 }]}>
                  {locale === 'ja' ? '問題集がありません' : 'No folders'}
                </Text>
              )}
              {folders.map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.questionItem, {
                    borderColor: selectedFolders.includes(f.id) ? colors.primary : colors.border,
                    backgroundColor: selectedFolders.includes(f.id) ? colors.primary + '20' : colors.card
                  }]}
                  onPress={() => {
                    if (selectedFolders.includes(f.id)) {
                      setSelectedFolders(selectedFolders.filter(id => id !== f.id));
                    } else {
                      setSelectedFolders([...selectedFolders, f.id]);
                    }
                  }}
                >
                  <Text style={[{ fontSize: 16, color: selectedFolders.includes(f.id) ? colors.primary : colors.textSecondary }]}>
                    {selectedFolders.includes(f.id) ? '☑️' : '☐'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ color: colors.text, fontSize: 13 }]}>{f.name}</Text>
                    <Text style={[{ color: colors.textSecondary, fontSize: 11 }]}>
                      {(f.questionIds || []).length}{locale === 'ja' ? '問' : ' questions'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </>
          )}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, opacity: canGenerate ? 1 : 0.5 }]}
            onPress={generateShareCode}
            disabled={!canGenerate}
          >
            <Text style={[styles.buttonText, { color: onPrimary }]}>
              🔗 {locale === 'ja' ? 'コード生成・共有' : 'Generate & Share'}
            </Text>
          </TouchableOpacity>

          {shareCode ? (
            <TouchableOpacity style={[styles.codeBox, { backgroundColor: colors.card, borderColor: colors.primary }]} onPress={copyCodeToClipboard}>
              <Text style={[{ fontSize: 11, color: colors.textSecondary, marginBottom: 4 }]}>
                {locale === 'ja' ? 'コード（タップでコピー）' : 'Code (tap to copy)'}
              </Text>
              <Text style={[{ fontSize: 12, color: colors.text, fontFamily: 'monospace' }]}>{shareCode.substring(0, 100)}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView style={styles.content}>
          <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }]}>
            {locale === 'ja' ? 'シェアコードを貼り付け' : 'Paste share code'}
          </Text>

          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
            placeholder={locale === 'ja' ? 'コードを入力' : 'Enter code'}
            placeholderTextColor={colors.textSecondary}
            value={shareCode}
            onChangeText={setShareCode}
            multiline
            numberOfLines={6}
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary, opacity: !shareCode ? 0.5 : 1 }]}
            onPress={receiveFromCode}
            disabled={!shareCode}
          >
            <Text style={[styles.buttonText, { color: onPrimary }]}>
              📥 {locale === 'ja' ? '受信' : 'Receive'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); navigate('/'); }}
      >
        <Text style={[styles.backButtonText, { color: onPrimary }]}>{locale === 'ja' ? '戻る' : 'Back'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  tabText: { fontSize: 13 },
  content: { flex: 1, padding: 16 },
  questionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1 },
  button: { padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  buttonText: { fontWeight: '700', fontSize: 15 },
  codeBox: { padding: 12, borderRadius: 8, borderWidth: 1, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 12, minHeight: 100, textAlignVertical: 'top' },
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: '700', fontSize: 16 },
});
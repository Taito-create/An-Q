import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, StyleSheet, Share } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import { SoundManager } from './sound';

function base64Encode(str: string): string {
  const utf8bytes = new TextEncoder().encode(str);
  const binaryString = String.fromCharCode(...Array.from(utf8bytes));
  return btoa(binaryString);
}

function base64Decode(str: string): string {
  const binaryString = atob(str);
  const utf8bytes = Uint8Array.from([...binaryString].map(c => c.charCodeAt(0)));
  return new TextDecoder().decode(utf8bytes);
}

export default function MultiScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();

  const [shareMode, setShareMode] = useState<'send' | 'receive'>('send');
  const [shareType, setShareType] = useState<'questions' | 'folders'>('questions');
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');  // 送信用コード
  const [receiveCode, setReceiveCode] = useState('');      // 受信用入力
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

      const questionsToShare = questions
        .filter(q => selectedQuestions.includes(q.id))
        .map(q => ({
          question: q.question,
          answerType: q.answerType,
          descriptiveAnswer: q.descriptiveAnswer || '',
          trueFalseAnswer: q.trueFalseAnswer || false,
          multipleChoice: q.multipleChoice || [],
          tags: q.tags || [],
          image: q.image || null,
          imageAnnotations: q.imageAnnotations || [],
          enabled: true,
          mistakeCount: 0,
          createdAt: q.createdAt || Date.now(),
        }));

      dataToShare = {
        type: 'questions',
        version: 1,
        data: questionsToShare,
        sharedAt: Date.now(),
      };
    } else {
      if (selectedFolders.length === 0) {
        Alert.alert(locale === 'ja' ? '選択してください' : 'Select items');
        return;
      }

      const foldersToShare = selectedFolders.map(folderId => {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return null;

        const folderQuestions = questions.filter(q =>
          folder.questionIds && folder.questionIds.includes(q.id)
        );

        return {
          name: folder.name,
          description: folder.description || '',
          questions: folderQuestions.map(q => ({
            question: q.question,
            answerType: q.answerType,
            descriptiveAnswer: q.descriptiveAnswer || '',
            trueFalseAnswer: q.trueFalseAnswer || false,
            multipleChoice: q.multipleChoice || [],
            tags: q.tags || [],
            image: q.image || null,
            imageAnnotations: q.imageAnnotations || [],
          })),
          createdAt: folder.createdAt || Date.now(),
        };
      }).filter((f): f is NonNullable<typeof f> => f !== null);

      dataToShare = {
        type: 'folders',
        version: 1,
        data: foldersToShare,
        sharedAt: Date.now(),
      };
    }

    if (!dataToShare) return;

    try {
      // JSON → UTF-8 → Base64（改行除去）
      const jsonString = JSON.stringify(dataToShare);
      const utf8bytes = new TextEncoder().encode(jsonString);
      const binaryString = String.fromCharCode(...Array.from(utf8bytes));
      let code = btoa(binaryString);
      code = code.replace(/\n/g, '');

      setGeneratedCode(code);

      Alert.alert(
        locale === 'ja' ? 'コード生成完了' : 'Code Generated',
        locale === 'ja'
          ? '以下のコードをコピーして送信してください'
          : 'Copy and share the code below',
        [
          {
            text: locale === 'ja' ? 'コピー' : 'Copy',
            onPress: async () => {
              try {
                await navigator.clipboard.writeText(code);
                Alert.alert(
                  locale === 'ja' ? 'コピーしました' : 'Copied',
                  locale === 'ja' ? 'コードを送信してください' : 'Share the code'
                );
              } catch (error) {
                console.error('Failed to copy:', error);
              }
            }
          },
          {
            text: locale === 'ja' ? 'キャンセル' : 'Cancel',
            style: 'cancel'
          }
        ]
      );
    } catch (error) {
      console.error('Failed to generate share code:', error);
      Alert.alert(locale === 'ja' ? 'エラー' : 'Error', locale === 'ja' ? 'コード生成に失敗しました' : 'Failed to generate code');
    }
  };

  const receiveFromCode = async () => {
    if (!receiveCode.trim()) {
      Alert.alert(
        locale === 'ja' ? 'エラー' : 'Error',
        locale === 'ja' ? 'コードを入力してください' : 'Enter a code'
      );
      return;
    }

    try {
      // 改行を除去してデコード
      const cleanCode = receiveCode.trim().replace(/\n/g, '');
      const binaryString = atob(cleanCode);
      const utf8bytes = Uint8Array.from([...binaryString].map(c => c.charCodeAt(0)));
      const jsonString = new TextDecoder().decode(utf8bytes);
      const receivedData = JSON.parse(jsonString);

      if (!receivedData.version || receivedData.version > 1) {
        Alert.alert(
          locale === 'ja' ? 'エラー' : 'Error',
          locale === 'ja' ? 'サポートされていないバージョンです' : 'Unsupported version'
        );
        return;
      }

      if (!receivedData.type || !receivedData.data) {
        Alert.alert(locale === 'ja' ? 'エラー' : 'Error', locale === 'ja' ? 'コードが無効です' : 'Invalid code');
        return;
      }

      // 受信ボックスに保存
      let inboxItems: any[] = [];
      try {
        const raw = await AsyncStorage.getItem('inbox_items');
        inboxItems = raw ? JSON.parse(raw) : [];
      } catch (e) {
        inboxItems = [];
      }

      if (receivedData.type === 'questions') {
        receivedData.data.forEach((q: any, index: number) => {
          inboxItems.push({
            id: `item_${Date.now()}_${index}`,
            type: 'question',
            data: q,
            receivedAt: Date.now(),
            senderCode: receiveCode.substring(0, 50),
          });
        });
      } else if (receivedData.type === 'folders') {
        receivedData.data.forEach((f: any, index: number) => {
          inboxItems.push({
            id: `item_${Date.now()}_${index}`,
            type: 'folder',
            data: f,
            receivedAt: Date.now(),
            senderCode: receiveCode.substring(0, 50),
          });
        });
      }

      await AsyncStorage.setItem('inbox_items', JSON.stringify(inboxItems));

      Alert.alert(
        locale === 'ja' ? '受信しました' : 'Received',
        locale === 'ja'
          ? `${receivedData.data.length}個を受信ボックスに保存しました`
          : `Saved ${receivedData.data.length} items to inbox`,
        [
          {
            text: locale === 'ja' ? '受信ボックスを開く' : 'Open Inbox',
            onPress: () => navigate('/inbox'),
          },
          {
            text: locale === 'ja' ? '閉じる' : 'Close',
            style: 'cancel',
          }
        ]
      );

      setReceiveCode('');
    } catch (error) {
      console.error('Failed to decode share code:', error);
      Alert.alert(
        locale === 'ja' ? 'エラー' : 'Error',
        locale === 'ja'
          ? 'コードが無効です。正しくコピーされているか確認してください'
          : 'Invalid code. Check if copied correctly'
      );
    }
  };

  const canGenerate = shareType === 'questions' ? selectedQuestions.length > 0 : selectedFolders.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[styles.title, { color: colors.text, flex: 1 }]}>
          🔗 {locale === 'ja' ? 'マルチ・共有' : 'Multi Share'}
        </Text>
        <TouchableOpacity
          style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
            {locale === 'ja' ? '戻る' : 'Back'}
          </Text>
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

      <ScrollView style={styles.content}>
        {shareMode === 'send' ? (
          <>
            {/* 問題 / 問題集 切り替え */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: shareType === 'questions' ? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }}
                onPress={() => { setShareType('questions'); setSelectedFolders([]); }}
              >
                <Text style={{ textAlign: 'center', color: shareType === 'questions' ? '#fff' : colors.text, fontWeight: '700' }}>
                  {locale === 'ja' ? '問題' : 'Questions'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: shareType === 'folders' ? colors.primary : colors.card, borderWidth: 1, borderColor: colors.border }}
                onPress={() => { setShareType('folders'); setSelectedQuestions([]); }}
              >
                <Text style={{ textAlign: 'center', color: shareType === 'folders' ? '#fff' : colors.text, fontWeight: '700' }}>
                  {locale === 'ja' ? '問題集' : 'Folders'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 問題一覧 */}
            {shareType === 'questions' ? (
              <>
                {questions.length === 0 && (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
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
                    <Text style={{ fontSize: 16, color: selectedQuestions.includes(q.id) ? colors.primary : colors.textSecondary }}>
                      {selectedQuestions.includes(q.id) ? '☑️' : '☐'}
                    </Text>
                    <Text style={{ flex: 1, color: colors.text, fontSize: 13 }}>{q.question?.substring(0, 50)}...</Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                {folders.length === 0 && (
                  <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>
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
                    <Text style={{ fontSize: 16, color: selectedFolders.includes(f.id) ? colors.primary : colors.textSecondary }}>
                      {selectedFolders.includes(f.id) ? '☑️' : '☐'}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>{f.name}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
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
                🔗 {locale === 'ja' ? 'コード生成' : 'Generate Code'}
              </Text>
            </TouchableOpacity>

            {/* 生成されたコード表示 */}
            {generatedCode && (
              <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 12, marginVertical: 12 }}>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                  {locale === 'ja' ? '生成されたコード:' : 'Generated Code:'}
                </Text>
                <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.text, fontSize: 11, lineHeight: 16, fontFamily: 'monospace' }}>
                    {generatedCode}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ marginTop: 8 }}
                  onPress={async () => {
                    try {
                      await navigator.clipboard.writeText(generatedCode);
                      Alert.alert(
                        locale === 'ja' ? 'コピーしました' : 'Copied',
                        locale === 'ja' ? 'クリップボードにコピーされました' : 'Copied to clipboard'
                      );
                    } catch (error) {
                      console.error('Failed to copy:', error);
                    }
                  }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700', textAlign: 'center' }}>
                    📋 {locale === 'ja' ? 'コピー' : 'Copy Code'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <>
            {/* 受信モード */}
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
              {locale === 'ja' ? 'シェアコードを貼り付け' : 'Paste share code'}
            </Text>

            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
              placeholder={locale === 'ja' ? 'コードを貼り付け' : 'Paste code here'}
              placeholderTextColor={colors.textSecondary}
              value={receiveCode}
              onChangeText={setReceiveCode}
              multiline
              numberOfLines={6}
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.primary, opacity: !receiveCode ? 0.5 : 1 }]}
              onPress={receiveFromCode}
              disabled={!receiveCode}
            >
              <Text style={[styles.buttonText, { color: onPrimary }]}>
                📥 {locale === 'ja' ? '受け取る' : 'Receive'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

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
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 12, minHeight: 100, textAlignVertical: 'top' },
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: '700', fontSize: 16 },
});
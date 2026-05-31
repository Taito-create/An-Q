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

  // アコーディオン用 state
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);

  // フォルダ関連 state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folders, setFolders] = useState<{ id: string; name: string; questionIds: number[] }[]>([]);

  // 一括タグ編集関連 state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // 問題集閲覧関連 state
  const [showFoldersView, setShowFoldersView] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string; questionIds: number[] } | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<Question[]>([]);

  useEffect(() => {
    loadQuestions();
    loadFolders();
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

  // フォルダ読み込み
  const loadFolders = async () => {
    try {
      const saved = await AsyncStorage.getItem('question_folders');
      if (saved) setFolders(JSON.parse(saved));
    } catch (e) {}
  };

  // フォルダ保存
  const saveFolders = async (newFolders: typeof folders) => {
    setFolders(newFolders);
    await AsyncStorage.setItem('question_folders', JSON.stringify(newFolders));
  };

  // フォルダ作成
  const createFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('エラー', locale === 'ja' ? '問題集名を入力してください' : 'Please enter a folder name');
      return;
    }
    const newFolder = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
      questionIds: [],
    };
    await saveFolders([...folders, newFolder]);
    setNewFolderName('');
    setShowFolderModal(false);
    Alert.alert(
      locale === 'ja' ? '成功' : 'Success',
      locale === 'ja' ? '問題集を作成しました' : 'Folder created successfully'
    );
  };

  // 一括タグ追加
  const batchAddTags = async () => {
    const newTags = batchTagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (newTags.length === 0) {
      Alert.alert('エラー', locale === 'ja' ? 'タグを入力してください' : 'Please enter tags');
      return;
    }

    const updatedQuestions = questions.map(q => {
      if (selectedQuestionIds.includes(q.id)) {
        const currentTags = q.tags || [];
        const mergedTags = [...new Set([...currentTags, ...newTags])];
        return { ...q, tags: mergedTags };
      }
      return q;
    });

    await AsyncStorage.setItem('quiz_questions', JSON.stringify(updatedQuestions));
    setQuestions(updatedQuestions);
    setShowBatchTagModal(false);
    setBatchTagInput('');
    setSelectedQuestionIds([]);
    setIsSelectionMode(false);
    Alert.alert(
      locale === 'ja' ? '成功' : 'Success',
      locale === 'ja'
        ? `選択した${selectedQuestionIds.length}問にタグを追加しました`
        : `Added tags to ${selectedQuestionIds.length} selected questions`
    );
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

      {/* ヘッダーボタン */}
      <View style={styles.headerButtons}>
        <TouchableOpacity 
          style={[styles.headerBtn, { borderColor: colors.primary }]} 
          onPress={() => setShowFoldersView(true)}
        >
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>📚 {t.folders}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.headerBtn, { borderColor: colors.primary }]} 
          onPress={() => setShowFolderModal(true)}
        >
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>📁 {t.folderCreate}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.headerBtn, { borderColor: colors.primary }]} 
          onPress={() => {
            setIsSelectionMode(!isSelectionMode);
            if (isSelectionMode) setSelectedQuestionIds([]);
          }}
        >
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>
            {isSelectionMode ? t.cancelSelection : t.batchEdit}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 一括タグ編集バー（選択モード時） */}
      {isSelectionMode && selectedQuestionIds.length > 0 && (
        <TouchableOpacity 
          style={[styles.batchTagBar, { backgroundColor: colors.primary }]} 
          onPress={() => setShowBatchTagModal(true)}
        >
          <Text style={styles.batchTagBarText}>
            📋 {t.addTagsToSelected} ({selectedQuestionIds.length}{t.questionsSelected})
          </Text>
        </TouchableOpacity>
      )}

      <ScrollView>
        {[...questions].reverse().map((item) => (
          /* 問題カード - アコーディオン形式 */
          <View key={item.id} style={[styles.card, { backgroundColor: colors.card }]}>
            {/* 選択モード時のチェックボックス */}
            {isSelectionMode && (
              <TouchableOpacity 
                onPress={() => {
                  if (selectedQuestionIds.includes(item.id)) {
                    setSelectedQuestionIds(prev => prev.filter(id => id !== item.id));
                  } else {
                    setSelectedQuestionIds(prev => [...prev, item.id]);
                  }
                }}
                style={styles.checkbox}
              >
                <Text style={styles.checkboxText}>
                  {selectedQuestionIds.includes(item.id) ? '☑' : '☐'}
                </Text>
              </TouchableOpacity>
            )}
            {/* ヘッダー部分（常に表示） */}
            <TouchableOpacity 
              style={styles.cardHeader}
              onPress={() => setExpandedQuestionId(expandedQuestionId === item.id ? null : item.id)}
            >
              <View style={styles.cardHeaderLeft}>
                <Text style={[styles.typeBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>
                  {item.answerType === 'multiple' ? t.multiple : item.answerType === 'truefalse' ? t.truefalse : t.descriptive}
                </Text>
                <Text style={[styles.questionPreview, { color: colors.text }]} numberOfLines={1}>
                  {item.question}
                </Text>
              </View>
              <Text style={[styles.expandIcon, { color: colors.primary }]}>
                {expandedQuestionId === item.id ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {/* 展開時のみ表示（詳細） */}
            {expandedQuestionId === item.id && (
              <View style={styles.expandedContent}>
                <Text style={[styles.fullQuestion, { color: colors.text }]}>{item.question}</Text>
                
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
                
                {/* アクションボタン */}
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => {
                    setShowAnswerId(showAnswerId === item.id ? null : item.id);
                  }}>
                    <Text style={[styles.answerBtnText, { color: colors.primary }]}>
                      {showAnswerId === item.id ? t.hide : t.showAnswer}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => startEditTags(item)}>
                    <Text style={[styles.editTagBtnText, { color: colors.primary }]}>{t.editTags}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteRequest(item.id)}>
                    <Text style={[styles.deleteText, { color: colors.error }]}>{t.deleteAction}</Text>
                  </TouchableOpacity>
                </View>
                
                {/* 回答表示 */}
                {showAnswerId === item.id && (
                  <View style={[styles.answerBox, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                    <Text style={[styles.answerLabel, { color: colors.success }]}>{t.answerDisplay}:</Text>
                    <Text style={[styles.answerText, { color: colors.text }]}>{getAnswerText(item)}</Text>
                  </View>
                )}
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

      {/* フォルダ作成モーダル */}
      <Modal visible={showFolderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.folderCreate}</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder={t.folderName}
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowFolderModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={createFolder}
              >
                <Text style={styles.modalSaveText}>{t.createFolder}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 一括タグ追加モーダル */}
      <Modal visible={showBatchTagModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.batchAddTags}</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]}
              value={batchTagInput}
              onChangeText={setBatchTagInput}
              placeholder={t.enterTagsComma}
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowBatchTagModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={batchAddTags}
              >
                <Text style={styles.modalSaveText}>{t.saveTags}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 問題集一覧モーダル */}
      <Modal visible={showFoldersView} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.foldersModalContainer, { backgroundColor: colors.card }]}>
            <View style={styles.foldersModalHeader}>
              <Text style={[styles.foldersModalTitle, { color: colors.text }]}>📚 {t.folders}</Text>
              <TouchableOpacity onPress={() => { setShowFoldersView(false); setSelectedFolder(null); }}>
                <Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              {folders.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noFolders}</Text>
              ) : (
                folders.map(folder => {
                  const folderQuestionCount = folder.questionIds.length;
                  return (
                    <TouchableOpacity 
                      key={folder.id} 
                      style={[styles.folderItem, { borderBottomColor: colors.border }]}
                      onPress={() => {
                        const questionsInFolder = questions.filter(q => folder.questionIds.includes(q.id));
                        setFolderQuestions(questionsInFolder);
                        setSelectedFolder(folder);
                      }}
                    >
                      <View style={styles.folderInfo}>
                        <Text style={[styles.folderIcon, { color: colors.primary }]}>📁</Text>
                        <View>
                          <Text style={[styles.folderName, { color: colors.text }]}>{folder.name}</Text>
                          <Text style={[styles.folderCount, { color: colors.textSecondary }]}>{folderQuestionCount}問</Text>
                        </View>
                      </View>
                      <View style={styles.folderRightActions}>
                        {/* 問題集を削除するボタン */}
                        <TouchableOpacity 
                          onPress={(e) => { e.stopPropagation(); Alert.alert(
                            locale === 'ja' ? '削除確認' : 'Delete Confirmation',
                            locale === 'ja' ? `「${folder.name}」を削除しますか？` : `Delete "${folder.name}"?`,
                            [
                              { text: t.cancel, style: 'cancel' },
                              { text: t.deleteAction, style: 'destructive', onPress: () => {
                                const updatedFolders = folders.filter(f => f.id !== folder.id);
                                saveFolders(updatedFolders);
                              }}
                            ]
                          ); }}
                          style={styles.folderActionIcon}
                        >
                          <Text style={[styles.folderActionIconText, { color: colors.error }]}>🗑</Text>
                        </TouchableOpacity>
                        <Text style={[styles.folderArrow, { color: colors.primary }]}>›</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 問題集の中身を表示するモーダル */}
      <Modal visible={!!selectedFolder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.folderDetailContainer, { backgroundColor: colors.card }]}>
            <View style={styles.folderDetailHeader}>
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>📁 {selectedFolder?.name}</Text>
              <TouchableOpacity onPress={() => { setSelectedFolder(null); setFolderQuestions([]); }}>
                <Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              {folderQuestions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noQuestionsInFolder}</Text>
              ) : (
                folderQuestions.map(question => (
                  <View key={question.id} style={[styles.folderQuestionItem, { borderBottomColor: colors.border }]}>
                    <View style={styles.folderQuestionContent}>
                      <Text style={[styles.folderQuestionText, { color: colors.text }]} numberOfLines={2}>
                        {question.question}
                      </Text>
                      <View style={styles.folderQuestionActions}>
                        <TouchableOpacity 
                          style={[styles.folderActionBtn, { borderColor: colors.primary }]}
                          onPress={() => {
                            Alert.alert('回答', getAnswerText(question));
                          }}
                        >
                          <Text style={[styles.folderActionBtnText, { color: colors.primary }]}>{t.showAnswer}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.folderActionBtn, { borderColor: colors.error }]}
                          onPress={() => {
                            const updatedFolders = folders.map(f => {
                              if (f.id === selectedFolder?.id) {
                                return { ...f, questionIds: f.questionIds.filter(id => id !== question.id) };
                              }
                              return f;
                            });
                            saveFolders(updatedFolders);
                            setFolderQuestions(prev => prev.filter(q => q.id !== question.id));
                            Alert.alert('完了', '問題集から除外しました');
                          }}
                        >
                          <Text style={[styles.folderActionBtnText, { color: colors.error }]}>{t.removeFromFolder}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            
            {/* 問題集に問題を追加するバー */}
            {isSelectionMode && selectedQuestionIds.length > 0 && selectedFolder && (
              <TouchableOpacity 
                style={[styles.addToFolderBar, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  const updatedFolders = folders.map(f => {
                    if (f.id === selectedFolder?.id) {
                      const newIds = [...new Set([...f.questionIds, ...selectedQuestionIds])];
                      return { ...f, questionIds: newIds };
                    }
                    return f;
                  });
                  await saveFolders(updatedFolders);
                  const updatedQuestions = questions.filter(q => updatedFolders.find(f => f.id === selectedFolder?.id)?.questionIds.includes(q.id));
                  setFolderQuestions(updatedQuestions);
                  setSelectedQuestionIds([]);
                  setIsSelectionMode(false);
                  Alert.alert('完了', '選択した問題を問題集に追加しました');
                }}
              >
                <Text style={styles.addToFolderBarText}>
                  ➕ 選択した{selectedQuestionIds.length}問を「{selectedFolder?.name}」に追加
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F5F7FA', paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  card: { backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  cardHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questionPreview: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  expandIcon: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  fullQuestion: {
    fontSize: 16,
    fontWeight: '500',
  },
  typeBadge: { fontSize: 12, color: '#007AFF', fontWeight: 'bold', backgroundColor: '#E1EFFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 6, marginLeft: 'auto' },
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
  // 追加スタイル
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 16,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkbox: {
    marginRight: 12,
    padding: 4,
  },
  checkboxText: {
    fontSize: 20,
  },
  batchTagBar: {
    marginVertical: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  batchTagBarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // 問題集一覧モーダル
  foldersModalContainer: {
    width: '90%',
    maxWidth: 500,
    padding: 24,
    borderRadius: 16,
    maxHeight: '80%',
  },
  foldersModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  foldersModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: 4,
  },
  folderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  folderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  folderIcon: {
    fontSize: 24,
  },
  folderName: {
    fontSize: 16,
    fontWeight: '500',
  },
  folderCount: {
    fontSize: 12,
    marginTop: 2,
  },
  folderArrow: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  folderRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  folderActionIcon: {
    padding: 6,
    borderRadius: 6,
  },
  folderActionIconText: {
    fontSize: 18,
  },
  // 問題集詳細モーダル
  folderDetailContainer: {
    width: '90%',
    maxWidth: 500,
    padding: 24,
    borderRadius: 16,
    maxHeight: '80%',
  },
  folderDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  folderDetailTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  folderQuestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  folderQuestionContent: {
    gap: 8,
  },
  folderQuestionText: {
    fontSize: 15,
    lineHeight: 22,
  },
  folderQuestionActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  folderActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  folderActionBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  addToFolderBar: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addToFolderBarText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
});

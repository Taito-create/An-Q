import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Platform, TextInput, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

// 共通の型定義
interface ImageAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

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
  image?: string | null;
  imageAnnotations?: ImageAnnotation[];
}

export default function BrowseQuestionsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [showFolderAnswerId, setShowFolderAnswerId] = useState<number | null>(null);

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
  const [isCompactMode, setIsCompactMode] = useState(false);

  // 問題集閲覧関連 state
  const [showFoldersView, setShowFoldersView] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string; questionIds: number[] } | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<Question[]>([]);

  // タグ絞り込み用 state
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showTagFilterModal, setShowTagFilterModal] = useState(false);

  // 問題集削除モード用 state
  const [isFolderDeleteMode, setIsFolderDeleteMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // 問題追加用モーダルの state
  const [showAddToFolderModal, setShowAddToFolderModal] = useState(false);
  const [selectedFolderForAdd, setSelectedFolderForAdd] = useState<{ id: string; name: string; questionIds: number[] } | null>(null);
  const [availableQuestionsForAdd, setAvailableQuestionsForAdd] = useState<Question[]>([]);
  const [selectedQuestionIdsForAdd, setSelectedQuestionIdsForAdd] = useState<number[]>([]);

  // 問題編集用 state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingQuestionFull, setEditingQuestionFull] = useState<Question | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editAnswerText, setEditAnswerText] = useState('');
  const [editTrueFalseAnswer, setEditTrueFalseAnswer] = useState(true);
  const [editMultipleOptions, setEditMultipleOptions] = useState<string[]>(['', '', '', '']);
  const [editMultipleCorrect, setEditMultipleCorrect] = useState(0);

  useEffect(() => {
    loadQuestions();
    loadFolders();
  }, [location.key]);

  const loadQuestions = async () => {
    try {
      const data = await AsyncStorage.getItem('quiz_questions');
      if (data) {
        const allQuestions: Question[] = JSON.parse(data);
        const filteredQuestions = allQuestions.filter((q: any) => {
          if (!q.answerType) {
            return false;
          }
          return true;
        });
        setQuestions(filteredQuestions);
        // 利用可能なタグ一覧を抽出
        const tags = new Set<string>();
        filteredQuestions.forEach(q => q.tags?.forEach(t => tags.add(t)));
        setAvailableTags(Array.from(tags).sort());
      }
    } catch (e) {
      console.error('Failed to load questions.');
    }
  };

  const openFolderDetail = (folder: { id: string; name: string; questionIds: number[] }) => {
    const questionsInFolder = questions.filter(q => folder.questionIds.includes(q.id));
    setFolderQuestions(questionsInFolder);
    setSelectedFolder(folder);
  };

  // フィルタリングされた問題を取得
  const getFilteredQuestions = (): Question[] => {
    let filtered = questions;
    if (selectedFilterTag) {
      filtered = filtered.filter(q => q.tags && q.tags.includes(selectedFilterTag));
    }
    return filtered;
  };

  // 選択した問題集を一括削除（AsyncStorageから直接読み込み）
  const executeDeleteSelectedFolders = async () => {
    try {
      const updatedFolders = folders.filter(f => !selectedFolderIds.includes(f.id));
      await AsyncStorage.setItem('question_folders', JSON.stringify(updatedFolders));
      setFolders(updatedFolders);
      setSelectedFolderIds([]);
      setIsFolderDeleteMode(false);
      setShowDeleteConfirmModal(false);
    } catch (error) {
      console.error('削除エラー:', error);
    }
  };

  // 問題集削除（AsyncStorageから直接読み込み）
  const deleteFolderById = async (folderId: string) => {
    Alert.alert(
      '確認',
      'この問題集を削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              const savedFolders = await AsyncStorage.getItem('question_folders');
              const currentFolders = savedFolders ? JSON.parse(savedFolders) : [];
              const updatedFolders = currentFolders.filter((f: any) => f.id !== folderId);
              await AsyncStorage.setItem('question_folders', JSON.stringify(updatedFolders));
              setFolders(updatedFolders);
              Alert.alert('完了', '問題集を削除しました');
            } catch (error) {
              console.error('削除エラー:', error);
              Alert.alert('エラー', '削除に失敗しました');
            }
          }
        }
      ]
    );
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
      Alert.alert('エラー', '問題集名を入力してください');
      return;
    }
    const newFolder = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
      name: newFolderName.trim(),
      questionIds: [],
    };
    const updatedFolders = [...folders, newFolder];
    await saveFolders(updatedFolders);
    setNewFolderName('');
    setShowFolderModal(false);
    setShowFoldersView(true);  // 作成後に一覧へ戻る
    Alert.alert('成功', '問題集を作成しました');
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

  // タグを保存（タグ一覧もリアルタイム更新）
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

      // タグ一覧を更新
      const tagSet = new Set<string>();
      updatedQuestions.forEach(q => {
        (q.tags || []).forEach(tag => tagSet.add(tag));
      });
      setAvailableTags(Array.from(tagSet).sort());

      // 現在のフィルタータグが削除された場合は解除
      if (selectedFilterTag && !tagSet.has(selectedFilterTag)) {
        setSelectedFilterTag(null);
      }

      setShowTagModal(false);
      setEditingQuestion(null);
      SoundManager.play('complete');
      Alert.alert(t.success, locale === 'ja' ? 'タグを更新しました' : 'Tags updated');
    } catch (e) {
      console.error('Failed to save tags:', e);
      Alert.alert(t.error, t.failedToSave);
    }
  };

  // 問題編集を開始
  const startEditQuestion = (question: Question) => {
    setEditingQuestionFull(question);
    setEditQuestionText(question.question);
    setEditAnswerText(question.descriptiveAnswer || '');
    setEditTrueFalseAnswer(question.trueFalseAnswer ?? true);
    setEditMultipleOptions(question.multipleChoice?.options || ['', '', '', '']);
    setEditMultipleCorrect(question.multipleChoice?.correctAnswer ?? 0);
    setShowEditModal(true);
  };

  // 問題編集を保存
  const saveEditedQuestion = async () => {
    if (!editingQuestionFull || !editQuestionText.trim()) return;

    const updated: Question = {
      ...editingQuestionFull,
      question: editQuestionText.trim(),
      descriptiveAnswer: editingQuestionFull.answerType === 'descriptive' ? editAnswerText.trim() : editingQuestionFull.descriptiveAnswer,
      trueFalseAnswer: editingQuestionFull.answerType === 'truefalse' ? editTrueFalseAnswer : editingQuestionFull.trueFalseAnswer,
      multipleChoice: editingQuestionFull.answerType === 'multiple'
        ? { options: editMultipleOptions, correctAnswer: editMultipleCorrect }
        : editingQuestionFull.multipleChoice,
    };

    const updatedQuestions = questions.map(q => q.id === updated.id ? updated : q);
    await AsyncStorage.setItem('quiz_questions', JSON.stringify(updatedQuestions));
    setQuestions(updatedQuestions);
    setShowEditModal(false);
    setEditingQuestionFull(null);
    SoundManager.play('complete');
  };

  // 回答表示関数（AsyncStorageから最新データを直接取得）
  const showAnswerForQuestion = async (questionId: number) => {
    try {
      const savedQuestions = await AsyncStorage.getItem('quiz_questions');
      if (savedQuestions) {
        const allQuestions = JSON.parse(savedQuestions);
        const question = allQuestions.find((q: any) => q.id === questionId);
        if (question) {
          let answerText = '';
          switch (question.answerType) {
            case 'truefalse':
              answerText = question.trueFalseAnswer ? '○' : '✕';
              break;
            case 'multiple':
              const correctIdx = question.multipleChoice?.correctAnswer ?? 0;
              answerText = question.multipleChoice?.options[correctIdx] || '';
              break;
            case 'descriptive':
              answerText = question.descriptiveAnswer || '';
              break;
            default:
              answerText = '回答が見つかりません';
          }
          Alert.alert('回答', answerText);
        } else {
          Alert.alert('回答', '問題が見つかりません');
        }
      }
    } catch (error) {
      console.error('回答表示エラー:', error);
      Alert.alert('エラー', '回答の取得に失敗しました');
    }
  };

  // 回答テキストを取得（useCallback でメモ化）
  const getAnswerText = useCallback((item: Question): string => {
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
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>{t.manageQuestions}</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.countBadgeText}>{getFilteredQuestions().length}</Text>
        </View>
        {selectedFilterTag && (
          <TouchableOpacity 
            style={[styles.filterActiveBadge, { backgroundColor: colors.primary + '20' }]}
            onPress={() => setSelectedFilterTag(null)}
          >
            <Text style={[styles.filterActiveBadgeText, { color: colors.primary }]}>🏷️ {selectedFilterTag} ✕</Text>
          </TouchableOpacity>
        )}
        {/* コンパクト切り替えをタイトル行右端に配置 */}
        <TouchableOpacity
          style={[styles.compactToggleBtn, { backgroundColor: isCompactMode ? colors.primary : colors.primary + '20' }]}
          onPress={() => {
            setIsCompactMode(!isCompactMode);
            if (isCompactMode) setExpandedQuestionId(null);
          }}
        >
          <Text style={[styles.compactToggleBtnText, { color: isCompactMode ? '#fff' : colors.primary }]}>
            {isCompactMode ? '≡' : '☰'}
          </Text>
        </TouchableOpacity>
        {/* 右上の戻るボタン */}
        <TouchableOpacity
          style={[styles.topBackBtn, { backgroundColor: colors.primary }]}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={styles.topBackBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ヘッダーボタン - スクロール可能に */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.headerButtonsScroll}
        contentContainerStyle={styles.headerButtons}
      >
        <TouchableOpacity 
          style={[styles.headerBtn, { borderColor: colors.primary }]} 
          onPress={() => setShowFoldersView(true)}
        >
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>📚 {t.folders}</Text>
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
        
        {availableTags.length > 0 && (
          <TouchableOpacity 
            style={[styles.headerBtn, { borderColor: colors.primary, backgroundColor: selectedFilterTag ? colors.primary + '20' : 'transparent' }]} 
            onPress={() => setShowTagFilterModal(true)}
          >
            <Text style={[styles.headerBtnText, { color: colors.primary }]}>
              🏷️ {selectedFilterTag ? selectedFilterTag : '全問'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

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
        {[...getFilteredQuestions()].reverse().map((item) => (
          /* 問題カード - アコーディオン形式 */
          <View key={item.id} style={[styles.card, { backgroundColor: colors.card }, isCompactMode && styles.cardCompact]}>
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
              style={[styles.cardHeader, isCompactMode && styles.cardHeaderCompact]}
              onPress={() => {
                if (!isCompactMode) {
                  setExpandedQuestionId(expandedQuestionId === item.id ? null : item.id);
                }
              }}
            >
              <View style={styles.cardHeaderLeft}>
                {!isCompactMode && (
                  <Text style={[styles.typeBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>
                    {item.answerType === 'multiple' ? t.multiple : item.answerType === 'truefalse' ? t.truefalse : t.descriptive}
                  </Text>
                )}
                <Text 
                  style={[
                    styles.questionPreview, 
                    { color: colors.text },
                    isCompactMode && styles.questionPreviewCompact
                  ]} 
                  numberOfLines={isCompactMode ? 1 : 2}
                >
                  {item.question}
                </Text>
              </View>
            {/* 画像サムネイルがある場合は表示 */}
            {item.image && (
              <View style={[{ marginRight: 8, borderRadius: 6, overflow: 'hidden', width: 40, height: 40 }]}>
                <img
                  src={item.image}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </View>
            )}
            {/* コンパクトモード時は展開アイコンを非表示 */}
          {!isCompactMode && (
            <Text style={[styles.expandIcon, { color: colors.primary }]}>
              {expandedQuestionId === item.id ? '▲' : '▼'}
            </Text>
          )}
        </TouchableOpacity>

            {/* 展開時のみ表示（コンパクトモードでは非表示） */}
            {!isCompactMode && expandedQuestionId === item.id && (
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
                  <TouchableOpacity onPress={() => startEditQuestion(item)}>
                    <Text style={[styles.editTagBtnText, { color: colors.primary }]}>✏️ 編集</Text>
                  </TouchableOpacity>
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

      {/* 問題文・回答 編集モーダル */}
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContainer, { backgroundColor: colors.card, width: '95%', maxWidth: 560, maxHeight: '90%' }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>✏️ 問題を編集</Text>

              {/* 問題文 */}
              <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6 }]}>問題文</Text>
              <TextInput
                style={[styles.modalInput, { borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: 'top' }]}
                value={editQuestionText}
                onChangeText={setEditQuestionText}
                placeholder="問題文を入力"
                placeholderTextColor={colors.textSecondary}
                multiline
              />

              {/* 回答（記述式） */}
              {editingQuestionFull?.answerType === 'descriptive' && (
                <>
                  <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6 }]}>回答</Text>
                  <TextInput
                    style={[styles.modalInput, { borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: 'top' }]}
                    value={editAnswerText}
                    onChangeText={setEditAnswerText}
                    placeholder="回答を入力"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                </>
              )}

              {/* 回答（○×） */}
              {editingQuestionFull?.answerType === 'truefalse' && (
                <>
                  <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>回答</Text>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                    <TouchableOpacity
                      style={[styles.modalCancelBtn, { flex: 1, backgroundColor: editTrueFalseAnswer ? colors.success : 'transparent', borderColor: colors.success }]}
                      onPress={() => setEditTrueFalseAnswer(true)}
                    >
                      <Text style={[styles.modalCancelText, { color: editTrueFalseAnswer ? '#fff' : colors.success, fontSize: 20 }]}>○</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalCancelBtn, { flex: 1, backgroundColor: !editTrueFalseAnswer ? colors.error : 'transparent', borderColor: colors.error }]}
                      onPress={() => setEditTrueFalseAnswer(false)}
                    >
                      <Text style={[styles.modalCancelText, { color: !editTrueFalseAnswer ? '#fff' : colors.error, fontSize: 20 }]}>×</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* 回答（四択） */}
              {editingQuestionFull?.answerType === 'multiple' && (
                <>
                  <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>選択肢</Text>
                  {editMultipleOptions.map((opt, i) => (
                    <TextInput
                      key={i}
                      style={[styles.modalInput, { borderColor: editMultipleCorrect === i ? colors.success : colors.border, color: colors.text }]}
                      value={opt}
                      onChangeText={text => {
                        const newOpts = [...editMultipleOptions];
                        newOpts[i] = text;
                        setEditMultipleOptions(newOpts);
                      }}
                      placeholder={`選択肢 ${i + 1}${editMultipleCorrect === i ? ' ✓ 正解' : ''}`}
                      placeholderTextColor={editMultipleCorrect === i ? colors.success : colors.textSecondary}
                    />
                  ))}
                  <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>正解番号</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                    {[0, 1, 2, 3].map(i => (
                      <TouchableOpacity
                        key={i}
                        style={[styles.modalCancelBtn, { flex: 1, backgroundColor: editMultipleCorrect === i ? colors.success : 'transparent', borderColor: colors.success }]}
                        onPress={() => setEditMultipleCorrect(i)}
                      >
                        <Text style={[styles.modalCancelText, { color: editMultipleCorrect === i ? '#fff' : colors.success }]}>{i + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                  onPress={() => { setShowEditModal(false); setEditingQuestionFull(null); }}
                >
                  <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                  onPress={saveEditedQuestion}
                >
                  <Text style={styles.modalSaveText}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

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
                onPress={() => { setShowFolderModal(false); setShowFoldersView(true); }}
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
            
            {/* 選択中の問題の既存タグを表示 */}
            {(() => {
              const existingTags = new Set<string>();
              questions
                .filter(q => selectedQuestionIds.includes(q.id))
                .forEach(q => (q.tags || []).forEach(tag => existingTags.add(tag)));
              const tagArray = Array.from(existingTags);
              if (tagArray.length === 0) return null;
              return (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }]}>
                    選択中の問題の既存タグ:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {tagArray.map(tag => (
                      <View key={tag} style={[styles.miniTag, { backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 6 }]}>
                        <Text style={[styles.miniTagText, { color: colors.primary, fontSize: 13, fontWeight: 'bold' }]}>🏷️ {tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

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
              <View style={styles.foldersModalActions}>
                {/* 問題集作成ボタン */}
                <TouchableOpacity
                  style={[styles.folderHeaderActionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    setNewFolderName('');
                    setShowFoldersView(false);   // 一覧を閉じてから
                    setShowFolderModal(true);    // 作成を開く
                  }}
                >
                  <Text style={styles.folderHeaderActionBtnText}>＋ 作成</Text>
                </TouchableOpacity>

                {/* 削除モード切り替えボタン */}
                <TouchableOpacity
                  style={[styles.folderHeaderActionBtn, { 
                    backgroundColor: isFolderDeleteMode ? colors.error : colors.error + '20',
                    borderWidth: 1,
                    borderColor: colors.error,
                  }]}
                  onPress={() => {
                    setIsFolderDeleteMode(!isFolderDeleteMode);
                    if (isFolderDeleteMode) setSelectedFolderIds([]);
                  }}
                >
                  <Text style={[styles.folderHeaderActionBtnText, { color: isFolderDeleteMode ? '#fff' : colors.error }]}>
                    {isFolderDeleteMode ? `削除(${selectedFolderIds.length})` : '🗑️ 削除'}
                  </Text>
                </TouchableOpacity>

                {/* 削除実行ボタン（削除モードで1件以上選択時のみ） */}
                {isFolderDeleteMode && selectedFolderIds.length > 0 && (
                  <TouchableOpacity
                    style={[styles.folderHeaderActionBtn, { backgroundColor: colors.error }]}
                    onPress={() => setShowDeleteConfirmModal(true)}
                  >
                    <Text style={styles.folderHeaderActionBtnText}>実行</Text>
                  </TouchableOpacity>
                )}

                {/* 閉じるボタン */}
                <TouchableOpacity onPress={() => { 
                  setShowFoldersView(false); 
                  setSelectedFolder(null); 
                  setIsFolderDeleteMode(false); 
                  setSelectedFolderIds([]); 
                }}>
                  <Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView>
              {folders.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noFolders}</Text>
              ) : (
                folders.map(folder => {
                  const folderQuestionCount = folder.questionIds.length;
                  const isSelected = selectedFolderIds.includes(folder.id);
                  return (
                    <View key={folder.id} style={[styles.folderItem, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.error + '10' }]}>
                      {/* 削除モード時はチェックボックスを表示 */}
                      {isFolderDeleteMode && (
                        <TouchableOpacity 
                          onPress={() => {
                            setSelectedFolderIds(prev =>
                              prev.includes(folder.id) ? prev.filter(id => id !== folder.id) : [...prev, folder.id]
                            );
                          }}
                          style={styles.checkbox}
                        >
                          <Text style={[styles.checkboxText, { color: colors.primary }]}>
                            {isSelected ? '☑' : '☐'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      
                      <TouchableOpacity 
                        style={styles.folderInfo}
                        onPress={() => {
                          if (!isFolderDeleteMode) {
                            openFolderDetail(folder);
                          }
                        }}
                      >
                        <Text style={[styles.folderIcon, { color: colors.primary }]}>📁</Text>
                        <View>
                          <Text style={[styles.folderName, { color: colors.text }]}>{folder.name}</Text>
                          <Text style={[styles.folderCount, { color: colors.textSecondary }]}>{folderQuestionCount}問</Text>
                        </View>
                      </TouchableOpacity>
                      
                      {/* 大きくした矢印ボタン */}
                      <TouchableOpacity 
                        style={styles.folderArrowBtn}
                        onPress={() => openFolderDetail(folder)}
                      >
                        <Text style={[styles.folderArrow, { color: colors.primary }]}>›</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 問題集削除確認モーダル */}
      <Modal visible={showDeleteConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              🗑️ {selectedFolderIds.length}個の問題集を削除しますか？
            </Text>
            <Text style={[{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 13 }]}>
              この操作は取り消せません
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowDeleteConfirmModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.error }]}
                onPress={executeDeleteSelectedFolders}
              >
                <Text style={styles.modalSaveText}>削除する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* タグ絞り込みモーダル */}
      <Modal visible={showTagFilterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>🏷️ {t.filterByTags || 'タグで絞り込み'}</Text>
            <ScrollView style={styles.tagFilterList}>
              <TouchableOpacity 
                style={[styles.tagFilterChip, selectedFilterTag === null && { backgroundColor: colors.primary }]}
                onPress={() => { setSelectedFilterTag(null); setShowTagFilterModal(false); }}
              >
                <Text style={[styles.tagFilterChipText, selectedFilterTag === null && { color: '#fff' }]}>
                  📋 {locale === 'ja' ? '全問' : 'All'}
                </Text>
              </TouchableOpacity>
              {availableTags.map(tag => (
                <TouchableOpacity 
                  key={tag} 
                  style={[styles.tagFilterChip, selectedFilterTag === tag && { backgroundColor: colors.primary }]}
                  onPress={() => { setSelectedFilterTag(tag); setShowTagFilterModal(false); }}
                >
                  <Text style={[styles.tagFilterChipText, selectedFilterTag === tag && { color: '#fff' }]}>🏷️ {tag}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 問題追加モーダル */}
      <Modal visible={showAddToFolderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.folderDetailContainer, { backgroundColor: colors.card }]}>
            <View style={styles.folderDetailHeader}>
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>
                ➕ {selectedFolderForAdd?.name} に問題を追加
              </Text>
              <TouchableOpacity onPress={() => { setShowAddToFolderModal(false); setSelectedFolderForAdd(null); setSelectedQuestionIdsForAdd([]); }}>
                <Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView>
              {availableQuestionsForAdd.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>追加できる問題がありません</Text>
              ) : (
                availableQuestionsForAdd.map(question => (
                  <TouchableOpacity 
                    key={question.id} 
                    style={[styles.questionSelectItem, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      setSelectedQuestionIdsForAdd(prev =>
                        prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]
                      );
                    }}
                  >
                    <Text style={[styles.checkboxText, { color: colors.primary }]}>
                      {selectedQuestionIdsForAdd.includes(question.id) ? '☑' : '☐'}
                    </Text>
                    <Text style={[styles.questionSelectText, { color: colors.text }]} numberOfLines={2}>
                      {question.question}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            
            {selectedQuestionIdsForAdd.length > 0 && (
              <TouchableOpacity 
                style={[styles.addToFolderBar, { backgroundColor: colors.primary }]}
                onPress={async () => {
                  if (selectedFolderForAdd) {
                    const updatedFolders = folders.map(f => {
                      if (f.id === selectedFolderForAdd.id) {
                        const newIds = [...new Set([...f.questionIds, ...selectedQuestionIdsForAdd])];
                        return { ...f, questionIds: newIds };
                      }
                      return f;
                    });
                    await saveFolders(updatedFolders);
                    setSelectedQuestionIdsForAdd([]);
                    setShowAddToFolderModal(false);
                    Alert.alert('完了', `${selectedQuestionIdsForAdd.length}問を追加しました`);
                  }
                }}
              >
                <Text style={styles.addToFolderBarText}>
                  ➕ 選択した{selectedQuestionIdsForAdd.length}問を追加
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* 問題集の中身を表示するモーダル */}
      <Modal visible={!!selectedFolder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.folderDetailContainer, { backgroundColor: colors.card }]}>
            <View style={styles.folderDetailHeader}>
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>📁 {selectedFolder?.name}</Text>
              <TouchableOpacity onPress={() => { setSelectedFolder(null); setFolderQuestions([]); setShowFolderAnswerId(null); }}>
                <Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* 問題集に含まれていない問題を表示して追加できるセクション */}
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              📋 追加可能な問題
            </Text>
            <ScrollView style={styles.addableQuestionsList}>
              {questions.filter(q => !selectedFolder?.questionIds.includes(q.id)).length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>追加できる問題がありません</Text>
              ) : (
                questions.filter(q => !selectedFolder?.questionIds.includes(q.id)).map(question => (
                  <TouchableOpacity 
                    key={question.id} 
                    style={[styles.addableQuestionItem, { borderBottomColor: colors.border }]}
                    onPress={async () => {
                      if (!selectedFolder) return;

                      // 重複を防いで新しい questionIds を作る
                      const newQuestionIds = [...new Set([...selectedFolder.questionIds, question.id])];

                      // folders state と AsyncStorage を更新
                      const updatedFolders = folders.map(f =>
                        f.id === selectedFolder.id ? { ...f, questionIds: newQuestionIds } : f
                      );
                      await saveFolders(updatedFolders);

                      // selectedFolder も同期して更新
                      const updatedFolder = { ...selectedFolder, questionIds: newQuestionIds };
                      setSelectedFolder(updatedFolder);

                      // folderQuestions も同期
                      setFolderQuestions(questions.filter(q => newQuestionIds.includes(q.id)));
                    }}
                  >
                    <Text style={[styles.addableQuestionText, { color: colors.text }]} numberOfLines={2}>
                      {question.question}
                    </Text>
                    <Text style={[styles.addButton, { color: colors.primary }]}>+ 追加</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={styles.divider} />

            {/* 問題集に含まれている問題一覧 */}
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
              📖 この問題集の問題
            </Text>
            <ScrollView style={styles.folderQuestionsList}>
              {folderQuestions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>{t.noQuestionsInFolder}</Text>
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
                          onPress={() => setShowFolderAnswerId(showFolderAnswerId === question.id ? null : question.id)}
                        >
                          <Text style={[styles.folderActionBtnText, { color: colors.primary }]}>
                            {showFolderAnswerId === question.id ? '隠す' : t.showAnswer}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.folderActionBtn, { borderColor: colors.error }]}
                          onPress={async () => {
                            if (!selectedFolder) return;

                            const newQuestionIds = selectedFolder.questionIds.filter(id => id !== question.id);
                            const updatedFolders = folders.map(f =>
                              f.id === selectedFolder.id ? { ...f, questionIds: newQuestionIds } : f
                            );
                            await saveFolders(updatedFolders);

                            // selectedFolder を同期（除外後にも追加可能欄を正しく更新するため）
                            setSelectedFolder({ ...selectedFolder, questionIds: newQuestionIds });
                            setFolderQuestions(prev => prev.filter(q => q.id !== question.id));
                          }}
                        >
                          <Text style={[styles.folderActionBtnText, { color: colors.error }]}>− 除外</Text>
                        </TouchableOpacity>
                      </View>
                      {showFolderAnswerId === question.id && (
                        <View style={[styles.answerBox, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                          <Text style={[styles.answerLabel, { color: colors.success }]}>{t.answerDisplay}:</Text>
                          <Text style={[styles.answerText, { color: colors.text }]}>{getAnswerText(question)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F5F7FA', paddingTop: 60 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
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
  headerButtonsScroll: {
    marginBottom: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 4,
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
  foldersModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  confirmDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  confirmDeleteBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  folderArrowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 4,
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
  // タグ絞り込み用スタイル
  tagFilterList: {
    maxHeight: 400,
  },
  tagFilterChip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  tagFilterChipText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // 問題選択用スタイル
  questionSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  questionSelectText: {
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: 'bold',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  addableQuestionsList: {
    maxHeight: 200,
    marginHorizontal: 16,
  },
  addableQuestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  addableQuestionText: {
    flex: 1,
    fontSize: 13,
    marginRight: 10,
  },
  addButton: {
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 12,
  },
  folderQuestionsList: {
    maxHeight: 300,
    marginHorizontal: 16,
  },
  addQuestionBtn: {
    margin: 12,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  addQuestionBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  deleteFolderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  deleteFolderBtnText: {
    color: '#fff',
    fontSize: 12,
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
  folderHeaderActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderHeaderActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16, paddingTop: 16 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  filterActiveBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  filterActiveBadgeText: { fontSize: 12, fontWeight: 'bold' },
  cardCompact: {
    marginVertical: 1,
    borderRadius: 6,
    padding: 0,
  },
  cardHeaderCompact: {
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  questionPreviewCompact: {
    fontSize: 11,
    lineHeight: 14,
  },
  compactToggleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  compactToggleBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  topBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  topBackBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
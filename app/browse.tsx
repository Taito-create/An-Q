import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { SoundManager } from './sound';
import { useTheme } from './theme';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { STORAGE_KEYS } from './constants/storageKeys';
import { Question, Folder, ImageAnnotation } from './types/question';
import { getAnswerText, showAnswerAlert } from './utils/answerUtils';
import { useQuestions } from './hooks/useQuestions';
import './browse.css';

export default function BrowseQuestionsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const { questions, setQuestions, loading, deleteQuestion, updateQuestion, addTagToQuestions } = useQuestions();

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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // 一括タグ編集関連 state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [batchTagInput, setBatchTagInput] = useState('');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState(false);

  // 問題集閲覧関連 state
  const [showFoldersView, setShowFoldersView] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<Question[]>([]);
  const [isFolderBatchMode, setIsFolderBatchMode] = useState(false);
  const [selectedFolderQuestionIds, setSelectedFolderQuestionIds] = useState<number[]>([]);

  // タグ絞り込み用 state
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showTagFilterModal, setShowTagFilterModal] = useState(false);

  // 問題集削除モード用 state
  const [isFolderDeleteMode, setIsFolderDeleteMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // 問題削除確認モーダル用 state（Web では Alert が動作しないため独自モーダルを使用）
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showQuestionDeleteModal, setShowQuestionDeleteModal] = useState(false);

  // 問題追加用モーダルの state
  const [showAddToFolderModal, setShowAddToFolderModal] = useState(false);
  const [selectedFolderForAdd, setSelectedFolderForAdd] = useState<Folder | null>(null);
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

  // タグ一覧更新（questions 変更時に実行）
  useEffect(() => {
    const tags = new Set<string>();
    questions.forEach(q => q.tags?.forEach(t => tags.add(t)));
    setAvailableTags(Array.from(tags).sort());
  }, [questions]);

  // フォルダ読み込み
  useEffect(() => {
    loadFolders();
  }, [location.key]);

  const loadFolders = async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS);
      if (saved) setFolders(JSON.parse(saved));
    } catch (e) {}
  };

  const openFolderDetail = (folder: Folder) => {
    const questionsInFolder = questions.filter(q => folder.questionIds.includes(q.id));
    setFolderQuestions(questionsInFolder);
    setSelectedFolder(folder);
  };

  const currentFolder = currentFolderId
    ? folders.find(folder => folder.id === currentFolderId) || null
    : null;

  const visibleFolders = folders.filter(folder => {
    if (currentFolderId === null) {
      return folder.parentId === undefined || folder.parentId === null;
    }
    return folder.parentId === currentFolderId;
  });

  const goToParentFolder = () => {
    if (!currentFolderId) return;
    const parentId = folders.find(folder => folder.id === currentFolderId)?.parentId ?? null;
    setCurrentFolderId(parentId);
  };

  const filteredQuestions = useMemo(() => {
    let filtered = questions;
    if (selectedFilterTag) {
      filtered = filtered.filter(q => q.tags && q.tags.includes(selectedFilterTag));
    }
    return filtered;
  }, [questions, selectedFilterTag]);

  const saveFolders = async (newFolders: Folder[]) => {
    setFolders(newFolders);
    await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(newFolders));
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('エラー', '問題集名を入力してください');
      return;
    }
    const newFolder: Folder = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
      name: newFolderName.trim(),
      questionIds: [],
      parentId: currentFolderId ?? undefined,
    };
    const updatedFolders = [...folders, newFolder];
    await saveFolders(updatedFolders);
    setNewFolderName('');
    setShowFolderModal(false);
    setShowFoldersView(true);
    Alert.alert('成功', '問題集を作成しました');
  };

  const batchAddTags = async () => {
    const newTags = batchTagInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    if (newTags.length === 0) {
      Alert.alert('エラー', locale === 'ja' ? 'タグを入力してください' : 'Please enter tags');
      return;
    }

    await addTagToQuestions(selectedQuestionIds, newTags);
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

  const requestDeleteQuestion = (id: number) => {
    setDeleteTargetId(id);
    setShowQuestionDeleteModal(true);
  };

  const confirmDelete = async (id: number) => {
    try {
      // 1. 問題を削除（useQuestions フック経由）
      const updatedQuestions = await deleteQuestion(id);
      if (updatedQuestions.length === questions.length) {
        Alert.alert(
          locale === 'ja' ? 'エラー' : 'Error',
          locale === 'ja' ? '問題が見つかりませんでした' : 'Question not found'
        );
        return;
      }

      // 2. フォルダからも該当IDを削除
      const updatedFolders = folders.map(folder => ({
        ...folder,
        questionIds: folder.questionIds.filter(qid => qid !== id)
      }));
      await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(updatedFolders));
      setFolders(updatedFolders);
      setSelectedQuestionIds(prev => prev.filter(qid => qid !== id));

      // 3. 現在表示中のフォルダ詳細があれば再読み込み
      if (selectedFolder) {
        const updatedFolder = { ...selectedFolder, questionIds: selectedFolder.questionIds.filter(qid => qid !== id) };
        setSelectedFolder(updatedFolder);
        setFolderQuestions(updatedFolder.questionIds.map(fid => updatedQuestions.find(q => q.id === fid)).filter(Boolean) as Question[]);
      }

      SoundManager.play('complete');
      Alert.alert(
        locale === 'ja' ? '削除完了' : 'Deleted',
        locale === 'ja' ? `問題を削除しました（残り ${updatedQuestions.length} 問）` : `Question deleted (${updatedQuestions.length} remaining)`
      );
    } catch (e) {
      console.error("削除エラー:", e);
    }
  };

  const startEditTags = (question: Question) => {
    setEditingQuestion(question);
    setEditTagInput(question.tags ? question.tags.join(', ') : '');
    setShowTagModal(true);
  };

  const saveEditedTags = async () => {
    if (!editingQuestion) return;

    const newTags = editTagInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    const updatedQuestion = { ...editingQuestion, tags: newTags };
    await updateQuestion(updatedQuestion);

    setShowTagModal(false);
    setEditingQuestion(null);

    if (selectedFilterTag && !newTags.includes(selectedFilterTag)) {
      setSelectedFilterTag(null);
    }

    SoundManager.play('complete');
    Alert.alert(t.success, locale === 'ja' ? 'タグを更新しました' : 'Tags updated');
  };

  const startEditQuestion = (question: Question) => {
    setEditingQuestionFull(question);
    setEditQuestionText(question.question);
    setEditAnswerText(question.descriptiveAnswer || '');
    setEditTrueFalseAnswer(question.trueFalseAnswer ?? true);
    setEditMultipleOptions(question.multipleChoice?.options || ['', '', '', '']);
    setEditMultipleCorrect(question.multipleChoice?.correctAnswer ?? 0);
    setShowEditModal(true);
  };

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

    await updateQuestion(updated);
    setShowEditModal(false);
    setEditingQuestionFull(null);
    SoundManager.play('complete');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}> 
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {t.manageQuestions}
        </Text>
        <View style={styles.headerActions}>
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countBadgeText}>{filteredQuestions.length}</Text>
          </View>
          <TouchableOpacity
            style={[styles.compactToggleBtn, { backgroundColor: isCompactMode ? colors.primary : colors.primary + '20' }]}
            onPress={() => { setIsCompactMode(!isCompactMode); if (isCompactMode) setExpandedQuestionId(null); }}
          >
            <Text style={[styles.compactToggleBtnText, { color: '#000000' }]}>
              {isCompactMode ? '≡' : '☰'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { borderColor: colors.primary, backgroundColor: colors.primary }]}
            onPress={() => {
              setCurrentFolderId(null);
              setShowFoldersView(true);
            }}
          >
            <Text style={[styles.headerBtnText, { color: '#000000' }]}>📚 {t.folders}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { borderColor: colors.primary, backgroundColor: isSelectionMode ? colors.primary : 'transparent' }]}
            onPress={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedQuestionIds([]); }}
          >
            <Text style={[styles.headerBtnText, { color: isSelectionMode ? '#fff' : colors.primary }]}>
              {isSelectionMode ? t.cancelSelection : t.batchEdit}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }}
            onPress={() => { SoundManager.play('decide'); navigate('/'); }}
          >
            <Text style={{ color: '#000000', fontWeight: '700', fontSize: 14 }}>
              {locale === 'ja' ? '戻る' : 'Back'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isSelectionMode && selectedQuestionIds.length > 0 && (
        <TouchableOpacity style={[styles.batchTagBar, { backgroundColor: colors.primary }]} onPress={() => setShowBatchTagModal(true)}>
          <Text style={styles.batchTagBarText}>📋 {t.addTagsToSelected} ({selectedQuestionIds.length}{t.questionsSelected})</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.mainScrollContent}
      >
        {[...filteredQuestions].reverse().map((item) => (
          <View
            key={item.id}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.primary },
              isCompactMode && styles.cardCompact,
            ]}
          >
            {isSelectionMode && (
              <TouchableOpacity onPress={() => { if (selectedQuestionIds.includes(item.id)) { setSelectedQuestionIds(prev => prev.filter(id => id !== item.id)); } else { setSelectedQuestionIds(prev => [...prev, item.id]); } }} style={styles.checkbox}>
                <Text style={[styles.checkboxText, { color: '#ffffff' }]}>{selectedQuestionIds.includes(item.id) ? '☑' : '☐'}</Text>
              </TouchableOpacity>
            )}
            <View style={[styles.cardHeader, isCompactMode && styles.cardHeaderCompact]}>
              <TouchableOpacity
                style={styles.cardHeaderLeft}
                onPress={() => { if (!isCompactMode) { setExpandedQuestionId(expandedQuestionId === item.id ? null : item.id); } }}
                activeOpacity={isCompactMode ? 1 : 0.7}
              >
                {!isCompactMode && (
                  <>
                    <Text style={[styles.typeBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{item.answerType === 'multiple' ? t.multiple : item.answerType === 'truefalse' ? t.truefalse : t.descriptive}</Text>
                    {item.isShared && <Text style={[{ fontSize: 10, color: colors.success, fontWeight: '700', marginLeft: 4 }]}>🔗</Text>}
                  </>
                )}
                <Text style={[styles.questionPreview, { color: colors.text }, isCompactMode && styles.questionPreviewCompact]} numberOfLines={isCompactMode ? 1 : 2}>{item.question}</Text>
              </TouchableOpacity>
              <View style={styles.cardHeaderRight}>
                {item.image && (
                  <View style={[{ borderRadius: 6, overflow: 'hidden', width: 40, height: 40 }]}>
                    <img src={item.image} alt="" className="browse-thumbnail" />
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => requestDeleteQuestion(item.id)}
                  style={styles.headerDeleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={[styles.headerDeleteBtnText, { color: colors.error }]}>🗑️</Text>
                </TouchableOpacity>
                {!isCompactMode && (
                  <TouchableOpacity onPress={() => setExpandedQuestionId(expandedQuestionId === item.id ? null : item.id)}>
                    <Text style={[styles.expandIcon, { color: colors.primary }]}>{expandedQuestionId === item.id ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {!isCompactMode && expandedQuestionId === item.id && (
              <View style={styles.expandedContent}>
                {item.isShared && <Text style={[{ fontSize: 12, color: colors.success, fontWeight: '700', marginBottom: 6 }]}>🔗 {locale === 'ja' ? '共有されて来た問題' : 'Shared Question'}</Text>}
                <Text style={[styles.fullQuestion, { color: colors.text }]}>{item.question}</Text>
                {item.tags && item.tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {item.tags.map((tag, i) => (
                      <View key={i} style={[styles.miniTag, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.miniTagText, { color: colors.primary }]}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => startEditQuestion(item)}><Text style={[styles.editTagBtnText, { color: colors.primary }]}>✏️ 編集</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowAnswerId(showAnswerId === item.id ? null : item.id); }}>
                    <Text style={[styles.answerBtnText, { color: colors.primary }]}>{showAnswerId === item.id ? t.hide : t.showAnswer}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => startEditTags(item)}><Text style={[styles.editTagBtnText, { color: colors.primary }]}>{t.editTags}</Text></TouchableOpacity>
                </View>
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
        {questions.length === 0 && <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noQuestions}</Text>}
      </ScrollView>

      {/* 編集モーダル */}
      <Modal visible={showEditModal} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.card }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>✏️ 問題を編集</Text>
            <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6 }]}>問題文</Text>
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: 'top' }]} value={editQuestionText} onChangeText={setEditQuestionText} placeholder="問題文を入力" placeholderTextColor={colors.textSecondary} multiline />
            {editingQuestionFull?.answerType === 'descriptive' && (
              <>
                <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6 }]}>回答</Text>
                <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: 'top' }]} value={editAnswerText} onChangeText={setEditAnswerText} placeholder="回答を入力" placeholderTextColor={colors.textSecondary} multiline />
              </>
            )}
            {editingQuestionFull?.answerType === 'truefalse' && (
              <>
                <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>回答</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                  <TouchableOpacity style={[styles.modalCancelBtn, { flex: 1, backgroundColor: editTrueFalseAnswer ? colors.success : 'transparent', borderColor: colors.success }]} onPress={() => setEditTrueFalseAnswer(true)}>
                    <Text style={[styles.modalCancelText, { color: editTrueFalseAnswer ? '#fff' : colors.success, fontSize: 20 }]}>○</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalCancelBtn, { flex: 1, backgroundColor: !editTrueFalseAnswer ? colors.error : 'transparent', borderColor: colors.error }]} onPress={() => setEditTrueFalseAnswer(false)}>
                    <Text style={[styles.modalCancelText, { color: !editTrueFalseAnswer ? '#fff' : colors.error, fontSize: 20 }]}>×</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
            {editingQuestionFull?.answerType === 'multiple' && (
              <>
                <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>選択肢</Text>
                {editMultipleOptions.map((opt, i) => (
                  <TextInput key={i} style={[styles.modalInput, { borderColor: editMultipleCorrect === i ? colors.success : colors.border, color: colors.text }]} value={opt} onChangeText={text => { const newOpts = [...editMultipleOptions]; newOpts[i] = text; setEditMultipleOptions(newOpts); }} placeholder={`選択肢 ${i + 1}${editMultipleCorrect === i ? ' ✓ 正解' : ''}`} placeholderTextColor={editMultipleCorrect === i ? colors.success : colors.textSecondary} />
                ))}
                <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>正解番号</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                  {[0, 1, 2, 3].map(i => (
                    <TouchableOpacity key={i} style={[styles.modalCancelBtn, { flex: 1, backgroundColor: editMultipleCorrect === i ? colors.success : 'transparent', borderColor: colors.success }]} onPress={() => setEditMultipleCorrect(i)}>
                      <Text style={[styles.modalCancelText, { color: editMultipleCorrect === i ? '#fff' : colors.success }]}>{i + 1}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowEditModal(false); setEditingQuestionFull(null); }}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>キャンセル</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={saveEditedQuestion}><Text style={styles.modalSaveText}>保存</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* タグ編集モーダル */}
      <Modal visible={showTagModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.tagEditTitle}</Text>
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]} value={editTagInput} onChangeText={setEditTagInput} placeholder={t.enterTagsComma} placeholderTextColor={colors.textSecondary} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowTagModal(false); setEditingQuestion(null); }}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancelEdit}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={saveEditedTags}><Text style={styles.modalSaveText}>{t.saveTags}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* フォルダ作成モーダル */}
      <Modal visible={showFolderModal} transparent animationType="fade" statusBarTranslucent={true}>
        <View style={[styles.modalOverlay, { zIndex: 9999 }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.folderCreate}</Text>
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]} value={newFolderName} onChangeText={setNewFolderName} placeholder={t.folderName} placeholderTextColor={colors.textSecondary} maxLength={30} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowFolderModal(false); setShowFoldersView(true); }}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={createFolder}><Text style={styles.modalSaveText}>{t.folderCreate}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 一括タグ追加モーダル */}
      <Modal visible={showBatchTagModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.batchAddTags}</Text>
            {(() => {
              const existingTags = new Set<string>();
              questions.filter(q => selectedQuestionIds.includes(q.id)).forEach(q => (q.tags || []).forEach(tag => existingTags.add(tag)));
              const tagArray = Array.from(existingTags);
              if (tagArray.length === 0) return null;
              return (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }]}>選択中の問題の既存タグ:</Text>
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
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]} value={batchTagInput} onChangeText={setBatchTagInput} placeholder={t.enterTagsComma} placeholderTextColor={colors.textSecondary} />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setShowBatchTagModal(false)}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={batchAddTags}><Text style={styles.modalSaveText}>{t.saveTags}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 問題集一覧モーダル */}
      <Modal visible={showFoldersView} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.card }}>
          <View style={{ flex: 1, padding: 20 }}>
            <View style={styles.foldersModalHeader}>
              <Text style={[styles.foldersModalTitle, { color: colors.text }]}>📚 {t.folders || (locale === 'ja' ? '問題集' : 'Folders')}</Text>
              <View style={styles.foldersModalActions}>
                <TouchableOpacity style={[styles.folderHeaderActionBtn, { backgroundColor: colors.primary }]} onPress={() => { setNewFolderName(''); setShowFoldersView(false); setShowFolderModal(true); }}><Text style={styles.folderHeaderActionBtnText}>＋ 作成</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.folderHeaderActionBtn, { backgroundColor: isFolderDeleteMode ? colors.error : colors.error + '20', borderWidth: 1, borderColor: colors.error }]} onPress={() => { setIsFolderDeleteMode(!isFolderDeleteMode); if (isFolderDeleteMode) setSelectedFolderIds([]); }}>
                  <Text style={[styles.folderHeaderActionBtnText, { color: isFolderDeleteMode ? '#fff' : colors.error }]}>{isFolderDeleteMode ? `削除(${selectedFolderIds.length})` : '🗑️ 削除'}</Text>
                </TouchableOpacity>
                {isFolderDeleteMode && selectedFolderIds.length > 0 && (
                  <TouchableOpacity style={[styles.folderHeaderActionBtn, { backgroundColor: colors.error }]} onPress={() => setShowDeleteConfirmModal(true)}><Text style={styles.folderHeaderActionBtnText}>実行</Text></TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => { setShowFoldersView(false); setSelectedFolder(null); setIsFolderDeleteMode(false); setSelectedFolderIds([]); }}><Text style={[styles.closeIconButton, { color: colors.textSecondary }]}>✕</Text></TouchableOpacity>
              </View>
            </View>
            {currentFolderId !== null && (
              <TouchableOpacity style={[styles.parentNavBtn, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={goToParentFolder}>
                <Text style={[styles.parentNavText, { color: colors.primary }]}>⬅️ 上の階層へ戻る</Text>
                <Text style={[styles.parentNavSubText, { color: colors.textSecondary }]}>{currentFolder?.name || 'ルート'}</Text>
              </TouchableOpacity>
            )}
            <ScrollView>
              {visibleFolders.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noFolders}</Text>
              ) : (
                visibleFolders.map(folder => {
                  const folderQuestionCount = folder.questionIds.length;
                  const isSelected = selectedFolderIds.includes(folder.id);
                  return (
                    <View
                      key={folder.id}
                      style={[
                        styles.folderItem,
                        { borderBottomColor: colors.border, borderColor: colors.border, backgroundColor: colors.card },
                        isSelected && { backgroundColor: colors.error + '10' },
                      ]}
                    >
                      {isFolderDeleteMode && (
                        <TouchableOpacity onPress={() => { setSelectedFolderIds(prev => prev.includes(folder.id) ? prev.filter(id => id !== folder.id) : [...prev, folder.id]); }} style={styles.checkbox}>
                          <Text style={[styles.checkboxText, { color: '#ffffff' }]}>{isSelected ? '☑' : '☐'}</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.folderInfo} onPress={() => { if (!isFolderDeleteMode) openFolderDetail(folder); }}>
                        <Text style={[styles.folderIcon, { color: colors.primary }]}>📁</Text>
                        <View>
                          <Text style={[styles.folderName, { color: colors.text }]}>{folder.name}</Text>
                          <Text style={[styles.folderCount, { color: colors.textSecondary }]}>{folderQuestionCount}問</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.folderArrowBtn} onPress={() => openFolderDetail(folder)}><Text style={[styles.folderArrow, { color: colors.primary }]}>›</Text></TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* 問題削除確認モーダル（Web では Alert が動作しないため） */}
      <Modal visible={showQuestionDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
              🗑️ {locale === 'ja' ? '問題を削除' : 'Delete Question'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? 'この問題を削除してもよろしいですか？この操作は取り消せません。'
                : 'Are you sure you want to delete this question? This action cannot be undone.'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowQuestionDeleteModal(false);
                  setDeleteTargetId(null);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={() => {
                  if (deleteTargetId !== null) {
                    confirmDelete(deleteTargetId);
                  }
                  setShowQuestionDeleteModal(false);
                  setDeleteTargetId(null);
                }}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 問題集削除確認モーダル */}
      <Modal visible={showDeleteConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>🗑️ {selectedFolderIds.length}個の問題集を削除しますか？</Text>
            <Text style={[{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 13 }]}>この操作は取り消せません</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setShowDeleteConfirmModal(false)}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>キャンセル</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: colors.error }]} onPress={async () => {
                const updatedFolders = folders.filter(f => !selectedFolderIds.includes(f.id));
                await AsyncStorage.setItem(STORAGE_KEYS.QUESTION_FOLDERS, JSON.stringify(updatedFolders));
                setFolders(updatedFolders);
                setSelectedFolderIds([]);
                setIsFolderDeleteMode(false);
                setShowDeleteConfirmModal(false);
              }}><Text style={styles.modalSaveText}>削除する</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* タグ絞り込みモーダル */}
      <Modal visible={showTagFilterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>🏷️ {t.filterByTags || 'タグで絞り込み'}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: selectedFilterTag === null ? colors.primary : 'transparent' }} onPress={() => { setSelectedFilterTag(null); setShowTagFilterModal(false); }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: selectedFilterTag === null ? '#fff' : colors.text }}>📋 {locale === 'ja' ? '全問' : 'All'}</Text>
              </TouchableOpacity>
              {availableTags.map(tag => (
                <TouchableOpacity key={tag} style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: selectedFilterTag === tag ? colors.primary : 'transparent' }} onPress={() => { setSelectedFilterTag(tag); setShowTagFilterModal(false); }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: selectedFilterTag === tag ? '#fff' : colors.text }}>🏷️ {tag}</Text>
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
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>➕ {selectedFolderForAdd?.name} に問題を追加</Text>
              <TouchableOpacity onPress={() => { setShowAddToFolderModal(false); setSelectedFolderForAdd(null); setSelectedQuestionIdsForAdd([]); }}><Text style={[styles.closeIconButton, { color: colors.textSecondary }]}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalListContent}>
              {availableQuestionsForAdd.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>追加できる問題がありません</Text>
              ) : (
                availableQuestionsForAdd.map(question => (
                  <TouchableOpacity key={question.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => { setSelectedQuestionIdsForAdd(prev => prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]); }}>
                    <Text style={[styles.checkboxText, { color: colors.primary }]}>{selectedQuestionIdsForAdd.includes(question.id) ? '☑' : '☐'}</Text>
                    <Text style={{ fontSize: 15, flex: 1, lineHeight: 22, color: colors.text }} numberOfLines={2}>{question.question}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            {selectedQuestionIdsForAdd.length > 0 && (
              <TouchableOpacity style={[styles.addToFolderBar, { backgroundColor: colors.primary }]} onPress={async () => {
                if (selectedFolderForAdd) {
                  const updatedFolders = folders.map(f => f.id === selectedFolderForAdd.id ? { ...f, questionIds: [...new Set([...f.questionIds, ...selectedQuestionIdsForAdd])] } : f);
                  await saveFolders(updatedFolders);
                  setSelectedQuestionIdsForAdd([]);
                  setShowAddToFolderModal(false);
                  Alert.alert('完了', `${selectedQuestionIdsForAdd.length}問を追加しました`);
                }
              }}>
                <Text style={styles.addToFolderBarText}>➕ 選択した{selectedQuestionIdsForAdd.length}問を追加</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* 問題集の中身を表示するモーダル */}
      <Modal visible={!!selectedFolder} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.card }}>
          <View style={styles.folderDetailBody}>
            <View style={styles.folderDetailHeader}>
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>📁 {selectedFolder?.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity onPress={() => { setSelectedFolder(null); setFolderQuestions([]); setShowFolderAnswerId(null); }}><Text style={[styles.closeIconButton, { color: colors.textSecondary }]}>✕</Text></TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.openFolderBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (!selectedFolder) return;
                setSelectedFolder(null);
                setFolderQuestions([]);
                setShowFolderAnswerId(null);
                setCurrentFolderId(selectedFolder.id);
              }}
            >
              <Text style={[styles.openFolderBtnText, { color: onPrimary }]}>このフォルダを開く</Text>
            </TouchableOpacity>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>📋 追加可能な問題</Text>
            <ScrollView style={styles.addableQuestionsList} contentContainerStyle={styles.modalListContent}>
              {questions.filter(q => !selectedFolder?.questionIds.includes(q.id)).length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>追加できる問題がありません</Text>
              ) : (
                questions.filter(q => !selectedFolder?.questionIds.includes(q.id)).map(question => (
                  <TouchableOpacity key={question.id} style={[styles.folderAddableQuestionItem, { borderBottomColor: colors.border }]} onPress={async () => {
                    if (!selectedFolder) return;
                    const newQuestionIds = [...new Set([...selectedFolder.questionIds, question.id])];
                    const updatedFolders = folders.map(f => f.id === selectedFolder.id ? { ...f, questionIds: newQuestionIds } : f);
                    await saveFolders(updatedFolders);
                    const updatedFolder = { ...selectedFolder, questionIds: newQuestionIds };
                    setSelectedFolder(updatedFolder);
                    setFolderQuestions(questions.filter(q => newQuestionIds.includes(q.id)));
                  }}>
                    <Text style={[styles.folderAddableQuestionText, { color: colors.text }]} numberOfLines={2}>{question.question}</Text>
                    <Text style={[styles.addButton, { color: colors.primary }]}>+ 追加</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={styles.divider} />
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>📖 この問題集の問題</Text>
            <ScrollView style={styles.folderQuestionsList} contentContainerStyle={styles.modalListContent}>
              {folderQuestions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>{t.noQuestionsInFolder}</Text>
              ) : (
                folderQuestions.map(question => (
                  <View key={question.id} style={[styles.folderQuestionItem, { borderBottomColor: colors.border }]}>
                    {isFolderBatchMode && (
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedFolderQuestionIds(prev =>
                            prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]
                          );
                        }}
                        style={styles.checkbox}
                      >
                        <Text style={[styles.checkboxText, { color: '#ffffff' }]}>
                          {selectedFolderQuestionIds.includes(question.id) ? '☑' : '☐'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.folderQuestionContent}>
                      <Text style={[styles.folderQuestionText, { color: colors.text }]} numberOfLines={2}>{question.question}</Text>
                      <View style={styles.folderQuestionActions}>
                        <TouchableOpacity style={[styles.folderActionBtn, { borderColor: colors.primary }]} onPress={() => setShowFolderAnswerId(showFolderAnswerId === question.id ? null : question.id)}>
                          <Text style={[styles.folderActionBtnText, { color: colors.primary }]}>{showFolderAnswerId === question.id ? '隠す' : t.showAnswer}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.folderActionBtn, { borderColor: colors.error }]} onPress={async () => {
                          if (!selectedFolder) return;
                          const newQuestionIds = selectedFolder.questionIds.filter(id => id !== question.id);
                          const updatedFolders = folders.map(f => f.id === selectedFolder.id ? { ...f, questionIds: newQuestionIds } : f);
                          await saveFolders(updatedFolders);
                          setSelectedFolder({ ...selectedFolder, questionIds: newQuestionIds });
                          setFolderQuestions(prev => prev.filter(q => q.id !== question.id));
                        }}>
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
            {isFolderBatchMode && selectedFolderQuestionIds.length > 0 && (
              <TouchableOpacity
                style={[styles.batchTagBar, { backgroundColor: colors.error }]}
                onPress={async () => {
                  if (!selectedFolder) return;
                  const newIds = selectedFolder.questionIds.filter(id => !selectedFolderQuestionIds.includes(id));
                  const updatedFolders = folders.map(f => f.id === selectedFolder.id ? { ...f, questionIds: newIds } : f);
                  await saveFolders(updatedFolders);
                  setSelectedFolder({ ...selectedFolder, questionIds: newIds });
                  setFolderQuestions(prev => prev.filter(q => !selectedFolderQuestionIds.includes(q.id)));
                  setSelectedFolderQuestionIds([]);
                  setIsFolderBatchMode(false);
                }}
              >
                <Text style={[styles.batchTagBarText, { color: '#fff' }]}>
                  🗑️ {locale === 'ja' ? `選択した${selectedFolderQuestionIds.length}問を除外` : `Remove ${selectedFolderQuestionIds.length} questions`}
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
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    rowGap: 12,
    columnGap: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', flexShrink: 1, paddingRight: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  mainScrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  card: {
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  cardHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDeleteBtn: { padding: 6, borderRadius: 20 },
  headerDeleteBtnText: { fontSize: 18 },
  questionPreview: { fontSize: 15, fontWeight: '500', flex: 1, lineHeight: 22 },
  expandIcon: { fontSize: 16, fontWeight: 'bold', paddingHorizontal: 8 },
  expandedContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eee', gap: 12 },
  fullQuestion: { fontSize: 16, fontWeight: '500', lineHeight: 24 },
  typeBadge: { fontSize: 12, fontWeight: 'bold', backgroundColor: '#E1EFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 8, marginLeft: 'auto', flexWrap: 'wrap', rowGap: 10 },
  deleteText: { color: '#FF3B30', fontWeight: 'bold' },
  answerBtnText: { fontWeight: 'bold' },
  editTagBtnText: { fontWeight: 'bold' },
  questionText: { fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 56, color: '#999', paddingHorizontal: 16, lineHeight: 22 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  miniTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  miniTagText: { fontSize: 11, fontWeight: '500' },
  answerBox: { marginTop: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  answerLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  answerText: { fontSize: 15, lineHeight: 22 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  confirmModalContainer: { width: '80%', maxWidth: 300, padding: 24, borderRadius: 16, alignItems: 'center' },
  confirmModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  confirmModalMessage: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  confirmModalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmModalCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  confirmModalCancelText: { fontWeight: 'bold' },
  confirmModalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmModalConfirmText: { color: '#fff', fontWeight: 'bold' },
  modalContainer: { width: '85%', maxWidth: 400, padding: 24, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 20, backgroundColor: '#fff' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center' },
  modalSaveText: { color: '#000000', fontWeight: 'bold', fontSize: 15 },
  headerButtonsScroll: { marginBottom: 12 },
  headerButtons: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  headerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  headerBtnText: { fontSize: 12, fontWeight: 'bold', color: '#000000' },
  checkbox: { marginRight: 12, padding: 6 },
  checkboxText: { fontSize: 20 },
  batchTagBar: { marginVertical: 12, padding: 14, borderRadius: 14, alignItems: 'center' },
  batchTagBarText: { color: '#000000', fontWeight: 'bold' },
  foldersModalActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  folderArrowBtn: { paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  foldersModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  foldersModalTitle: { fontSize: 20, fontWeight: 'bold' },
  parentNavBtn: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, gap: 4 },
  parentNavText: { fontSize: 14, fontWeight: 'bold' },
  parentNavSubText: { fontSize: 12 },
  closeIconButton: { fontSize: 20, fontWeight: 'bold', padding: 4 },
  folderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 14, borderBottomWidth: 1, borderWidth: 1, borderRadius: 16, marginBottom: 12 },
  folderInfo: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  folderIcon: { fontSize: 24 },
  folderName: { fontSize: 16, fontWeight: '500' },
  folderCount: { fontSize: 12, marginTop: 4 },
  folderArrow: { fontSize: 28, fontWeight: 'bold' },
  folderDetailContainer: { width: '90%', maxWidth: 500, padding: 24, borderRadius: 20, maxHeight: '80%' },
  tagFilterList: { maxHeight: 400 },
  tagFilterChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8 },
  tagFilterChipText: { fontSize: 15, fontWeight: '500' },
  questionSelectItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
  questionSelectText: { fontSize: 15, flex: 1, lineHeight: 22 },
  addButton: { fontSize: 14, fontWeight: 'bold', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: 'hidden' },
  folderHeaderActionBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  folderHeaderActionBtnText: { color: '#000000', fontSize: 12, fontWeight: 'bold' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16, paddingTop: 16 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { color: '#000000', fontWeight: 'bold', fontSize: 13 },
  filterActiveBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  filterActiveBadgeText: { fontSize: 12, fontWeight: 'bold' },
  cardCompact: { marginVertical: 2, borderRadius: 12, padding: 14 },
  cardHeaderCompact: { paddingVertical: 8, paddingHorizontal: 10 },
  questionPreviewCompact: { fontSize: 11, lineHeight: 14 },
  compactToggleBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  compactToggleBtnText: { fontSize: 16, fontWeight: 'bold' },
  topBackBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  topBackBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  folderDetailBody: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  folderDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 12 },
  folderDetailTitle: { fontSize: 20, fontWeight: 'bold', flexShrink: 1, lineHeight: 26 },
  openFolderBtn: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center' },
  openFolderBtnText: { fontSize: 14, fontWeight: 'bold' },
  sectionSubtitle: { fontSize: 13, fontWeight: 'bold', marginTop: 6, marginBottom: 4, marginHorizontal: 4, letterSpacing: 0.2 },
  addableQuestionsList: { maxHeight: 200, marginHorizontal: 0, borderRadius: 16, overflow: 'hidden' },
  folderQuestionsList: { maxHeight: 300, marginHorizontal: 0, borderRadius: 16, overflow: 'hidden' },
  folderQuestionItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1 },
  folderQuestionContent: { gap: 12, paddingTop: 2 },
  folderQuestionText: { fontSize: 15, lineHeight: 22 },
  folderQuestionActions: { flexDirection: 'row', gap: 10, marginTop: 2, flexWrap: 'wrap' },
  folderAddableQuestionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, gap: 10 },
  folderAddableQuestionText: { flex: 1, fontSize: 13, marginRight: 10, lineHeight: 20 },
  folderActionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  folderActionBtnText: { fontSize: 13, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 14 },
  addToFolderBar: { marginTop: 16, padding: 16, borderRadius: 14, alignItems: 'center' },
  addToFolderBarText: { color: '#000000', fontWeight: 'bold', fontSize: 14 },
  modalListContent: { paddingHorizontal: 2, paddingBottom: 8 },
});
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
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text }]}>{t.manageQuestions}</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.countBadgeText}>{filteredQuestions.length}</Text>
        </View>
        {selectedFilterTag && (
          <TouchableOpacity 
            style={[styles.filterActiveBadge, { backgroundColor: colors.primary + '20' }]}
            onPress={() => setSelectedFilterTag(null)}
          >
            <Text style={[styles.filterActiveBadgeText, { color: colors.primary }]}>🏷️ {selectedFilterTag} ✕</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.compactToggleBtn, { backgroundColor: isCompactMode ? colors.primary : colors.primary + '20' }]}
          onPress={() => { setIsCompactMode(!isCompactMode); if (isCompactMode) setExpandedQuestionId(null); }}
        >
          <Text style={[styles.compactToggleBtnText, { color: isCompactMode ? '#fff' : colors.primary }]}>
            {isCompactMode ? '≡' : '☰'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.topBackBtn, { backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 16 }]}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={styles.topBackBtnText}>{locale === 'ja' ? '戻る' : 'Back'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.headerButtonsScroll} contentContainerStyle={styles.headerButtons}>
        <TouchableOpacity style={[styles.headerBtn, { borderColor: colors.primary }]} onPress={() => setShowFoldersView(true)}>
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>📚 {t.folders}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.headerBtn, { borderColor: colors.primary }]} onPress={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedQuestionIds([]); }}>
          <Text style={[styles.headerBtnText, { color: colors.primary }]}>{isSelectionMode ? t.cancelSelection : t.batchEdit}</Text>
        </TouchableOpacity>
        {availableTags.length > 0 && (
          <TouchableOpacity style={[styles.headerBtn, { borderColor: colors.primary, backgroundColor: selectedFilterTag ? colors.primary + '20' : 'transparent' }]} onPress={() => setShowTagFilterModal(true)}>
                  <Text style={[styles.headerBtnText, { color: colors.primary }]}>🏷️ {selectedFilterTag ? selectedFilterTag : (locale === 'ja' ? '全問' : 'All')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {isSelectionMode && selectedQuestionIds.length > 0 && (
        <TouchableOpacity style={[styles.batchTagBar, { backgroundColor: colors.primary }]} onPress={() => setShowBatchTagModal(true)}>
          <Text style={styles.batchTagBarText}>📋 {t.addTagsToSelected} ({selectedQuestionIds.length}{t.questionsSelected})</Text>
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
        {[...filteredQuestions].reverse().map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.card }, isCompactMode && styles.cardCompact]}>
            {isSelectionMode && (
              <TouchableOpacity onPress={() => { if (selectedQuestionIds.includes(item.id)) { setSelectedQuestionIds(prev => prev.filter(id => id !== item.id)); } else { setSelectedQuestionIds(prev => [...prev, item.id]); } }} style={styles.checkbox}>
                <Text style={styles.checkboxText}>{selectedQuestionIds.includes(item.id) ? '☑' : '☐'}</Text>
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
                    <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
      <Modal visible={showEditModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
            <View style={[styles.modalContainer, { backgroundColor: colors.card, width: '95%', maxWidth: 560, maxHeight: '90%' }]}>
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
      <Modal visible={showFolderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t.folderCreate}</Text>
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]} value={newFolderName} onChangeText={setNewFolderName} placeholder={t.folderName} placeholderTextColor={colors.textSecondary} />
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
      <Modal visible={showFoldersView} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.foldersModalContainer, { backgroundColor: colors.card }]}>
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
                <TouchableOpacity onPress={() => { setShowFoldersView(false); setSelectedFolder(null); setIsFolderDeleteMode(false); setSelectedFolderIds([]); }}><Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text></TouchableOpacity>
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
                      {isFolderDeleteMode && (
                        <TouchableOpacity onPress={() => { setSelectedFolderIds(prev => prev.includes(folder.id) ? prev.filter(id => id !== folder.id) : [...prev, folder.id]); }} style={styles.checkbox}>
                          <Text style={[styles.checkboxText, { color: colors.primary }]}>{isSelected ? '☑' : '☐'}</Text>
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
            <ScrollView style={styles.tagFilterList}>
              <TouchableOpacity style={[styles.tagFilterChip, selectedFilterTag === null && { backgroundColor: colors.primary }]} onPress={() => { setSelectedFilterTag(null); setShowTagFilterModal(false); }}>
                <Text style={[styles.tagFilterChipText, selectedFilterTag === null && { color: '#fff' }]}>📋 {locale === 'ja' ? '全問' : 'All'}</Text>
              </TouchableOpacity>
              {availableTags.map(tag => (
                <TouchableOpacity key={tag} style={[styles.tagFilterChip, selectedFilterTag === tag && { backgroundColor: colors.primary }]} onPress={() => { setSelectedFilterTag(tag); setShowTagFilterModal(false); }}>
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
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>➕ {selectedFolderForAdd?.name} に問題を追加</Text>
              <TouchableOpacity onPress={() => { setShowAddToFolderModal(false); setSelectedFolderForAdd(null); setSelectedQuestionIdsForAdd([]); }}><Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView>
              {availableQuestionsForAdd.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>追加できる問題がありません</Text>
              ) : (
                availableQuestionsForAdd.map(question => (
                  <TouchableOpacity key={question.id} style={[styles.questionSelectItem, { borderBottomColor: colors.border }]} onPress={() => { setSelectedQuestionIdsForAdd(prev => prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]); }}>
                    <Text style={[styles.checkboxText, { color: colors.primary }]}>{selectedQuestionIdsForAdd.includes(question.id) ? '☑' : '☐'}</Text>
                    <Text style={[styles.questionSelectText, { color: colors.text }]} numberOfLines={2}>{question.question}</Text>
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
      <Modal visible={!!selectedFolder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.folderDetailContainer, { backgroundColor: colors.card }]}>
            <View style={styles.folderDetailHeader}>
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}>📁 {selectedFolder?.name}</Text>
              <TouchableOpacity onPress={() => { setSelectedFolder(null); setFolderQuestions([]); setShowFolderAnswerId(null); }}><Text style={[styles.closeButton, { color: colors.textSecondary }]}>✕</Text></TouchableOpacity>
            </View>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>📋 追加可能な問題</Text>
            <ScrollView style={styles.addableQuestionsList}>
              {questions.filter(q => !selectedFolder?.questionIds.includes(q.id)).length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>追加できる問題がありません</Text>
              ) : (
                questions.filter(q => !selectedFolder?.questionIds.includes(q.id)).map(question => (
                  <TouchableOpacity key={question.id} style={[styles.addableQuestionItem, { borderBottomColor: colors.border }]} onPress={async () => {
                    if (!selectedFolder) return;
                    const newQuestionIds = [...new Set([...selectedFolder.questionIds, question.id])];
                    const updatedFolders = folders.map(f => f.id === selectedFolder.id ? { ...f, questionIds: newQuestionIds } : f);
                    await saveFolders(updatedFolders);
                    const updatedFolder = { ...selectedFolder, questionIds: newQuestionIds };
                    setSelectedFolder(updatedFolder);
                    setFolderQuestions(questions.filter(q => newQuestionIds.includes(q.id)));
                  }}>
                    <Text style={[styles.addableQuestionText, { color: colors.text }]} numberOfLines={2}>{question.question}</Text>
                    <Text style={[styles.addButton, { color: colors.primary }]}>+ 追加</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={styles.divider} />
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>📖 この問題集の問題</Text>
            <ScrollView style={styles.folderQuestionsList}>
              {folderQuestions.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>{t.noQuestionsInFolder}</Text>
              ) : (
                folderQuestions.map(question => (
                  <View key={question.id} style={[styles.folderQuestionItem, { borderBottomColor: colors.border }]}>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  cardHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerDeleteBtn: { padding: 6, borderRadius: 20 },
  headerDeleteBtnText: { fontSize: 18 },
  questionPreview: { fontSize: 14, fontWeight: '500', flex: 1 },
  expandIcon: { fontSize: 16, fontWeight: 'bold', paddingHorizontal: 8 },
  expandedContent: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee', gap: 10 },
  fullQuestion: { fontSize: 16, fontWeight: '500' },
  typeBadge: { fontSize: 12, fontWeight: 'bold', backgroundColor: '#E1EFFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 6, marginLeft: 'auto' },
  deleteText: { color: '#FF3B30', fontWeight: 'bold' },
  answerBtnText: { fontWeight: 'bold' },
  editTagBtnText: { fontWeight: 'bold' },
  questionText: { fontSize: 16 },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  miniTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  miniTagText: { fontSize: 11, fontWeight: '500' },
  answerBox: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1 },
  answerLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  answerText: { fontSize: 15 },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  confirmModalContainer: { width: '80%', maxWidth: 300, padding: 24, borderRadius: 16, alignItems: 'center' },
  confirmModalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  confirmModalMessage: { fontSize: 14, textAlign: 'center', marginBottom: 24 },
  confirmModalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmModalCancel: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  confirmModalCancelText: { fontWeight: 'bold' },
  confirmModalConfirm: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  confirmModalConfirmText: { color: '#fff', fontWeight: 'bold' },
  modalContainer: { width: '85%', maxWidth: 400, padding: 24, borderRadius: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  headerButtonsScroll: { marginBottom: 12 },
  headerButtons: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  headerBtnText: { fontSize: 12, fontWeight: 'bold' },
  checkbox: { marginRight: 12, padding: 4 },
  checkboxText: { fontSize: 20 },
  batchTagBar: { marginVertical: 12, padding: 12, borderRadius: 8, alignItems: 'center' },
  batchTagBarText: { color: '#fff', fontWeight: 'bold' },
  foldersModalContainer: { width: '90%', maxWidth: 500, padding: 24, borderRadius: 16, maxHeight: '80%' },
  foldersModalActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  folderArrowBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  foldersModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  foldersModalTitle: { fontSize: 20, fontWeight: 'bold' },
  closeButton: { fontSize: 20, fontWeight: 'bold', padding: 4 },
  folderItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: 1 },
  folderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  folderIcon: { fontSize: 24 },
  folderName: { fontSize: 16, fontWeight: '500' },
  folderCount: { fontSize: 12, marginTop: 2 },
  folderArrow: { fontSize: 18, fontWeight: 'bold', paddingHorizontal: 4 },
  folderDetailContainer: { width: '90%', maxWidth: 500, padding: 24, borderRadius: 16, maxHeight: '80%' },
  folderDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  folderDetailTitle: { fontSize: 20, fontWeight: 'bold' },
  folderQuestionItem: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  folderQuestionContent: { gap: 8 },
  folderQuestionText: { fontSize: 15, lineHeight: 22 },
  folderQuestionActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  folderActionBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  folderActionBtnText: { fontSize: 13, fontWeight: 'bold' },
  tagFilterList: { maxHeight: 400 },
  tagFilterChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ddd' },
  tagFilterChipText: { fontSize: 15, fontWeight: '500' },
  questionSelectItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1 },
  questionSelectText: { fontSize: 15, flex: 1, lineHeight: 22 },
  sectionSubtitle: { fontSize: 13, fontWeight: 'bold', marginVertical: 8, marginHorizontal: 16 },
  addableQuestionsList: { maxHeight: 200, marginHorizontal: 16 },
  addableQuestionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  addableQuestionText: { flex: 1, fontSize: 13, marginRight: 10 },
  addButton: { fontSize: 14, fontWeight: 'bold', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  folderQuestionsList: { maxHeight: 300, marginHorizontal: 16 },
  addToFolderBar: { marginTop: 16, padding: 14, borderRadius: 10, alignItems: 'center' },
  addToFolderBarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  folderHeaderActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  folderHeaderActionBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16, paddingTop: 16 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  filterActiveBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  filterActiveBadgeText: { fontSize: 12, fontWeight: 'bold' },
  cardCompact: { marginVertical: 1, borderRadius: 6, padding: 0 },
  cardHeaderCompact: { paddingVertical: 5, paddingHorizontal: 10 },
  questionPreviewCompact: { fontSize: 11, lineHeight: 14 },
  compactToggleBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  compactToggleBtnText: { fontSize: 16, fontWeight: 'bold' },
  topBackBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  topBackBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});
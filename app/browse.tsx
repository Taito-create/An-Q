import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Animated, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate, useLocation } from 'react-router-dom';
import { SoundManager } from './sound';
import BackButton from './components/BackButton';
import { useTheme } from './theme';
import PressableButton from './components/PressableButton';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { STORAGE_KEYS } from './constants/storageKeys';
import { Question, Folder, ImageAnnotation } from './types/question';
import { getAnswerText, showAnswerAlert, getAnswerGroups, normalizeMultipleChoice } from './utils/answerUtils';
import { uploadImageToCloudinary } from '../src/utils/userProgress';
import { useQuestionsContext } from './context/QuestionsContext';
import { speak as speakText, stopSpeech } from './utils/speechUtils';
import { Trash2, Folder as FolderIcon, Share2, Volume2, Tag, X } from 'lucide-react';
import { useResponsive } from './hooks/useResponsive';
import { useTerminalEffects } from './hooks/useTerminalEffects';
import { getSrsStatus } from './utils/srs';
import './browse.css';

/**
 * 展開コンテンツのフェードイン。
 * enabled=true のとき、マウント時に opacity 0→1（200ms）でフェードインする。
 * enabled=false のときは即時表示（演出OFF用）。
 * アンマウント時にアニメーションを停止する。
 */
function ExpandFade({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const opacity = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start();
    return () => anim.stop();
  }, [enabled, opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}

export default function BrowseQuestionsScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colors, onPrimary, isCyberpunk, br } = useTheme();
  const screenType = useResponsive();
  const terminalEffects = useTerminalEffects();
  const locale = useLocale();
  const t = translations[locale];
  const { 
    questions, 
    folders, 
    loading,
    deleteQuestion, 
    updateQuestion, 
    updateFolder,
    addTagToQuestions,
    removeTagFromAllQuestions,
    createFolder,
    deleteFolder,
    addQuestionsToFolder,
    removeQuestionsFromFolder,
    tagMasterList,
    addTag,
    removeTag
  } = useQuestionsContext();

  // ヘッダーのレスポンシブ寸法。
  // スマホ幅（375px程度）では「問題を管理」「件数バッジ」「一括編集」が詰まるため、
  // フォント・パディング・gap・ヘッダー内側余白を端末区分で切り替える。
  // ラベル自体は省略しない。
  const headerMetrics = useMemo(() => {
    switch (screenType) {
      case 'desktop':
        return { titleFontSize: 20, btnFontSize: 12, btnPadX: 14, btnPadY: 8, badgePadX: 10, badgePadY: 3, gap: 10, padX: 18 };
      case 'tablet':
        return { titleFontSize: 18, btnFontSize: 12, btnPadX: 12, btnPadY: 7, badgePadX: 9, badgePadY: 3, gap: 8, padX: 16 };
      default: // mobile（スマホ）
        return { titleFontSize: 16, btnFontSize: 11, btnPadX: 10, btnPadY: 6, badgePadX: 8, badgePadY: 2, gap: 6, padX: 12 };
    }
  }, [screenType]);

  // Debug: Log questions when component renders

  // Determine checkbox text color based on theme luminance
  const getCheckboxTextColor = (): string => {
    // Simple luminance calculation for primary color
    const hex = colors.primary.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    return luminance > 150 ? '#1A1A1A' : '#FFFFFF';
  };

  // タグ編集用 state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editTags, setEditTags] = useState<string[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  // tagMasterList は Context から取得（デバイス間同期対応）

  // 回答表示用 state
  const [showAnswerId, setShowAnswerId] = useState<number | null>(null);
  const [showFolderAnswerId, setShowFolderAnswerId] = useState<number | null>(null);
  // 読み上げ丸ボタンの再生中問題ID
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  // 画像拡大モーダル表示中の問題ID
  const [showImageId, setShowImageId] = useState<number | null>(null);

  // アコーディオン用 state
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);

  // フォルダ関連 state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // 一括タグ編集関連 state
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [showBatchTagModal, setShowBatchTagModal] = useState(false);
  const [batchSelectedTags, setBatchSelectedTags] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // タブ管理用 state
  const [activeTab, setActiveTab] = useState<'all' | 'folders'>('all');
  // 表示モード: 'normal'（展開カード）/ 'compact'（問題＋答えのみ）
  const [displayMode, setDisplayMode] = useState<'normal' | 'compact'>('normal');
  
  // 問題集閲覧関連 state
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [folderQuestions, setFolderQuestions] = useState<Question[]>([]);
  const [isFolderBatchMode, setIsFolderBatchMode] = useState(false);
  const [selectedFolderQuestionIds, setSelectedFolderQuestionIds] = useState<number[]>([]);

  // 除外確認モーダル用 state
  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [targetQuestionIdToRemove, setTargetQuestionIdToRemove] = useState<number | null>(null);

  // タグ絞り込み用 state
  const [selectedFilterTag, setSelectedFilterTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showTagFilterModal, setShowTagFilterModal] = useState(false);

  // 問題集削除モード用 state
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [folderNameToDelete, setFolderNameToDelete] = useState<string>('');

  // 問題削除確認モーダル用 state（Web では Alert が動作しないため独自モーダルを使用）
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [showQuestionDeleteModal, setShowQuestionDeleteModal] = useState(false);

  // 一括削除確認モーダル用 state
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleteCount, setBatchDeleteCount] = useState(0);

  // 問題追加用モーダルの state
  const [showAddToFolderModal, setShowAddToFolderModal] = useState(false);
  const [selectedFolderForAdd, setSelectedFolderForAdd] = useState<Folder | null>(null);
  const [availableQuestionsForAdd, setAvailableQuestionsForAdd] = useState<Question[]>([]);
  const [selectedQuestionIdsForAdd, setSelectedQuestionIdsForAdd] = useState<number[]>([]);
  const [addByTagSelectedTags, setAddByTagSelectedTags] = useState<string[]>([]);

  // 問題編集用 state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingQuestionFull, setEditingQuestionFull] = useState<Question | null>(null);

  const [editQuestionText, setEditQuestionText] = useState('');
  const [editAnswerGroups, setEditAnswerGroups] = useState<string[][]>([['']]);
  const [editTrueFalseAnswer, setEditTrueFalseAnswer] = useState(true);
  const [editMultipleOptions, setEditMultipleOptions] = useState<string[]>(['', '', '', '']);
  const [editMultipleCorrectAnswers, setEditMultipleCorrectAnswers] = useState<number[]>([0]);
  const [editMultipleAllowMultiple, setEditMultipleAllowMultiple] = useState(false);
  const [editReading, setEditReading] = useState('');

  // タグ一覧更新（questions 変更時に実行）
  useEffect(() => {
    const tags = new Set<string>();
    questions.forEach(q => q.tags?.forEach(t => tags.add(t)));
    setAvailableTags(Array.from(tags).sort());
  }, [questions]);

  // tagMasterList は Context から取得するため、ローカルでのロードは不要

  // 表示モードの復元（問題管理画面を再訪しても設定を保持する）
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.BROWSE_DISPLAY_MODE)
      .then(v => { if (v === 'compact') setDisplayMode('compact'); })
      .catch(() => {});
  }, []);

  const toggleDisplayMode = async () => {
    SoundManager.play('decide');
    const next = displayMode === 'normal' ? 'compact' : 'normal';
    setDisplayMode(next);
    try { await AsyncStorage.setItem(STORAGE_KEYS.BROWSE_DISPLAY_MODE, next); } catch { /* 永続化失敗は無視 */ }
  };

  // フォルダが更新されたら、選択中のフォルダとフォルダ質問を更新
  useEffect(() => {
    if (selectedFolder) {
      const updatedFolder = folders.find(f => f.id === selectedFolder.id);
      if (updatedFolder) {
        setSelectedFolder(updatedFolder);
        const questionsInFolder = questions.filter(q => updatedFolder.questionIds.includes(q.id));
        setFolderQuestions(questionsInFolder);
      }
    }
  }, [folders, questions, selectedFolder]);

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

  const handleCreateFolder = async () => {
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
    await createFolder(newFolder);
    setNewFolderName('');
    setShowFolderModal(false);
    SoundManager.play('complete');
    Alert.alert('成功', '問題集を作成しました');
  };

  const batchAddTags = async () => {
    if (batchSelectedTags.length === 0) {
      Alert.alert('エラー', locale === 'ja' ? 'タグを選択してください' : 'Please select tags');
      return;
    }
    await addTagToQuestions(selectedQuestionIds, batchSelectedTags);
    setShowBatchTagModal(false);
    setBatchSelectedTags([]);
    setSelectedQuestionIds([]);
    setIsSelectionMode(false);
    SoundManager.play('complete');
    Alert.alert(
      locale === 'ja' ? '成功' : 'Success',
      locale === 'ja'
        ? `選択した${selectedQuestionIds.length}問にタグを追加しました`
        : `Added tags to ${selectedQuestionIds.length} selected questions`
    );
  };

  const batchDeleteQuestions = async () => {
    
    if (selectedQuestionIds.length === 0) {
      window.alert(locale === 'ja' ? 'エラー\n削除する問題を選択してください' : 'Error\nPlease select questions to delete');
      return;
    }

    // Show custom modal instead of window.confirm
    setBatchDeleteCount(selectedQuestionIds.length);
    setShowBatchDeleteModal(true);
  };

  const confirmBatchDelete = async () => {
    setShowBatchDeleteModal(false);
    
    try {
      
      // Delete each question
      let currentQuestions = questions;
      for (const id of selectedQuestionIds) {
        currentQuestions = await deleteQuestion(id);
      }

      // Clear selection
      setSelectedQuestionIds([]);
      setIsSelectionMode(false);

      SoundManager.play('complete');
      // No success alert - just close modal and refresh list
    } catch (e) {
      console.error('Batch delete error:', e);
      window.alert(locale === 'ja' ? 'エラー\n削除に失敗しました' : 'Error\nFailed to delete questions');
    }
  };

  const requestDeleteQuestion = (id: number) => {
    setDeleteTargetId(id);
    setShowQuestionDeleteModal(true);
  };

  const confirmDelete = async (id: number) => {
    try {
      // 1. 問題を削除（Context フック経由でフォルダの questionIds も同時掃除される）
      const updatedQuestions = await deleteQuestion(id);
      if (updatedQuestions.length === questions.length) {
        Alert.alert(
          locale === 'ja' ? 'エラー' : 'Error',
          locale === 'ja' ? '問題が見つかりませんでした' : 'Question not found'
        );
        return;
      }

      setSelectedQuestionIds(prev => prev.filter(qid => qid !== id));

      // 2. 現在表示中のフォルダ詳細があれば再読み込み
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
    setEditTags(question.tags || []);
    // tagMasterList は Context から取得済み（ロード不要）
    setShowTagModal(true);
  };

  const saveEditedTags = async () => {
    if (!editingQuestion) return;
    const updatedQuestion = { ...editingQuestion, tags: editTags };
    await updateQuestion(updatedQuestion);
    setShowTagModal(false);
    setEditingQuestion(null);
    if (selectedFilterTag && !editTags.includes(selectedFilterTag)) {
      setSelectedFilterTag(null);
    }
    SoundManager.play('complete');
    Alert.alert(t.success, locale === 'ja' ? 'タグを更新しました' : 'Tags updated');
  };

  // 問題の読み上げ（同じ問題を再タップで停止）
  const handleSpeak = async (item: Question) => {
    if (speakingId === item.id) {
      stopSpeech();
      setSpeakingId(null);
      return;
    }
    SoundManager.play('decide');
    setSpeakingId(item.id);
    try {
      const textToSpeak = item.reading || item.question;
      await speakText(textToSpeak);
    } catch (e) {
      console.warn('speak failed:', e);
    } finally {
      setSpeakingId(null);
    }
  };

  const startEditQuestion = (question: Question) => {
    
    setEditingQuestionFull(question);
    setEditQuestionText(question.question || '');
    
    if (question.answerType === 'descriptive') {
      // Safely get answer groups
      let groups: string[][] = [['']];
      
      try {
        // Priority 1: Check descriptiveAnswerGroups (new format)
        if (question.descriptiveAnswerGroups && Array.isArray(question.descriptiveAnswerGroups)) {
          groups = question.descriptiveAnswerGroups;
          // Make sure each group is an array
          groups = groups.map(group => Array.isArray(group) ? group : [String(group)]);
          if (groups.length === 0 || groups.every(g => g.length === 0 || g.every(a => !a || !a.trim()))) {
            groups = [['']];
          }
        }
        // Priority 2: Check descriptiveAnswer (old format)
        else if (question.descriptiveAnswer !== undefined && question.descriptiveAnswer !== null) {
          if (Array.isArray(question.descriptiveAnswer)) {
            groups = [question.descriptiveAnswer.filter(a => a && a.trim())];
            if (groups[0].length === 0) groups = [['']];
          } else if (typeof question.descriptiveAnswer === 'string') {
            groups = [[question.descriptiveAnswer]];
          }
        }
      } catch (e) {
        console.error('Error parsing answer groups:', e);
        groups = [['']];
      }
      
      setEditAnswerGroups(groups);
    } else {
      // Reset for non-descriptive questions
      setEditAnswerGroups([['']]);
    }
    
    setEditTrueFalseAnswer(question.trueFalseAnswer ?? true);
    setEditMultipleOptions(question.multipleChoice?.options || ['', '', '', '']);
    // 旧形式（correctAnswer）も新形式（correctAnswers）も読み取れるようにする
    {
      const normalized = normalizeMultipleChoice(question.multipleChoice);
      setEditMultipleCorrectAnswers(normalized?.correctAnswers ?? [0]);
      setEditMultipleAllowMultiple(normalized?.allowMultiple === true);
    }
    setEditReading(question.reading || '');
    setShowEditModal(true);
  };

  const saveEditedQuestion = async () => {
    if (!editingQuestionFull || !editQuestionText.trim()) return;

    let updatedDescriptiveAnswerGroups = editingQuestionFull.descriptiveAnswerGroups;
    let updatedDescriptiveAnswer = editingQuestionFull.descriptiveAnswer;
    let updatedMatchMode = editingQuestionFull.matchMode;
    if (editingQuestionFull.answerType === 'descriptive') {
      const cleanedGroups = editAnswerGroups
        .map(group => group.map(a => a.trim()).filter(Boolean))
        .filter(group => group.length > 0);
      updatedDescriptiveAnswerGroups = cleanedGroups.length > 0 ? cleanedGroups : undefined;
      //  descriptiveAnswer は descriptiveAnswerGroups と重複するため保存しない
      //    （Firestore でフィールド型の競合エラーを避けるため）
      updatedMatchMode = cleanedGroups.length > 1 ? 'all' : 'any';
    }

    // 画像が Base64 の場合は Cloudinary にアップロードして URL 化する
    // （Firestore の1MB制限を避けるため。失敗時は元の値を保持する）
    let updatedImage = editingQuestionFull.image ?? null;
    if (updatedImage && updatedImage.startsWith('data:image')) {
      const uploaded = await uploadImageToCloudinary(updatedImage);
      if (uploaded) {
        updatedImage = uploaded;
      } else {
        console.warn('Cloudinary upload failed, keeping Base64');
      }
    }

    const updated: Question = {
      ...editingQuestionFull,
      question: editQuestionText.trim(),
      descriptiveAnswerGroups: updatedDescriptiveAnswerGroups,
      descriptiveAnswer: updatedDescriptiveAnswer,
      matchMode: updatedMatchMode,
      trueFalseAnswer: editingQuestionFull.answerType === 'truefalse' ? editTrueFalseAnswer : editingQuestionFull.trueFalseAnswer,
      multipleChoice: editingQuestionFull.answerType === 'multiple'
        ? {
            options: editMultipleOptions,
            correctAnswers: editMultipleAllowMultiple
              ? editMultipleCorrectAnswers
              : editMultipleCorrectAnswers.slice(0, 1),
            allowMultiple: editMultipleAllowMultiple,
          }
        : editingQuestionFull.multipleChoice,
      image: updatedImage,
      reading: editReading.trim() || undefined,
    };

    await updateQuestion(updated);
    setShowEditModal(false);
    setEditingQuestionFull(null);
    SoundManager.play('complete');
  };

  const handleDeleteFolder = async () => {
    
    if (!selectedFolder) {
      return;
    }
    
    // モーダルを開く前にフォルダ名を退避（モーダル表示中のチラつき防止）
    setFolderNameToDelete(selectedFolder.name);
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteFolder = async () => {
    if (!selectedFolder) return;
    
    try {
      const updatedFolders = await deleteFolder(selectedFolder.id);
      
      // 先にモーダルを閉じて状態をリセット（window.alert は使わない）
      setShowDeleteConfirmModal(false);
      setSelectedFolder(null);
      setFolderQuestions([]);
      
      SoundManager.play('complete');
    } catch (error) {
      console.error('deleteFolder エラー:', error);
      setShowDeleteConfirmModal(false);
    } finally {
      // 退避したフォルダ名をクリア（モーダルが閉じきった後にリセット）
      setFolderNameToDelete('');
    }
  };

  const handleRemoveQuestionFromFolder = (questionId: number) => {
    // Stateを更新して自前モーダルを開く
    setTargetQuestionIdToRemove(questionId);
    setShowRemoveConfirmModal(true);
  };

  const confirmRemoveQuestion = async () => {
    if (!selectedFolder || targetQuestionIdToRemove === null) return;
    try {
      const updatedFolders = await removeQuestionsFromFolder(selectedFolder.id, [targetQuestionIdToRemove]);
      SoundManager.play('delete');
      const updatedFolder = updatedFolders.find(f => f.id === selectedFolder.id);
      if (updatedFolder) {
        setSelectedFolder(updatedFolder);
      }
    } catch (error) {
      console.error('Failed to remove question from folder:', error);
    } finally {
      setShowRemoveConfirmModal(false);
      setTargetQuestionIdToRemove(null);
    }
  };

  const handleAddQuestionsToFolder = async () => {
    
    if (!selectedFolderForAdd) {
      return;
    }
    
    if (selectedQuestionIdsForAdd.length === 0) {
      return;
    }
    
    try {
      
      await addQuestionsToFolder(selectedFolderForAdd.id, selectedQuestionIdsForAdd);
      
      
      setSelectedQuestionIdsForAdd([]);
      setShowAddToFolderModal(false);
      
      SoundManager.play('complete');
    } catch (error) {
      console.error('addQuestionsToFolder エラー:', error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: headerMetrics.gap,
            paddingHorizontal: headerMetrics.padX,
            // スマホ幅で折り返さないようにする
            flexWrap: 'nowrap',
          },
        ]}
      >
        <BackButton
          onPress={() => {
            if (selectedFolder) {
              setSelectedFolder(null);
              setFolderQuestions([]);
            } else {
              navigate('/create');
            }
          }}
        />
        <Text
          style={[
            styles.headerTitle,
            { color: colors.text, fontSize: headerMetrics.titleFontSize, flex: 1, flexShrink: 1 },
          ]}
          numberOfLines={1}
        >
          問題を管理
        </Text>
        <View style={[styles.headerActions, { gap: headerMetrics.gap }]}>
          <View
            style={[
              styles.countBadge,
              {
                backgroundColor: colors.primary,
                paddingHorizontal: headerMetrics.badgePadX,
                paddingVertical: headerMetrics.badgePadY,
              },
            ]}
          >
            <Text style={[styles.countBadgeText, { color: onPrimary }]}>{filteredQuestions.length}</Text>
          </View>
          <PressableButton
            style={[
              styles.headerBtn,
              {
                borderColor: colors.primary,
                backgroundColor: isSelectionMode ? colors.primary : 'transparent',
                paddingHorizontal: headerMetrics.btnPadX,
                paddingVertical: headerMetrics.btnPadY,
              },
            ]}
            onPress={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedQuestionIds([]); }}
          >
            <Text
              style={[
                styles.headerBtnText,
                { color: isSelectionMode ? onPrimary : colors.primary, fontSize: headerMetrics.btnFontSize },
              ]}
            >
              {isSelectionMode ? t.cancelSelection : t.batchEdit}
            </Text>
          </PressableButton>

          {/* 表示モード切替（簡易⇔通常）。スマホ幅で3要素が詰まらないよう narrow ではグリフのみ表示 */}
          <PressableButton
            style={[
              styles.headerBtn,
              {
                borderColor: colors.primary,
                backgroundColor: displayMode === 'compact' ? colors.primary : 'transparent',
                paddingHorizontal: headerMetrics.btnPadX,
                paddingVertical: headerMetrics.btnPadY,
              },
            ]}
            onPress={toggleDisplayMode}
            title={locale === 'ja' ? '表示を切り替え' : 'Toggle view'}
          >
            <Text
              style={[
                styles.headerBtnText,
                { color: displayMode === 'compact' ? onPrimary : colors.primary, fontSize: headerMetrics.btnFontSize },
              ]}
            >
              {screenType === 'mobile'
                ? (displayMode === 'compact' ? '≡' : '≡≡')
                : (displayMode === 'compact' ? (locale === 'ja' ? '通常' : 'Normal') : (locale === 'ja' ? '簡易' : 'Compact'))}
            </Text>
          </PressableButton>
        </View>
      </View>

      {/* セグメントタブ */}
      <View style={[styles.segmentTabContainer, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <PressableButton
          style={[
            styles.segmentTab,
            { 
              borderColor: colors.border,
              backgroundColor: activeTab === 'all' ? colors.primary : 'transparent'
            }
          ]}
          onPress={() => {
            SoundManager.play('decide');
            setActiveTab('all');
            setSelectedFolder(null);
          }}
        >
          <Text style={[
            styles.segmentTabText,
            { 
              color: activeTab === 'all' 
                ? onPrimary
                : colors.text
              }
            ]}>
              {locale === 'ja' ? 'すべての問題' : 'All Questions'}
          </Text>
        </PressableButton>
        <PressableButton
          style={[
            styles.segmentTab,
            { 
              borderColor: colors.border,
              backgroundColor: activeTab === 'folders' ? colors.primary : 'transparent'
            }
          ]}
          onPress={() => {
            SoundManager.play('decide');
            setActiveTab('folders');
            setSelectedFolder(null);
          }}
        >
          <Text style={[
            styles.segmentTabText,
            { 
              color: activeTab === 'folders' 
                ? onPrimary
                : colors.text
              }
            ]}>
              <FolderIcon size={18} color={colors.primary} /> {locale === 'ja' ? '問題集' : 'Folders'}
          </Text>
        </PressableButton>
      </View>

      {isSelectionMode && selectedQuestionIds.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12, paddingHorizontal: 4 }}>
          <PressableButton 
            style={[styles.batchTagBar, { backgroundColor: colors.primary, flex: 1 }]} 
            onPress={() => { setShowBatchTagModal(true); }}
          >
            <Text style={[styles.batchTagBarText, { color: onPrimary }]}> {t.addTagsToSelected} ({selectedQuestionIds.length}{t.questionsSelected})</Text>
          </PressableButton>
          <PressableButton 
            style={[styles.batchTagBar, { backgroundColor: colors.error, flex: 1 }]} 
            onPress={() => {
              batchDeleteQuestions();
            }}
          >
            <Text style={[styles.batchTagBarText, { color: '#ffffff' }]}><Trash2 size={16} color="#fff" /> {locale === 'ja' ? '選択した問題を削除' : 'Delete Selected'} ({selectedQuestionIds.length})</Text>
          </PressableButton>
        </View>
      )}

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.mainScrollContent}
      >
        {activeTab === 'all' ? (
          <>
            {[...filteredQuestions].reverse().map((item) => (
              displayMode === 'compact' ? (
                /* 簡易モード：問題＋答えの2行のみ。展開アイコン・画像・タグ・カードアクションは非表示 */
                <View
                  key={item.id}
                  style={[
                    styles.compactCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  {isSelectionMode && (
                    <PressableButton
                      onPress={() => {
                        setSelectedQuestionIds(prev =>
                          prev.includes(item.id)
                            ? prev.filter(id => id !== item.id)
                            : [...prev, item.id]
                        );
                      }}
                      style={styles.checkbox}
                    >
                      <View
                        style={[
                          styles.checkboxBox,
                          {
                            width: 24,
                            height: 24,
                            borderColor: selectedQuestionIds.includes(item.id) ? colors.primary : colors.border,
                            backgroundColor: selectedQuestionIds.includes(item.id) ? colors.primary + '30' : 'transparent',
                          },
                        ]}
                      >
                        {selectedQuestionIds.includes(item.id) && (
                          <Text style={{ color: getCheckboxTextColor(), fontSize: 14, fontWeight: 'bold' }}>✓</Text>
                        )}
                      </View>
                    </PressableButton>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={[styles.compactQuestion, { color: colors.text }]}>
                      {item.question}
                    </Text>
                    <Text numberOfLines={2} style={[styles.compactAnswer, { color: colors.primary }]}>
                      {getAnswerText(item)}
                    </Text>
                  </View>
                  <PressableButton
                    onPress={() => requestDeleteQuestion(item.id)}
                    style={styles.headerDeleteBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Trash2 size={16} color={colors.error} />
                  </PressableButton>
                </View>
              ) : (
              /* 通常モード：従来の展開カード */
              <View
                key={item.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border, boxShadow: `0px 4px 12px ${colors.primary}0F` },
                  isSelectionMode && styles.batchCompactCard,
                ]}
              >
                {isSelectionMode && (
                  <PressableButton 
                    onPress={() => {
                      if (selectedQuestionIds.includes(item.id)) {
                        setSelectedQuestionIds(prev => prev.filter(id => id !== item.id));
                      } else {
                        setSelectedQuestionIds(prev => [...prev, item.id]);
                      }
                    }} 
                    style={styles.checkbox}
                  >
                    <View style={[
                      styles.checkboxBox,
                      {
                        borderColor: selectedQuestionIds.includes(item.id) ? colors.primary : colors.border,
                        backgroundColor: selectedQuestionIds.includes(item.id) ? colors.primary + '30' : 'transparent',
                      }
                    ]}>
                      {selectedQuestionIds.includes(item.id) && (
                        <Text style={[
                          styles.checkboxText,
                          { 
                            color: getCheckboxTextColor(),
                            fontSize: 16,
                            fontWeight: 'bold',
                          }
                        ]}>
                          
                        </Text>
                      )}
                    </View>
                  </PressableButton>
                )}
                <View style={[styles.cardHeader, isSelectionMode && { paddingVertical: 4, paddingHorizontal: 0 }]}>
                  <PressableButton
                    style={styles.cardHeaderLeft}
                    onPress={() => { setExpandedQuestionId(expandedQuestionId === item.id ? null : item.id); }}
                  >
                    <>
                      <Text style={[styles.typeBadge, { color: colors.primary, backgroundColor: colors.primary + '20' }]}>{item.answerType === 'multiple' ? t.multiple : item.answerType === 'truefalse' ? t.truefalse : t.descriptive}</Text>
                      {item.isShared && <Share2 size={12} color={colors.success} />}
                    </>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.questionPreview, { color: colors.text }]} numberOfLines={2}>{item.question}</Text>
                    </View>
                  </PressableButton>
                  <View style={styles.cardHeaderRight}>
                    <PressableButton
                      style={[{
                        width: 36, height: 36, borderRadius: 18,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: speakingId === item.id ? colors.primary : colors.primary + '20',
                        borderWidth: 1,
                        borderColor: colors.primary + '40',
                      }]}
                      onPress={() => handleSpeak(item)}
                      title={locale === 'ja' ? '問題を読み上げ' : 'Read aloud'}
                      minTouchTarget={false}
                    >
                      <Volume2
                        size={18}
                        color={speakingId === item.id ? onPrimary : colors.primary}
                      />
                    </PressableButton>
                    {(() => {
                      const status = getSrsStatus(item.srs);
                      if (!status) return null;
                      const strength = item.srs?.memoryStrength ?? 0;
                      const barColor = status === 'review' ? colors.error
                        : status === 'learning' ? colors.warning
                        : colors.success;
                      const label = locale === 'ja'
                        ? (status === 'review' ? '要復習' : status === 'learning' ? '学習中' : '定着')
                        : (status === 'review' ? 'Review' : status === 'learning' ? 'Learning' : 'Stable');
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 4 }}>
                          <View style={{
                            width: 60,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: colors.border,
                            overflow: 'hidden',
                          }}>
                            <View style={{
                              width: `${strength}%`,
                              height: '100%',
                              backgroundColor: barColor,
                            }} />
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: barColor }} numberOfLines={1}>
                            {label}
                          </Text>
                        </View>
                      );
                    })()}
                    {item.image && (
                      <View style={[{ borderRadius: 6, overflow: 'hidden', width: 40, height: 40 }]}>
                        <img src={item.image} alt='' className='browse-thumbnail' />
                      </View>
                    )}
                    <PressableButton
                      onPress={() => requestDeleteQuestion(item.id)}
                      style={styles.headerDeleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={18} color={colors.error} />
                    </PressableButton>
                    <PressableButton onPress={() => setExpandedQuestionId(expandedQuestionId === item.id ? null : item.id)}>
                      <Text style={[styles.expandIcon, { color: colors.primary }]}>{expandedQuestionId === item.id ? '▲' : '▼'}</Text>
                    </PressableButton>
                  </View>
                </View>

                {expandedQuestionId === item.id && (
                  <ExpandFade enabled={terminalEffects}>
                  <View style={styles.expandedContent}>
                    {item.isShared && <><Share2 size={14} color={colors.success} style={{ marginRight: 6 }} /><Text style={[{ fontSize: 12, color: colors.success, fontWeight: '700', marginBottom: 6 }]}>{locale === 'ja' ? '共有されて来た問題' : 'Shared Question'}</Text></>}
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
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <PressableButton style={{ flex: 1 }} onPress={() => startEditQuestion(item)}>
                        <Text style={[styles.answerBtnText, { color: colors.primary }]}>編集</Text>
                      </PressableButton>
                      {item.image && (
                        <PressableButton style={{ flex: 1 }} onPress={() => setShowImageId(item.id)}>
                          <Text style={[styles.answerBtnText, { color: colors.primary }]}>
                            {locale === 'ja' ? '画像を表示' : 'Show Image'}
                          </Text>
                        </PressableButton>
                      )}
                      <PressableButton style={{ flex: 1 }} onPress={() => { setShowAnswerId(showAnswerId === item.id ? null : item.id); }}>
                        <Text style={[styles.answerBtnText, { color: colors.primary }]}>
                          {showAnswerId === item.id ? t.hide : t.showAnswer}
                        </Text>
                      </PressableButton>
                    </View>
                    {showAnswerId === item.id && (
                      <View style={[styles.answerBox, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                        <Text style={[styles.answerLabel, { color: colors.success }]}>{t.answerDisplay}:</Text>
                        <Text style={[styles.answerText, { color: colors.text }]}>{getAnswerText(item)}</Text>
                      </View>
                    )}
                  </View>
                  </ExpandFade>
                )}
              </View>
              )
            ))}
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : questions.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noQuestions}</Text>
            ) : null}
          </>
        ) : (
          <>
            {selectedFolder ? (
              /* フォルダ詳細ビュー */
              <View style={styles.folderDetailView}>
                <View style={[styles.folderDetailHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[styles.folderDetailTitle, { color: colors.text }]}><FolderIcon size={20} color={colors.primary} style={{ marginRight: 6 }} />{selectedFolder.name}</Text>
                    <Text style={[styles.folderDetailCount, { color: colors.textSecondary }]}>
                      {folderQuestions.length}{locale === 'ja' ? '問' : ' questions'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 999, position: 'relative' }}>
                    <PressableButton
                      style={[styles.addQuestionsBtn, { backgroundColor: colors.primary }]}
                      onPress={() => {
                        setSelectedFolderForAdd(selectedFolder);
                        setAvailableQuestionsForAdd(questions);
                        setSelectedQuestionIdsForAdd([]);
                        setAddByTagSelectedTags([]);
                        setShowAddToFolderModal(true);
                      }}
                    >
                      <Text style={[styles.addQuestionsBtnText, { color: onPrimary }]}>
                        ＋ {locale === 'ja' ? '問題を追加' : 'Add Questions'}
                      </Text>
                    </PressableButton>
                    <PressableButton
                      style={[styles.deleteFolderBtn, { backgroundColor: colors.error }]}
                      onPress={() => {
                        handleDeleteFolder();
                      }}
                    >
                    <Trash2 size={20} color={colors.text} />
                    </PressableButton>
                    <PressableButton onPress={() => { setSelectedFolder(null); setFolderQuestions([]); }}>
                      <X size={18} color={colors.textSecondary} />
                    </PressableButton>
                  </View>
                </View>
                
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>この問題集の問題</Text>
                {!loading && folderQuestions.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary, padding: 16 }]}>{t.noQuestionsInFolder}</Text>
                ) : (
                  folderQuestions.map(question => (
                    <View key={question.id} style={[styles.folderQuestionItem, { borderBottomColor: colors.border }]}>
                      {isFolderBatchMode && (
                        <PressableButton
                          onPress={() => {
                            setSelectedFolderQuestionIds(prev =>
                              prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]
                            );
                          }}
                          style={styles.checkbox}
                        >
                          <Text style={[styles.checkboxText, { color: '#ffffff' }]}>
                            {selectedFolderQuestionIds.includes(question.id) ? '' : ''}
                          </Text>
                        </PressableButton>
                      )}
                      <View style={styles.folderQuestionContent}>
                        <Text style={[styles.folderQuestionText, { color: colors.text }]} numberOfLines={2}>{question.question}</Text>
                        <View style={styles.folderQuestionActions}>
                           <PressableButton style={[styles.folderActionBtn, { borderColor: colors.primary }]} onPress={() => setShowFolderAnswerId(showFolderAnswerId === question.id ? null : question.id)}>
                             <Text style={[styles.folderActionBtnText, { color: colors.text }]}>{showFolderAnswerId === question.id ? '隠す' : t.showAnswer}</Text>
                           </PressableButton>
                            <PressableButton style={[styles.folderActionBtn, { borderColor: colors.error }]} onPress={() => handleRemoveQuestionFromFolder(question.id)}>
                             <Text style={[styles.folderActionBtnText, { color: colors.error }]}>− 除外</Text>
                           </PressableButton>
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
                {isFolderBatchMode && selectedFolderQuestionIds.length > 0 && (
                  <PressableButton
                    style={[styles.batchTagBar, { backgroundColor: colors.error }]}
                    onPress={async () => {
                      if (!selectedFolder) return;
                      await removeQuestionsFromFolder(selectedFolder.id, selectedFolderQuestionIds);
                      setSelectedFolderQuestionIds([]);
                      setIsFolderBatchMode(false);
                    }}
                  >
                    <Text style={[styles.batchTagBarText, { color: '#fff' }]}>
                      <Trash2 size={16} color="#fff" style={{ marginRight: 6 }} />{locale === 'ja' ? `選択した${selectedFolderQuestionIds.length}問を除外` : `Remove ${selectedFolderQuestionIds.length} questions`}
                    </Text>
                  </PressableButton>
                )}
              </View>
            ) : (
              /* フォルダ一覧ビュー（グリッド） */
              <View style={styles.folderGridView}>
                <View style={styles.folderGridHeader}>
                  <Text style={[styles.folderGridTitle, { color: colors.text }]}>
                    {locale === 'ja' ? '問題集一覧' : 'Folders'}
                  </Text>
                  <PressableButton
                    style={[styles.createFolderBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setNewFolderName('');
                      setShowFolderModal(true);
                    }}
                  >
                    <Text style={[styles.createFolderBtnText, { color: onPrimary }]}>
                      ＋ {locale === 'ja' ? '作成' : 'Create'}
                    </Text>
                  </PressableButton>
                </View>
                
                {visibleFolders.length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t.noFolders}</Text>
                ) : (
                  <View style={styles.folderGrid}>
                    {visibleFolders.map(folder => {
                      const folderQuestionCount = folder.questionIds.length;
                      const isSelected = selectedFolderIds.includes(folder.id);
                      return (
                        <PressableButton
                          key={folder.id}
                          style={[
                            styles.folderCard,
                            { 
                              backgroundColor: colors.card,
                              borderColor: colors.border,
                              boxShadow: `0px 2px 8px ${colors.primary}1A`
                            },
                            isSelected && { backgroundColor: colors.error + '10' }
                          ]}
                          onPress={() => {
                            const questionsInFolder = questions.filter(q => folder.questionIds.includes(q.id));
                            setFolderQuestions(questionsInFolder);
                            setSelectedFolder(folder);
                          }}
                        >
                          <FolderIcon size={32} color={colors.primary} />
                          <Text style={[styles.folderCardName, { color: colors.text }]} numberOfLines={2}>
                            {folder.name}
                          </Text>
                          <View style={[styles.folderCountBadge, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.folderCountBadgeText, { color: onPrimary }]}>
                              {folderQuestionCount}{locale === 'ja' ? '問' : ''}
                            </Text>
                          </View>
                        </PressableButton>
                      );
                    })}
                  </View>
                )}
                
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* 編集モーダル */}
      <Modal visible={showEditModal} transparent={false} animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.card }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20 }}>
            <Text style={[styles.modalTitle, { color: colors.text }]}> 問題を編集</Text>
            <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6 }]}>問題文</Text>
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text, minHeight: 80, textAlignVertical: 'top' }]} value={editQuestionText} onChangeText={setEditQuestionText} placeholder="問題文を入力" placeholderTextColor={colors.textSecondary} multiline />
            <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6, marginTop: 12 }]}> {locale === 'ja' ? '読み仮名（任意）' : 'Reading (optional)'}</Text>
            <TextInput style={[styles.modalInput, { borderColor: colors.border, color: colors.text }]} value={editReading} onChangeText={setEditReading} placeholder={locale === 'ja' ? '例: もり おうがい' : 'e.g., mori ougai'} placeholderTextColor={colors.textSecondary} />
{editingQuestionFull?.answerType === 'descriptive' && (
  <>
    <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 6 }]}>回答</Text>
    {editAnswerGroups.map((group, groupIndex) => (
      <View key={groupIndex} style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderWidth: 2,
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
            <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 13 }}>
              {locale === 'ja' ? ` 正解 ${groupIndex + 1}` : ` Answer ${groupIndex + 1}`}
            </Text>
          </View>
          {editAnswerGroups.length > 1 && groupIndex > 0 && (
            <PressableButton
              style={{ padding: 6, borderRadius: 20, backgroundColor: colors.error + '20' }}
              onPress={() => {
                const newGroups = editAnswerGroups.filter((_, i) => i !== groupIndex);
                setEditAnswerGroups(newGroups.length > 0 ? newGroups : [['']]);
              }}
            >
              <Text style={{ color: colors.error, fontSize: 14, fontWeight: 'bold' }}> {locale === 'ja' ? '削除' : 'Remove'}</Text>
            </PressableButton>
          )}
        </View>
        
        {group.map((answer, answerIndex) => (
          <View key={answerIndex} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '500', minWidth: 24 }}>
              {String.fromCharCode(65 + answerIndex)}
            </Text>
            <TextInput
              style={[styles.modalInput, {
                flex: 1,
                minHeight: 44,
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                color: colors.text,
                fontSize: 14,
              }]}
              value={answer}
              onChangeText={(text) => {
                const newGroups = editAnswerGroups.map(g => [...g]);
                newGroups[groupIndex][answerIndex] = text;
                setEditAnswerGroups(newGroups);
              }}
              placeholder={locale === 'ja' ? '言い換え候補を入力' : 'Enter alternative answer'}
              placeholderTextColor={colors.textSecondary}
            />
            {group.length > 1 && answerIndex > 0 && (
              <PressableButton
                style={{ padding: 6, borderRadius: 16, backgroundColor: colors.error + '20' }}
                onPress={() => {
                  const newGroups = editAnswerGroups.map(g => [...g]);
                  newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== answerIndex);
                  const filtered = newGroups.filter(g => g.length > 0);
                  setEditAnswerGroups(filtered.length > 0 ? filtered : [['']]);
                }}
              >
                <Text style={{ color: colors.error, fontSize: 16, fontWeight: 'bold' }}>×</Text>
              </PressableButton>
            )}
          </View>
        ))}
        
        <PressableButton
          style={{ alignSelf: 'flex-start', marginTop: 6 }}
          onPress={() => {
            const newGroups = editAnswerGroups.map(g => [...g]);
            newGroups[groupIndex] = [...newGroups[groupIndex], ''];
            setEditAnswerGroups(newGroups);
          }}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
            ＋ {locale === 'ja' ? '言い換えを追加' : 'Add alternative'}
          </Text>
        </PressableButton>
      </View>
    ))}
    <PressableButton
      style={{
        backgroundColor: colors.primary + '15',
        borderColor: colors.primary,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginTop: 8,
      }}
      onPress={() => setEditAnswerGroups([...editAnswerGroups, ['']])}
    >
      <Text style={{ color: colors.primary, fontSize: 15, fontWeight: 'bold' }}>
        ＋ {locale === 'ja' ? '新しい正解を追加（複数空欄用）' : 'Add new answer slot (for multiple blanks)'}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
        {locale === 'ja' ? '例：「AとB」のような複数回答が必要な問題に' : 'For questions requiring multiple answers like "A and B"'}
      </Text>
    </PressableButton>
  </>
)}
            {editingQuestionFull?.answerType === 'truefalse' && (
              <>
                <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>回答</Text>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                  <PressableButton style={[styles.modalCancelBtn, { flex: 1, backgroundColor: editTrueFalseAnswer ? colors.success : 'transparent', borderColor: colors.success }]} onPress={() => setEditTrueFalseAnswer(true)}>
                    <Text style={[styles.modalCancelText, { color: editTrueFalseAnswer ? '#fff' : colors.success, fontSize: 20 }]}>○</Text>
                  </PressableButton>
                  <PressableButton style={[styles.modalCancelBtn, { flex: 1, backgroundColor: !editTrueFalseAnswer ? colors.error : 'transparent', borderColor: colors.error }]} onPress={() => setEditTrueFalseAnswer(false)}>
                    <Text style={[styles.modalCancelText, { color: !editTrueFalseAnswer ? '#fff' : colors.error, fontSize: 20 }]}>×</Text>
                  </PressableButton>
                </View>
              </>
            )}
            {editingQuestionFull?.answerType === 'multiple' && (
              <>
                <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 8 }]}>選択肢</Text>
                {editMultipleOptions.map((opt, i) => {
                  const isCorrectOpt = editMultipleCorrectAnswers.includes(i);
                  return (
                    <TextInput key={i} style={[styles.modalInput, { borderColor: isCorrectOpt ? colors.success : colors.border, color: colors.text }]} value={opt} onChangeText={text => { const newOpts = [...editMultipleOptions]; newOpts[i] = text; setEditMultipleOptions(newOpts); }} placeholder={`選択肢 ${i + 1}${isCorrectOpt ? '  正解' : ''}`} placeholderTextColor={isCorrectOpt ? colors.success : colors.textSecondary} />
                  );
                })}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 8 }}>
                  <Text style={[{ fontSize: 13, fontWeight: 'bold', color: colors.textSecondary }]}>正解番号</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>複数正解を許可</Text>
                    <PressableButton
                      style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: editMultipleAllowMultiple ? colors.primary : colors.border, justifyContent: 'center', paddingHorizontal: 3 }}
                      onPress={() => {
                        const next = !editMultipleAllowMultiple;
                        setEditMultipleAllowMultiple(next);
                        if (!next) {
                          setEditMultipleCorrectAnswers(prev => prev.slice(0, 1).length > 0 ? prev.slice(0, 1) : [0]);
                        }
                      }}
                    >
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: editMultipleAllowMultiple ? 'flex-end' : 'flex-start' }} />
                    </PressableButton>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                  {[0, 1, 2, 3].map(i => {
                    const isSel = editMultipleCorrectAnswers.includes(i);
                    return (
                      <PressableButton key={i} style={[styles.modalCancelBtn, { flex: 1, backgroundColor: isSel ? colors.success : 'transparent', borderColor: colors.success }]} onPress={() => {
                        if (editMultipleAllowMultiple) {
                          setEditMultipleCorrectAnswers(prev => {
                            const next = prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i];
                            return next.length > 0 ? next : [i];
                          });
                        } else {
                          setEditMultipleCorrectAnswers([i]);
                        }
                      }}>
                        <Text style={[styles.modalCancelText, { color: isSel ? '#fff' : colors.success }]}>
                          {editMultipleAllowMultiple ? (isSel ? '☑' : '☐') : i + 1}
                        </Text>
                      </PressableButton>
                    );
                  })}
                </View>
              </>
            )}
            <View style={styles.modalButtons}>
              <PressableButton style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowEditModal(false); setEditingQuestionFull(null); }}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>キャンセル</Text></PressableButton>
              <PressableButton style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={saveEditedQuestion}><Text style={styles.modalSaveText}>保存</Text></PressableButton>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* タグ編集モーダル */}
      <Modal visible={showTagModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
               {locale === 'ja' ? 'タグを選択' : 'Select Tags'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
              {locale === 'ja' ? 'タグをタップして選択/解除' : 'Tap to select/deselect tags'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4, paddingHorizontal: 4 }}>
                {tagMasterList.map((tag) => {
                  const isSelected = editTags.includes(tag);
                  return (
                    <PressableButton
                      key={tag}
                      style={[
                        styles.tagButton,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.primary + '20',
                          borderColor: isSelected ? colors.primary : colors.border,
                          borderWidth: 2,
                          borderRadius: 20,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                        },
                      ]}
                      onPress={() => {
                        setEditTags((prev) =>
                          isSelected
                            ? prev.filter((t) => t !== tag)
                            : [...prev, tag]
                        );
                      }}
                      onLongPress={() => {
                        Alert.alert(
                          locale === 'ja' ? 'タグを削除' : 'Delete Tag',
                          locale === 'ja'
                            ? `「${tag}」を全ての問題から削除しますか？`
                            : `Delete "${tag}" from all questions?`,
                          [
                            { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
                            {
                              text: locale === 'ja' ? '削除' : 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                await removeTagFromAllQuestions(tag);
                                await removeTag(tag);
                                setEditTags((prev) => prev.filter((t) => t !== tag));
                                SoundManager.play('delete');
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={[
                        styles.tagButtonText,
                        {
                          color: isSelected ? onPrimary : colors.primary,
                          fontWeight: isSelected ? 'bold' : '500',
                          fontSize: 13,
                        }
                      ]}>
                        {isSelected ? ' ' : ''}{tag}
                      </Text>
                    </PressableButton>
                  );
                })}
              </View>
            </ScrollView>
            
            {/* 空の場合のメッセージ */}
            {tagMasterList.length === 0 && (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 }}>
                {locale === 'ja' ? 'タグがありません。問題作成画面で作成してください。' : 'No tags. Create them in the create screen.'}
              </Text>
            )}
            
            <PressableButton
              style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
              onPress={saveEditedTags}
            >
              <Text style={styles.modalSaveText}>{t.saveTags}</Text>
            </PressableButton>
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
              <PressableButton style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => { setShowFolderModal(false); }}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text></PressableButton>
              <PressableButton style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={handleCreateFolder}><Text style={styles.modalSaveText}>{t.folderCreate}</Text></PressableButton>
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
                        <Text style={[styles.miniTagText, { color: colors.primary, fontSize: 13, fontWeight: 'bold' }]}> {tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}
            <ScrollView style={{ maxHeight: 300 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 }}>
                {tagMasterList.map((tag) => {
                  const isSelected = batchSelectedTags.includes(tag);
                  return (
                    <PressableButton
                      key={tag}
                      style={[
                        styles.tagButton,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.primary + '20',
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => {
                        setBatchSelectedTags((prev) =>
                          isSelected
                            ? prev.filter((t) => t !== tag)
                            : [...prev, tag]
                        );
                      }}
                      onLongPress={() => {
                        Alert.alert(
                          locale === 'ja' ? 'タグを削除' : 'Delete Tag',
                          locale === 'ja'
                            ? `「${tag}」を全ての問題から削除しますか？`
                            : `Delete "${tag}" from all questions?`,
                          [
                            { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
                            {
                              text: locale === 'ja' ? '削除' : 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                await removeTagFromAllQuestions(tag);
                                await removeTag(tag);
                                setBatchSelectedTags((prev) => prev.filter((t) => t !== tag));
                                SoundManager.play('delete');
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={[styles.tagButtonText, { color: isSelected ? '#fff' : colors.primary }]}>
                        {tag}
                      </Text>
                    </PressableButton>
                  );
                })}
              </View>
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, borderColor: colors.border, color: colors.text }]}
                placeholder={locale === 'ja' ? '新しいタグを入力' : 'New tag'}
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={(e) => {
                  const newTag = e.nativeEvent.text.trim();
                  if (newTag && !tagMasterList.includes(newTag)) {
                    addTag(newTag).then(() => {
                      setBatchSelectedTags((prev) => [...prev, newTag]);
                    });
                  }
                }}
              />
            </View>
            <View style={styles.modalButtons}>
              <PressableButton style={[styles.modalCancelBtn, { borderColor: colors.border }]} onPress={() => setShowBatchTagModal(false)}><Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>{t.cancel}</Text></PressableButton>
              <PressableButton style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]} onPress={batchAddTags}><Text style={styles.modalSaveText}>{t.saveTags}</Text></PressableButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* 問題削除確認モーダル（Web では Alert が動作しないため） */}
      <Modal visible={showQuestionDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
               {locale === 'ja' ? '問題を削除' : 'Delete Question'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? 'この問題を削除してもよろしいですか？この操作は取り消せません。'
                : 'Are you sure you want to delete this question? This action cannot be undone.'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <PressableButton
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowQuestionDeleteModal(false);
                  setDeleteTargetId(null);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </PressableButton>
              <PressableButton
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
              </PressableButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* 問題集削除確認モーダル */}
      <Modal visible={showDeleteConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {`『${folderNameToDelete}』を削除しますか？`}
            </Text>
            <Text style={[{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 13 }]}>
              {locale === 'ja' 
                ? 'この操作は取り消せません。'
                : 'This action cannot be undone.'}
            </Text>
            <View style={styles.modalButtons}>
              <PressableButton 
                style={[styles.modalCancelBtn, { borderColor: colors.border }]} 
                onPress={() => setShowDeleteConfirmModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </PressableButton>
              <PressableButton 
                style={[styles.modalSaveBtn, { backgroundColor: colors.error }]} 
                onPress={confirmDeleteFolder}
              >
                <Text style={styles.modalSaveText}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
                </Text>
              </PressableButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* 一括削除確認モーダル */}
      <Modal visible={showBatchDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
               {locale === 'ja' ? '一括削除の確認' : 'Batch Delete Confirmation'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? `選択した${batchDeleteCount}問の問題を削除しますか？\nこの操作は取り消せません。`
                : `Are you sure you want to delete ${batchDeleteCount} selected questions?\nThis action cannot be undone.`}
            </Text>
            <View style={styles.confirmModalButtons}>
              <PressableButton
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowBatchDeleteModal(false);
                  setBatchDeleteCount(0);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </PressableButton>
              <PressableButton
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={confirmBatchDelete}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
                </Text>
              </PressableButton>
            </View>
          </View>
        </View>
      </Modal>

      {/* タグ絞り込みモーダル */}
      <Modal visible={showTagFilterModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}> {t.filterByTags || 'タグで絞り込み'}</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              <PressableButton style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: selectedFilterTag === null ? colors.primary : 'transparent' }} onPress={() => { setSelectedFilterTag(null); setShowTagFilterModal(false); }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: selectedFilterTag === null ? '#fff' : colors.text }}> {locale === 'ja' ? '全問' : 'All'}</Text>
              </PressableButton>
              {availableTags.map(tag => (
                <PressableButton key={tag} style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, marginBottom: 10, borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: selectedFilterTag === tag ? colors.primary : 'transparent' }} onPress={() => { setSelectedFilterTag(tag); setShowTagFilterModal(false); }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: selectedFilterTag === tag ? '#fff' : colors.text }}> {tag}</Text>
                </PressableButton>
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
              <Text style={[styles.folderDetailTitle, { color: colors.text }]}> {selectedFolderForAdd?.name} に問題を追加</Text>
              <PressableButton onPress={() => { setShowAddToFolderModal(false); setSelectedFolderForAdd(null); setSelectedQuestionIdsForAdd([]); }}><Text style={[styles.closeIconButton, { color: colors.textSecondary }]}>✕</Text></PressableButton>
            </View>
            <ScrollView contentContainerStyle={styles.modalListContent}>
              <View style={{ marginBottom: 12, padding: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>
                  {locale === 'ja' ? 'タグで選択' : 'Select by tag'}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {tagMasterList.map(tag => (
                    <PressableButton
                      key={tag}
                      style={[styles.tagButton, {
                        backgroundColor: addByTagSelectedTags.includes(tag) ? colors.primary : colors.background,
                        borderColor: colors.border,
                      }]}
                      onPress={() => {
                        setAddByTagSelectedTags(prev =>
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        );
                      }}
                    >
                      <Text style={{ color: addByTagSelectedTags.includes(tag) ? onPrimary : colors.text, fontSize: 13 }}>
                        {tag}
                      </Text>
                    </PressableButton>
                  ))}
                </View>
                {addByTagSelectedTags.length > 0 && (
                  <PressableButton
                    style={{ padding: 8, borderRadius: 6, backgroundColor: colors.primary + '20', alignItems: 'center' }}
                    onPress={() => {
                      const matchedIds = availableQuestionsForAdd
                        .filter(q => q.tags?.some(tag => addByTagSelectedTags.includes(tag)))
                        .map(q => q.id);
                      setSelectedQuestionIdsForAdd(prev => [...new Set([...prev, ...matchedIds])]);
                    }}
                  >
                    <Text style={{ color: colors.primary, fontSize: 13, fontWeight: 'bold' }}>
                      {locale === 'ja'
                        ? `該当する問題をまとめて選択（${availableQuestionsForAdd.filter(q => q.tags?.some(tag => addByTagSelectedTags.includes(tag))).length}問）`
                        : `Select all matching (${availableQuestionsForAdd.filter(q => q.tags?.some(tag => addByTagSelectedTags.includes(tag))).length})`}
                    </Text>
                  </PressableButton>
                )}
              </View>
              {availableQuestionsForAdd.length === 0 ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>追加できる問題がありません</Text>
              ) : (
                availableQuestionsForAdd.map(question => (
                  <PressableButton key={question.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border }} onPress={() => { setSelectedQuestionIdsForAdd(prev => prev.includes(question.id) ? prev.filter(id => id !== question.id) : [...prev, question.id]); }}>
                    <Text style={[styles.checkboxText, { color: colors.primary }]}>{selectedQuestionIdsForAdd.includes(question.id) ? '' : ''}</Text>
                    <Text style={{ fontSize: 15, flex: 1, lineHeight: 22, color: colors.text }} numberOfLines={2}>{question.question}</Text>
                  </PressableButton>
                ))
              )}
            </ScrollView>
            {selectedQuestionIdsForAdd.length > 0 && (
              <PressableButton 
                style={[styles.addToFolderBar, { backgroundColor: colors.primary, zIndex: 999 }]} 
                onPress={() => {
                  handleAddQuestionsToFolder();
                }}
              >
                <Text style={[styles.addToFolderBarText, { color: onPrimary }]}> 選択した{selectedQuestionIdsForAdd.length}問を追加</Text>
              </PressableButton>
            )}
          </View>
        </View>
      </Modal>

      {/* 画像拡大モーダル */}
      <Modal
        visible={showImageId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImageId(null)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.9)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
          <PressableButton
            style={{ position: 'absolute', top: 40, right: 20, padding: 12, zIndex: 10 }}
            onPress={() => setShowImageId(null)}
          >
            <X size={28} color="#fff" />
          </PressableButton>
          {showImageId !== null && (() => {
            const target = questions.find(q => q.id === showImageId);
            return target?.image ? (
              <img
                src={target.image}
                alt=""
                style={{
                  maxWidth: '100%',
                  maxHeight: '80%',
                  objectFit: 'contain',
                }}
              />
            ) : null;
          })()}
        </View>
      </Modal>

      {/* 除外確認モーダル */}
      <Modal visible={showRemoveConfirmModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
               {locale === 'ja' ? '問題を除外' : 'Remove Question'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja'
                ? 'この問題をフォルダから除外しますか？'
                : 'Remove this question from the folder?'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <PressableButton
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowRemoveConfirmModal(false);
                  setTargetQuestionIdToRemove(null);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </PressableButton>
              <PressableButton
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={confirmRemoveQuestion}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '除外する' : 'Remove'}
                </Text>
              </PressableButton>
            </View>
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
    // スマホ幅で1行に収めるため折り返しは使わない（paddingHorizontal は JSX で動的指定）
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    rowGap: 12,
    columnGap: 12,
  },
  headerTitle: { fontWeight: 'bold', flexShrink: 1, paddingRight: 8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 8 },
  segmentTabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  mainScrollContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 100 },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  card: {
    backgroundColor: '#FFF',
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  cardHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDeleteBtn: { padding: 6, borderRadius: 20 },
  headerDeleteBtnText: { fontSize: 18 },
  // 問題管理画面「簡易モード」のカード（問題＋答えの2行のみ）
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 10,
  },
  compactQuestion: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  compactAnswer: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  questionPreview: { fontSize: 15, fontWeight: '500', flex: 1, lineHeight: 22 },
  expandIcon: { fontSize: 16, fontWeight: 'bold', paddingHorizontal: 8 },
  expandedContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eee', gap: 12 },
  fullQuestion: { fontSize: 16, fontWeight: '500', lineHeight: 24 },
  typeBadge: { fontSize: 12, fontWeight: 'bold', backgroundColor: '#E1EFFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
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
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center' },
  modalSaveText: { color: '#000000', fontWeight: 'bold', fontSize: 15 },
  headerButtonsScroll: { marginBottom: 12 },
  headerButtons: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  headerBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  headerBtnText: { fontSize: 12, fontWeight: 'bold', color: '#ffffff' },
  checkbox: { marginRight: 12, padding: 6 },
  checkboxBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  checkboxText: { fontSize: 18, fontWeight: 'bold' },
  batchTagBar: { marginVertical: 12, padding: 14, borderRadius: 14, alignItems: 'center' },
  batchTagBarText: { color: '#000000', fontWeight: 'bold' },
  folderGridView: { flex: 1 },
  folderGridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 16, marginBottom: 8 },
  folderGridTitle: { fontSize: 18, fontWeight: 'bold' },
  createFolderBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  createFolderBtnText: { fontSize: 14, fontWeight: 'bold' },
  folderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 18 },
  folderCard: {
    width: '48%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
    elevation: 2,
  },
  folderCardCheckbox: { position: 'absolute', top: 8, right: 8 },
  folderCardIcon: { fontSize: 32, marginBottom: 4 },
  folderCardName: { fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  folderCountBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  folderCountBadgeText: { fontSize: 12, fontWeight: 'bold' },
  deleteSelectedBtn: { margin: 18, padding: 14, borderRadius: 14, alignItems: 'center' },
  deleteSelectedBtnText: { fontSize: 14, fontWeight: 'bold' },
  addToFolderBar: { marginTop: 16, padding: 16, borderRadius: 14, alignItems: 'center' },
  addToFolderBarText: { fontWeight: 'bold', fontSize: 14 },
  folderDetailView: { flex: 1, paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  folderDetailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 12 },
  folderDetailTitle: { fontSize: 20, fontWeight: 'bold', flexShrink: 1, lineHeight: 26 },
  folderDetailCount: { fontSize: 14, fontWeight: '500' },
  folderDetailHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative', zIndex: 999 },
  addQuestionsBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  addQuestionsBtnText: { fontSize: 13, fontWeight: 'bold' },
  deleteFolderBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  deleteFolderBtnText: { 
    fontSize: 18
  },
  folderDetailContainer: { width: '90%', maxWidth: 500, padding: 24, borderRadius: 20, maxHeight: '80%' },
  sectionSubtitle: { fontSize: 13, fontWeight: 'bold', marginTop: 6, marginBottom: 4, marginHorizontal: 4, letterSpacing: 0.2 },
  folderQuestionItem: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1 },
  folderQuestionContent: { gap: 12, paddingTop: 2 },
  folderQuestionText: { fontSize: 15, lineHeight: 22 },
  folderQuestionActions: { flexDirection: 'row', gap: 10, marginTop: 2, flexWrap: 'wrap' },
  folderActionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  folderActionBtnText: { 
    fontSize: 13, 
    fontWeight: 'bold'
  },
  countBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12 },
  countBadgeText: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
  compactAnswerText: { fontSize: 11, lineHeight: 14, fontStyle: 'italic' },
  closeIconButton: { fontSize: 20, fontWeight: 'bold', padding: 4 },
  modalListContent: { paddingHorizontal: 2, paddingBottom: 8 },
  tagButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  tagButtonText: { fontSize: 13, fontWeight: 'bold' },
  speakBtnText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  shareBtnText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  batchCompactCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 10,
  },
  batchCompactQuestionText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
});

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { STORAGE_KEYS } from './constants/storageKeys';

interface ReceivedItem {
  id: string;
  type: 'question' | 'folder';
  data: any;
  receivedAt: number;
  senderCode: string;
}

export default function InboxScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // 削除確認モーダル用 state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadReceivedItems();
  }, []);

  const loadReceivedItems = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.INBOX_ITEMS);
      const items = raw ? JSON.parse(raw) : [];
      setReceivedItems(items);
    } catch (error) {
      console.error('Failed to load inbox:', error);
    }
  };

  /**
   * 重複チェック: 同じ送信者から同じ内容のアイテムが既に存在するか
   */
  const isDuplicate = (item: ReceivedItem): boolean => {
    return receivedItems.some(existing =>
      existing.id !== item.id &&
      existing.senderCode === item.senderCode &&
      existing.type === item.type &&
      (item.type === 'question'
        ? existing.data.question === item.data.question
        : existing.data.name === item.data.name)
    );
  };

  const transferToManagement = async () => {
    if (selectedItems.length === 0) {
      Alert.alert(
        locale === 'ja' ? '選択なし' : 'No selection',
        locale === 'ja' ? '転送する項目を選択してください' : 'Select items to transfer'
      );
      return;
    }

    try {
      const itemsToTransfer = receivedItems.filter(item => selectedItems.includes(item.id));
      let totalAdded = 0;

      // 1. 問題（question）を転送
      const questionsToAdd = itemsToTransfer
        .filter(item => item.type === 'question')
        .map(item => ({
          ...item.data,
          id: Date.now() + Math.random(),
          isShared: true,
          sharedMark: '🔗',
          originalInboxId: item.id,
        }));

      if (questionsToAdd.length > 0) {
        const existingQuestions = JSON.parse(
          await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS) || '[]'
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.QUIZ_QUESTIONS,
          JSON.stringify([...existingQuestions, ...questionsToAdd])
        );
        totalAdded += questionsToAdd.length;
      }

      // 2. 問題集（folder）を転送
      const foldersToAdd = itemsToTransfer
        .filter(item => item.type === 'folder')
        .map(item => {
          const folderData = item.data;
          const newFolderId = Date.now() + Math.random();

          const newQuestionIds: number[] = [];
          const newQuestions: any[] = [];

          (folderData.questions || []).forEach((q: any) => {
            const newQuestionId = Date.now() + Math.random();
            newQuestions.push({
              ...q,
              id: newQuestionId,
              isShared: true,
              sharedMark: '🔗',
              originalFolderId: newFolderId,
            });
            newQuestionIds.push(newQuestionId);
          });

          return {
            name: folderData.name,
            description: folderData.description || '',
            id: newFolderId,
            questionIds: newQuestionIds,
            questions: newQuestions,
            isShared: true,
            originalInboxId: item.id,
          };
        });

      if (foldersToAdd.length > 0) {
        const allNewQuestions = foldersToAdd.flatMap(f => f.questions || []);

        const existingQuestions = JSON.parse(
          await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS) || '[]'
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.QUIZ_QUESTIONS,
          JSON.stringify([...existingQuestions, ...allNewQuestions])
        );

        const foldersToSave = foldersToAdd.map(({ questions, ...folder }) => folder);

        const existingFolders = JSON.parse(
          await AsyncStorage.getItem(STORAGE_KEYS.QUESTION_FOLDERS) || '[]'
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.QUESTION_FOLDERS,
          JSON.stringify([...existingFolders, ...foldersToSave])
        );
        totalAdded += foldersToAdd.length;
      }

      // 3. 転送済みアイテムを受信ボックスから削除
      const remaining = receivedItems.filter(item => !selectedItems.includes(item.id));
      await AsyncStorage.setItem(STORAGE_KEYS.INBOX_ITEMS, JSON.stringify(remaining));

      setReceivedItems(remaining);
      setSelectedItems([]);

      SoundManager.play('complete');
      Alert.alert(
        locale === 'ja' ? '転送完了' : 'Transfer Complete',
        locale === 'ja' 
          ? `${totalAdded}個のアイテムを転送しました`
          : `Transferred ${totalAdded} items`
      );
    } catch (error) {
      console.error('Failed to transfer:', error);
      Alert.alert(locale === 'ja' ? 'エラー' : 'Error', locale === 'ja' ? '転送に失敗しました' : 'Transfer failed');
    }
  };

  const deleteItem = (itemId: string) => {
    setPendingDeleteId(itemId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteItem = async () => {
    if (!pendingDeleteId) return;

    try {
      const remaining = receivedItems.filter(item => item.id !== pendingDeleteId);
      await AsyncStorage.setItem(STORAGE_KEYS.INBOX_ITEMS, JSON.stringify(remaining));
      setReceivedItems(remaining);
      setSelectedItems(selectedItems.filter(id => id !== pendingDeleteId));
      SoundManager.play('complete');
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setShowDeleteConfirm(false);
      setPendingDeleteId(null);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    if (selectedItems.includes(itemId)) {
      setSelectedItems(selectedItems.filter(id => id !== itemId));
    } else {
      setSelectedItems([...selectedItems, itemId]);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ヘッダー */}
      <View
        style={[
          {
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }
        ]}
      >
        <Text style={[{ fontSize: 18, fontWeight: '700', color: colors.text }]}>
          📬 {locale === 'ja' ? '受信ボックス' : 'Inbox'}
        </Text>

        <TouchableOpacity
          style={[styles.closeButton, { backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 8 }]}
          onPress={() => {
            SoundManager.play('decide');
            navigate('/');
          }}
        >
          <Text style={[styles.closeButtonText, { color: onPrimary }]}>
            {locale === 'ja' ? '戻る' : 'Back'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, padding: 16, backgroundColor: colors.background }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
        {/* 情報表示 */}
        <View style={[{ backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 16 }]}>
          <Text style={[{ color: colors.textSecondary, fontSize: 12 }]}>
            {locale === 'ja' 
              ? `${receivedItems.length}個のアイテムを受信しました`
              : `Received ${receivedItems.length} items`
            }
          </Text>
          <Text style={[{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }]}>
            {locale === 'ja' 
              ? `${selectedItems.length}個を選択`
              : `${selectedItems.length} selected`
            }
          </Text>
        </View>

        {/* アイテム一覧 */}
        {receivedItems.length === 0 ? (
          <View style={[{ alignItems: 'center', paddingVertical: 40 }]}>
            <Text style={[{ color: colors.textSecondary }]}>
              {locale === 'ja' ? 'アイテムがありません' : 'No items'}
            </Text>
          </View>
        ) : (
          receivedItems.map(item => (
            <View
              key={item.id}
              style={[
                {
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 12,
                  borderWidth: selectedItems.includes(item.id) ? 2 : 1,
                  borderColor: selectedItems.includes(item.id) ? colors.primary : colors.border,
                  flexDirection: 'row',
                  gap: 12,
                }
              ]}
            >
              {/* チェックボックス */}
              <TouchableOpacity
                style={[
                  {
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: colors.primary,
                    backgroundColor: selectedItems.includes(item.id) ? colors.primary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 2,
                  }
                ]}
                onPress={() => toggleItemSelection(item.id)}
              >
                {selectedItems.includes(item.id) && (
                  <Text style={[{ color: onPrimary, fontWeight: '700' }]}>✓</Text>
                )}
              </TouchableOpacity>

              {/* コンテンツ */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[{ fontSize: 14, fontWeight: '700', color: colors.text }]}>
                    {item.type === 'question' 
                      ? `📝 ${locale === 'ja' ? '問題' : 'Question'}`
                      : `📚 ${locale === 'ja' ? '問題集' : 'Folder'}`
                    }
                  </Text>
                </View>

                <Text style={[{ fontSize: 13, color: colors.text, marginBottom: 4, lineHeight: 18 }]}>
                  {item.type === 'question'
                    ? (item.data.question?.substring(0, 60) + (item.data.question?.length > 60 ? '...' : ''))
                    : (item.data.name || 'Unnamed Folder')
                  }
                </Text>

                <Text style={[{ fontSize: 11, color: colors.textSecondary }]}>
                  {locale === 'ja' 
                    ? `受信日時: ${new Date(item.receivedAt).toLocaleString('ja-JP')}`
                    : `Received: ${new Date(item.receivedAt).toLocaleString('en-US')}`
                  }
                </Text>

                {/* 重複警告 */}
                {isDuplicate(item) && (
                  <View style={[styles.duplicateWarning, { backgroundColor: colors.warning + '20' }]}>
                    <Text style={[styles.duplicateWarningText, { color: colors.warning }]}>
                      ⚠️ {locale === 'ja' ? 'このユーザーから既に受信済みです' : 'Already received from this user'}
                    </Text>
                  </View>
                )}
              </View>

              {/* 削除ボタン */}
              <TouchableOpacity
                onPress={() => deleteItem(item.id)}
                style={[{ justifyContent: 'center', alignItems: 'center', padding: 4 }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.deleteIcon, { color: colors.error }]}>🗑️</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* アクションボタン */}
      {receivedItems.length > 0 && (
        <View style={[{ paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderTopWidth: 1, borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[
              {
                backgroundColor: colors.primary,
                padding: 14,
                borderRadius: 12,
                alignItems: 'center',
              }
            ]}
            onPress={transferToManagement}
            disabled={selectedItems.length === 0}
          >
            <Text style={[{ color: onPrimary, fontWeight: '700', fontSize: 16 }]}>
              ✅ {locale === 'ja' ? '問題管理に転送' : 'Transfer to Management'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              {
                backgroundColor: colors.border,
                padding: 12,
                borderRadius: 12,
                alignItems: 'center',
              }
            ]}
            onPress={() => setSelectedItems([])}
          >
            <Text style={[{ color: colors.text, fontWeight: '600', fontSize: 14 }]}>
              {locale === 'ja' ? 'すべて選択解除' : 'Deselect All'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 削除確認モーダル */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmModalTitle, { color: colors.text }]}>
              🗑️ {locale === 'ja' ? '削除確認' : 'Delete Confirmation'}
            </Text>
            <Text style={[styles.confirmModalMessage, { color: colors.textSecondary }]}>
              {locale === 'ja' 
                ? 'このアイテムを削除してもよろしいですか？'
                : 'Are you sure you want to delete this item?'}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity 
                style={[styles.confirmModalCancel, { borderColor: colors.border }]}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  setPendingDeleteId(null);
                }}
              >
                <Text style={[styles.confirmModalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmModalConfirm, { backgroundColor: colors.error }]}
                onPress={confirmDeleteItem}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  duplicateWarning: {
    marginTop: 8,
    padding: 6,
    borderRadius: 6,
  },
  duplicateWarningText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deleteIcon: {
    fontSize: 18,
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  confirmModalContainer: {
    width: '80%',
    maxWidth: 300,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  confirmModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmModalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  confirmModalCancelText: {
    fontWeight: 'bold',
  },
  confirmModalConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmModalConfirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
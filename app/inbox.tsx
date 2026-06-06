import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';

interface ReceivedItem {
  id: string;
  type: 'question' | 'folder';
  data: any;
  receivedAt: number;
  senderCode: string;
}

export default function InboxScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const locale = useLocale();
  const t = translations[locale];

  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  useEffect(() => {
    loadReceivedItems();
  }, []);

  const loadReceivedItems = async () => {
    try {
      const raw = await AsyncStorage.getItem('inbox_items');
      const items = raw ? JSON.parse(raw) : [];
      setReceivedItems(items);
    } catch (error) {
      console.error('Failed to load inbox:', error);
    }
  };

  const transferToManagement = async () => {
    if (selectedItems.length === 0) {
      Alert.alert(
        locale === 'ja' ? '選択なし' : 'No selection',
        locale === 'ja' ? '転送する問題を選択してください' : 'Select items to transfer'
      );
      return;
    }

    try {
      const itemsToTransfer = receivedItems.filter(item => selectedItems.includes(item.id));
      
      if (itemsToTransfer.some(item => item.type === 'question')) {
        const questions = itemsToTransfer
          .filter(item => item.type === 'question')
          .map(item => ({
            ...item.data,
            id: Date.now() + Math.random(),
            isShared: true,
            sharedMark: '🔗',
            originalId: item.id,
          }));

        const existing = JSON.parse(await AsyncStorage.getItem('quiz_questions') || '[]');
        await AsyncStorage.setItem('quiz_questions', JSON.stringify([...existing, ...questions]));
      }

      if (itemsToTransfer.some(item => item.type === 'folder')) {
        const folders = itemsToTransfer
          .filter(item => item.type === 'folder')
          .map(item => ({
            ...item.data,
            id: Date.now() + Math.random(),
            isShared: true,
            sharedMark: '🔗',
          }));

        const existing = JSON.parse(await AsyncStorage.getItem('question_folders') || '[]');
        await AsyncStorage.setItem('question_folders', JSON.stringify([...existing, ...folders]));
      }

      const remaining = receivedItems.filter(item => !selectedItems.includes(item.id));
      await AsyncStorage.setItem('inbox_items', JSON.stringify(remaining));

      setReceivedItems(remaining);
      setSelectedItems([]);

      SoundManager.play('complete');
      Alert.alert(
        locale === 'ja' ? '転送完了' : 'Transfer Complete',
        locale === 'ja' ? `${selectedItems.length}個のアイテムを転送しました` : `Transferred ${selectedItems.length} items`
      );
    } catch (error) {
      console.error('Failed to transfer:', error);
      Alert.alert(locale === 'ja' ? 'エラー' : 'Error', locale === 'ja' ? '転送に失敗しました' : 'Transfer failed');
    }
  };

  const deleteItem = async (itemId: string) => {
    Alert.alert(
      locale === 'ja' ? '削除確認' : 'Delete',
      locale === 'ja' ? 'このアイテムを削除しますか？' : 'Delete this item?',
      [
        { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel' },
        {
          text: locale === 'ja' ? '削除' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const remaining = receivedItems.filter(item => item.id !== itemId);
              await AsyncStorage.setItem('inbox_items', JSON.stringify(remaining));
              setReceivedItems(remaining);
              setSelectedItems(selectedItems.filter(id => id !== itemId));
              SoundManager.play('complete');
            } catch (error) {
              console.error('Failed to delete:', error);
            }
          }
        }
      ]
    );
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
          style={[
            {
              paddingVertical: 8,
              paddingHorizontal: 12,
              backgroundColor: '#FFFFFF',
              borderWidth: 2,
              borderColor: colors.text || '#000000',
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }
          ]}
          onPress={() => {
            SoundManager.play('decide');
            navigate('/');
          }}
        >
          <Text style={[{ color: colors.text || '#000000', fontWeight: '700', fontSize: 13 }]}>
            {t.back}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, padding: 16 }}>
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
              </View>

              {/* 削除ボタン */}
              <TouchableOpacity
                onPress={() => deleteItem(item.id)}
                style={[{ justifyContent: 'center', alignItems: 'center', padding: 4 }]}
              >
                <Text style={[{ color: colors.error, fontSize: 16 }]}>🗑️</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
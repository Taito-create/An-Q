import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  FlatList,
  Modal,
} from 'react-native';
import { ListPlus, AlertTriangle, Info } from 'lucide-react';
import { useTheme } from './theme';
import { useLocale } from './hooks/useLocale';
import PressableButton from './components/PressableButton';
import BackButton from './components/BackButton';
import { useQuestionsContext } from './context/QuestionsContext';
import { useAuth } from './auth/AuthContext';
import { SoundManager } from './sound';
import { Question } from './types/question';
import { parseBulkText, expandAnswerCandidates, ParsedPair } from './utils/bulkParser';
import { awardQuestionCreationBulk } from '../src/utils/userProgress';
import { incrementStat } from './missions';

/** プレビューは FlatList（仮想化）で描画し、500語でも重くならないようにする */
const PREVIEW_WINDOW = 200;

export default function CreateBulkScreen() {
  const { colors } = useTheme();
  const locale = useLocale();
  const {
    applyQuestionsChange,
    tagMasterList,
    addTag,
    removeTag,
    removeTagFromAllQuestions,
  } = useQuestionsContext();
  const { user } = useAuth();

  const [bulkText, setBulkText] = useState('');
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // タグ削除確認モーダル用（create.tsx と同一の UX にするため移植）
  const [showTagDeleteModal, setShowTagDeleteModal] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<string | null>(null);

  // パース結果は300msデバウンスで更新する（毎キー入力時の再計算を避ける）
  const [debouncedText, setDebouncedText] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTextChange = useCallback((text: string) => {
    setBulkText(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedText(text), 300);
  }, []);

  // アンマウント時にデバウンスタイマーを破棄する
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // パースは useMemo でメモ化し、テキストが変わらない限り再計算しない
  const { pairs, errors, duplicates } = useMemo(
    () => parseBulkText(debouncedText),
    [debouncedText]
  );

  // プレビュー表示用に先頭 N 件だけ切り出す（FlatList の item を軽く保つ）
  const previewPairs = useMemo(
    () => pairs.slice(0, PREVIEW_WINDOW),
    [pairs]
  );

  const showToastNotification = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleAddTagFromInput = async () => {
    const tag = bulkTagInput.trim();
    if (!tag) return;
    if (!bulkTags.includes(tag)) {
      setBulkTags(prev => [...prev, tag]);
    }
    // tagMasterList に未登録なら追加して、以降の選択候補にする
    if (!tagMasterList.includes(tag)) {
      try {
        await addTag(tag);
      } catch (e) {
        console.warn('addTag failed:', e);
      }
    }
    setBulkTagInput('');
    SoundManager.play('decide');
  };

  const toggleTag = (tag: string) => {
    setBulkTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
    SoundManager.play('decide');
  };

  // 長押しで削除確認モーダルを開く（create.tsx と同じ操作体系）
  const handleTagLongPress = (tag: string) => {
    setTagToDelete(tag);
    setShowTagDeleteModal(true);
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (pairs.length === 0) {
      Alert.alert(
        locale === 'ja' ? 'エラー' : 'Error',
        locale === 'ja' ? '保存できる問題がありません' : 'No questions to save'
      );
      return;
    }

    // エラーがあっても、確認の上ならパースできた分のみ保存する
    if (errors.length > 0) {
      const confirmed = await new Promise<boolean>(resolve => {
        Alert.alert(
          locale === 'ja' ? 'エラーがあります' : 'There are errors',
          locale === 'ja'
            ? `${errors.length}件のエラーがあります。${pairs.length}件のみ保存しますか?`
            : `${errors.length} errors. Save only ${pairs.length} questions?`,
          [
            { text: locale === 'ja' ? 'キャンセル' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: locale === 'ja' ? '保存する' : 'Save', onPress: () => resolve(true) },
          ]
        );
      });
      if (!confirmed) return;
    }

    setIsSaving(true);
    try {
      const now = Date.now();
      const newQuestions: Question[] = pairs.map((pair: ParsedPair, idx: number) => ({
        // 同ミリ秒内でも衝突しないよう連番を足す
        id: now * 1000 + idx,
        question: pair.question,
        answerType: 'descriptive',
        descriptiveAnswerGroups: [expandAnswerCandidates(pair.answer)],
        matchMode: 'any',
        enabled: true,
        tags: bulkTags,
        mistakeCount: 0,
        createdAt: now,
        isShared: false,
      }));

      // 全問を1回の書き込みでまとめて追加する（通信は1回）
      await applyQuestionsChange(current => [...current, ...newQuestions]);

      // 統計・XPもまとめて1回だけ更新する
      await incrementStat('questionsCreated', newQuestions.length);
      if (user?.uid) {
        try {
          await awardQuestionCreationBulk(user.uid, newQuestions.length);
        } catch (e) {
          console.warn('awardQuestionCreationBulk failed:', e);
        }
      }

      SoundManager.play('complete');
      showToastNotification(
        locale === 'ja'
          ? `${newQuestions.length}件の問題を作成しました`
          : `Created ${newQuestions.length} questions`
      );

      // テキストだけクリアして同じ画面に留まる（連続貼り付けを可能にする）
      setBulkText('');
      setDebouncedText('');
    } catch (e) {
      console.error('Bulk save error:', e);
      Alert.alert(
        locale === 'ja' ? 'エラー' : 'Error',
        locale === 'ja' ? '保存に失敗しました' : 'Failed to save'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <BackButton to="/create" />
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          <ListPlus size={22} color={colors.primary} />{' '}
          {locale === 'ja' ? 'まとめて作成' : 'Bulk Create'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        {/* 説明 */}
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Info size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {locale === 'ja'
              ? '英単語と意味を交互に貼り付けてください（例: give up 諦める）。Enter や改行で区切っても構いません。'
              : 'Paste words and meanings alternately (e.g. give up 諦める). Newlines work too.'}
          </Text>
        </View>

        {/* テキストエリア */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>
            {locale === 'ja' ? '英単語リスト' : 'Word List'}
          </Text>
          <TextInput
            style={[
              styles.textArea,
              { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
            ]}
            multiline
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="none"
            value={bulkText}
            onChangeText={handleTextChange}
            placeholder={locale === 'ja' ? '例: give up 諦める take off 離陸する apple りんご（果物）' : 'e.g. give up 諦める take off 離陸する'}
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* タグ入力欄 */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.text }]}>
            {locale === 'ja' ? '全問に付与するタグ' : 'Tags for all questions'}
          </Text>
          <View style={styles.tagInputRow}>
            <TextInput
              style={[
                styles.tagInput,
                { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
              ]}
              value={bulkTagInput}
              onChangeText={setBulkTagInput}
              onSubmitEditing={handleAddTagFromInput}
              returnKeyType="done"
              autoCorrect={false}
              placeholder={locale === 'ja' ? 'タグを入力' : 'Enter a tag'}
              placeholderTextColor={colors.textSecondary}
            />
            <PressableButton
              onPress={handleAddTagFromInput}
              style={[styles.tagAddButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.tagAddButtonText, { color: colors.onPrimary }]}>＋</Text>
            </PressableButton>
          </View>

          {/* 選択済みタグ */}
          {bulkTags.length > 0 && (
            <View style={styles.chipWrap}>
              {bulkTags.map(tag => (
                <PressableButton
                  key={`sel-${tag}`}
                  onPress={() => toggleTag(tag)}
                  onLongPress={() => handleTagLongPress(tag)}
                  style={[styles.chip, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  <Text style={[styles.chipText, { color: colors.onPrimary }]}>{tag}</Text>
                </PressableButton>
              ))}
            </View>
          )}

          {/* tagMasterList から選択 */}
          {tagMasterList.length > 0 && (
            <View style={styles.chipWrap}>
              {tagMasterList.map(tag => {
                const selected = bulkTags.includes(tag);
                return (
                  <PressableButton
                    key={`master-${tag}`}
                    onPress={() => toggleTag(tag)}
                    onLongPress={() => handleTagLongPress(tag)}
                    style={[
                      styles.chip,
                      {
                        // 選択済み: primary 背景 + primary 枠
                        // 未選択: primary 20% の淡い背景 + border 枠（create.tsx と統一）
                        backgroundColor: selected ? colors.primary : colors.primary + '20',
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: selected ? colors.onPrimary : colors.primary },
                      ]}
                    >
                      {tag}
                    </Text>
                  </PressableButton>
                );
              })}
            </View>
          )}
        </View>

        {/* 件数表示 */}
        {pairs.length > 0 && (
          <Text style={[styles.countText, { color: colors.primary }]}>
            {locale === 'ja'
              ? `${pairs.length}件の問題を作成します`
              : `${pairs.length} questions will be created`}
          </Text>
        )}

        {/* 重複警告（保存自体は許容） */}
        {duplicates.length > 0 && (
          <View style={[styles.warnBox, { backgroundColor: colors.card, borderColor: colors.warning }]}>
            <AlertTriangle size={16} color={colors.warning} />
            <Text style={[styles.warnText, { color: colors.warning }]}>
              {locale === 'ja'
                ? `重複した英単語: ${duplicates.join(', ')}`
                : `Duplicated words: ${duplicates.join(', ')}`}
            </Text>
          </View>
        )}

        {/* パースエラー */}
        {errors.length > 0 && (
          <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.error }]}>
            <AlertTriangle size={16} color={colors.error} />
            <View style={{ flex: 1 }}>
              {errors.slice(0, 20).map((err, i) => (
                <Text key={i} style={[styles.errorText, { color: colors.error }]}>• {err}</Text>
              ))}
              {errors.length > 20 && (
                <Text style={[styles.errorText, { color: colors.error }]}>
                  … {locale === 'ja' ? `他 ${errors.length - 20}件` : `${errors.length - 20} more`}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* プレビュー（FlatList で仮想化） */}
        {previewPairs.length > 0 && (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>
              {locale === 'ja'
                ? `プレビュー（先頭 ${previewPairs.length}件）`
                : `Preview (first ${previewPairs.length})`}
            </Text>
            <View style={styles.previewListWrap}>
              <FlatList
                data={previewPairs}
                keyExtractor={(item, index) => `${item.question}-${index}`}
                renderItem={({ item, index }) => (
                  <View style={[styles.previewRow, { borderColor: colors.border }]}>
                    <Text style={[styles.previewIndex, { color: colors.textSecondary }]}>
                      {index + 1}.
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.previewQuestion, { color: colors.text }]}>{item.question}</Text>
                      <Text style={[styles.previewAnswer, { color: colors.primary }]}>{item.answer}</Text>
                    </View>
                  </View>
                )}
                initialNumToRender={15}
                maxToRenderPerBatch={15}
                windowSize={7}
                removeClippedSubviews
              />
            </View>
          </View>
        )}

        {/* 保存ボタン */}
        <PressableButton
          onPress={handleSave}
          disabled={pairs.length === 0 || isSaving}
          style={[
            styles.saveButton,
            {
              backgroundColor: pairs.length === 0 || isSaving ? colors.border : colors.primary,
            },
          ]}
        >
          <Text style={[styles.saveButtonText, { color: colors.onPrimary }]}>
            {isSaving
              ? (locale === 'ja' ? '保存中...' : 'Saving...')
              : (locale === 'ja' ? 'まとめて保存' : 'Save All')}
          </Text>
        </PressableButton>
      </ScrollView>

      {/* Toast */}
      {showToast && (
        <PressableButton
          style={[styles.toast, { backgroundColor: colors.success }]}
          onPress={() => setShowToast(false)}
        >
          <Text style={[styles.toastText, { color: '#fff' }]}>{toastMessage}</Text>
        </PressableButton>
      )}

      {/* タグ削除確認モーダル（create.tsx と同一） */}
      <Modal visible={showTagDeleteModal} transparent animationType="fade" statusBarTranslucent={true}>
        <View style={[styles.modalOverlay, { zIndex: 9999 }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {locale === 'ja' ? 'タグを削除' : 'Delete Tag'}
            </Text>
            <Text style={[{ color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontSize: 14, lineHeight: 22 }]}>
              {locale === 'ja'
                ? `「${tagToDelete}」を全ての問題から削除しますか？\nこの操作は取り消せません。`
                : `Delete "${tagToDelete}" from all questions?\nThis action cannot be undone.`}
            </Text>
            <View style={styles.modalButtons}>
              <PressableButton
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setShowTagDeleteModal(false);
                  setTagToDelete(null);
                }}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>
                  {locale === 'ja' ? 'キャンセル' : 'Cancel'}
                </Text>
              </PressableButton>
              <PressableButton
                style={[styles.modalSaveBtn, { backgroundColor: colors.error }]}
                onPress={async () => {
                  if (tagToDelete) {
                    await removeTagFromAllQuestions(tagToDelete);
                    await removeTag(tagToDelete);
                    setBulkTags(prev => prev.filter(t => t !== tagToDelete));
                    SoundManager.play('delete');

                    setShowTagDeleteModal(false);
                    setTagToDelete(null);
                  }
                }}
              >
                <Text style={[styles.modalSaveText, { color: '#ffffff' }]}>
                  {locale === 'ja' ? '削除する' : 'Delete'}
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
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', flex: 1 },
  content: { padding: 12, gap: 12 },
  infoBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  section: { padding: 12, borderRadius: 12, borderWidth: 1 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  textArea: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  tagInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  tagInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 40,
  },
  tagAddButton: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagAddButtonText: { fontSize: 18, fontWeight: 'bold' },
  // gap で間隔を作るため、chip の marginRight は 0 に戻して二重余白を避ける
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  // create.tsx の tagChip と同じ値に統一する（borderRadius: 999 の完全な円形をやめる）
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 0,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  countText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  warnBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18 },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  errorText: { fontSize: 13, lineHeight: 18 },
  previewListWrap: { maxHeight: 320 },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  previewIndex: { fontSize: 13, fontWeight: '700', minWidth: 24 },
  previewQuestion: { fontSize: 15, fontWeight: '600' },
  previewAnswer: { fontSize: 13, marginTop: 2 },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonText: { fontSize: 16, fontWeight: 'bold' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  toastText: { fontSize: 15, fontWeight: '600' },

  // ── タグ削除確認モーダル（create.tsx の値と完全一致） ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContainer: {
    width: '85%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelText: { fontWeight: 'bold' },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  // ※ create.tsx と同じ基底値を定義し、JSX側で '#ffffff' が上書きされる
  //   （削除ボタンは白抜き。基底の '#000000' は create.tsx 由来の既存仕様）
  modalSaveText: { color: '#000000', fontWeight: 'bold', fontSize: 15 },
});
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question } from '../types/question';
import { STORAGE_KEYS } from '../constants/storageKeys';

/**
 * 回答を正規化して比較用の文字列に変換
 * - NFKC正規化（全角英数字→半角、全角カタカナ→半角カタカナなど）
 * - trim
 * - 空白正規化（連続する空白を1つに、前後の空白を削除）
 * - 小文字化
 *
 * 注意: カタカナ⇔ひらがなの統一は既存仕様への影響が大きいため、
 *       必要に応じて別途オプションで検討してください。
 *
 * @param text 正規化対象の文字列
 * @returns 正規化された文字列
 */
export const normalizeForCompare = (text: string): string => {
  return text
    .normalize('NFKC') // 全角英数字・記号を半角に、全角カタカナを半角カタカナに
    .trim() // 前後の空白を削除
    .replace(/\s+/g, ' ') // 連続する空白（全角・半角含む）を1つの半角スペースに
    .toLowerCase(); // 小文字化
};

export const checkDescriptiveAnswer = (userAnswer: string, question: Question): boolean => {
  const groups = getAnswerGroups(question);
  if (groups.length === 0) {
    return false;
  }

  // 判定共通ロジック：正解が3文字以上なら部分一致も許可、
  // 1〜2文字は完全一致のみ（誤判定防止のため、既存仕様と同じ）
  const matchesAny = (userPart: string, candidates: string[]): boolean => {
    const normalizedUserPart = normalizeForCompare(userPart);
    return candidates.some(candidate => {
      const correct = normalizeForCompare(candidate);
      if (correct.length >= 3) {
        return normalizedUserPart === correct || normalizedUserPart.includes(correct);
      }
      return normalizedUserPart === correct;
    });
  };

  // 空欄が1つだけ（言い換え候補のみ）の場合：
  // ユーザーの回答全体を、そのグループ内のどれかと比較する
  if (groups.length === 1) {
    return matchesAny(userAnswer, groups[0]);
  }

  // 空欄が複数（両解モード）の場合：
  // ユーザーの回答をスペース/カンマで分割し、各空欄ごとに
  // 対応するグループのどれかと一致するか（かつ、全空欄が一致）を見る
  const userParts = userAnswer
    .split(/[,\s]+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (userParts.length !== groups.length) {
    return false;
  }

  return groups.every((groupCandidates, i) => matchesAny(userParts[i], groupCandidates));
};

/**
 * 問題オブジェクトから回答テキストを取得する
 * @param question 問題オブジェクト
 * @returns 回答テキスト（○/✕、正解選択肢、記述回答など）
 */
export const getAnswerText = (question: Question): string => {
  switch (question.answerType) {
    case 'truefalse':
      return question.trueFalseAnswer ? '○' : '✕';
    case 'multiple':
      const correctIdx = question.multipleChoice?.correctAnswer ?? 0;
      const correctOption = question.multipleChoice?.options[correctIdx] || '';
      return `${correctIdx + 1}. ${correctOption}`;
    case 'descriptive': {
      const groups = getAnswerGroups(question);
      if (groups.length === 0) return '';

      if (groups.length === 1) {
        // 空欄が1つ（言い換え候補のみ）の場合：今までと同じ表示形式
        const answers = groups[0];
        if (answers.length === 0) return '';
        if (answers.length > 1) {
          return answers.map(a => `・${a}`).join('\n');
        }
        return answers[0];
      }

      // 空欄が複数（両解モード相当）の場合：
      // 正解1: 候補1 / 候補2 | 正解2: 候補3 / 候補4 の形式で表示
      return groups
        .map((g, i) => {
          const answers = g.filter(a => a && a.trim()).join(' / ');
          return `正解${i + 1}: ${answers}`;
        })
        .join(' | ');
    }
    default:
      return '';
  }
};

/**
 * 問題IDから回答を表示するアラートを表示
 * AsyncStorage から最新データを取得して表示する
 * @param questionId 問題ID
 * @param locale 現在のロケール（エラーメッセージ用）
 */
export const showAnswerAlert = async (questionId: number, locale: 'ja' | 'en'): Promise<void> => {
  try {
    const savedQuestions = await AsyncStorage.getItem(STORAGE_KEYS.QUIZ_QUESTIONS);

    if (!savedQuestions) {
      // 問題データが取得できない場合、ユーザーに通知
      const errorTitle = locale === 'ja' ? 'エラー' : 'Error';
      const errorMessage = locale === 'ja'
        ? '問題データが見つかりません。\n問題を再読み込みしてください。'
        : 'Question data not found.\nPlease reload the questions.';
      Alert.alert(errorTitle, errorMessage);
      return;
    }

    try {
      const allQuestions = JSON.parse(savedQuestions);
      const question = allQuestions.find((q: any) => q.id === questionId);

      if (question) {
        const answerText = getAnswerText(question);
        const alertTitle = locale === 'ja' ? '回答' : 'Answer';
        Alert.alert(alertTitle, answerText || (locale === 'ja' ? '回答データがありません' : 'No answer available'));
      } else {
        const errorMsg = locale === 'ja' ? '問題が見つかりません' : 'Question not found';
        Alert.alert(errorMsg, '');
      }
    } catch (parseError) {
      // JSONパースエラー
      console.error('回答表示エラー (JSON parse):', parseError);
      const errorTitle = locale === 'ja' ? 'エラー' : 'Error';
      const errorMessage = locale === 'ja'
        ? '問題データの読み込みに失敗しました。\n問題を再読み込みしてください。'
        : 'Failed to parse question data.\nPlease reload the questions.';
      Alert.alert(errorTitle, errorMessage);
    }
  } catch (error) {
    // AsyncStorageからの取得エラー
    console.error('回答表示エラー (AsyncStorage):', error);
    const errorTitle = locale === 'ja' ? 'エラー' : 'Error';
    const errorMessage = locale === 'ja'
      ? '回答の取得に失敗しました。\nストレージへのアクセスを確認してください。'
      : 'Failed to get answer.\nPlease check storage access.';
    Alert.alert(errorTitle, errorMessage);
  }
};

/**
 * 問題データから「グループ構造」の正解候補を取得する。
 * descriptiveAnswerGroups が既に存在すればそれをそのまま使い、
 * 存在しない場合は、旧形式（descriptiveAnswer / matchMode）から
 * その場で変換する。保存データ自体は書き換えない。
 */
export const getAnswerGroups = (question: Question): string[][] => {
  // 既に新形式で保存済みならそのまま使う
  if (question.descriptiveAnswerGroups && question.descriptiveAnswerGroups.length > 0) {
    return question.descriptiveAnswerGroups;
  }

  if (!question.descriptiveAnswer) {
    return [];
  }

  // 配列形式（新形式のフラット配列）
  if (Array.isArray(question.descriptiveAnswer)) {
    const cleaned = question.descriptiveAnswer.filter(a => a && a.trim().length > 0);
    if (cleaned.length === 0) return [];

    if (question.matchMode === 'all') {
      // all モード：各要素が別々の空欄（グループ）
      // 例: ["犬","猫"] → [["犬"], ["猫"]]
      return cleaned.map(a => [a]);
    }
    // any モード：全要素が1つの空欄の言い換え候補（1グループにまとめる）
    // 例: ["犬","わんこ"] → [["犬","わんこ"]]
    return [cleaned];
  }

  // 文字列形式（旧形式）："・犬\n・わんこ" のような形
  const lines = question.descriptiveAnswer
    .split('\n')
    .map(ans => ans.replace(/^[・]\s*/, '').trim())
    .filter(ans => ans.length > 0);

  if (lines.length === 0) return [];
  // 旧文字列形式は常に「言い換え候補の集合（1グループ）」として扱う
  return [lines];
};

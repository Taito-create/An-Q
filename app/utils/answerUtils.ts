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

/**
 * 記述問題の回答を判定する
 * @param userAnswer ユーザーの回答
 * @param question 問題オブジェクト
 * @returns 正解かどうか
 */
export const checkDescriptiveAnswer = (userAnswer: string, question: Question): boolean => {
  if (!question.descriptiveAnswer) {
    return false;
  }

  // 正規化されたユーザー回答を取得
  const normalizedUserAnswer = normalizeForCompare(userAnswer);

  // matchModeが'all'の場合はすべてのキーワードが含まれているかチェック
  if (question.matchMode === 'all') {
    // 正解が配列の場合（新形式）
    const correctAnswers = Array.isArray(question.descriptiveAnswer)
      ? question.descriptiveAnswer
      : question.descriptiveAnswer.split(/[,\s]+/).filter((kw: string) => kw.length > 0);

    // 正解キーワードを正規化
    const normalizedCorrectAnswers = correctAnswers.map(kw => normalizeForCompare(kw));

    // ユーザー回答をスペース/カンマで分割して正規化
    const userKeywords = normalizedUserAnswer.split(/[,\s]+/).filter(kw => kw.length > 0);

    // キーワード数が一致するかチェック
    if (userKeywords.length !== normalizedCorrectAnswers.length) {
      return false;
    }

    // 両方をソートして比較（順不同対応）
    const sortedUser = userKeywords.sort();
    const sortedCorrect = [...normalizedCorrectAnswers].sort();

    return sortedUser.every((kw, i) => kw === sortedCorrect[i]);
  }

  // デフォルト（matchMode: 'any' または未指定）
  // 安全な判定のため、正解が3文字以上の場合は部分一致を許可
  // 1〜2文字の場合は完全一致のみ（誤判定防止）
  let correctAnswerStr = typeof question.descriptiveAnswer === 'string'
    ? question.descriptiveAnswer
    : (question.descriptiveAnswer as string[])[0] || '';

  // 正解文字列から「・」や余分な空白を除去
  // 複数正解が「・ことば\n・論理\n・理性」のような形式の場合、各候補をクリーニング
  const correctAnswers = correctAnswerStr
    .split('\n')
    .map(ans => ans.replace(/^[・]\s*/, '').trim())
    .filter(ans => ans.length > 0);

  // 正規化された正解候補
  const normalizedCorrectAnswers = correctAnswers.map(ans => normalizeForCompare(ans));

  // 安全な判定ロジック
  return normalizedCorrectAnswers.some(correct => {
    const correctLength = correct.length;

    // 正解が3文字以上の場合：完全一致または部分一致
    if (correctLength >= 3) {
      return normalizedUserAnswer === correct || normalizedUserAnswer.includes(correct);
    }

    // 正解が1〜2文字の場合：完全一致のみ（誤判定防止）
    return normalizedUserAnswer === correct;
  });
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
    case 'descriptive':
      // 配列の場合はフォーマット分けして表示
      if (Array.isArray(question.descriptiveAnswer)) {
        const answers = question.descriptiveAnswer.filter(a => a.trim().length > 0);
        if (answers.length === 0) return '';

        if (question.matchMode === 'all') {
          // 両解モード：①回答1\n②回答2\n③回答3... の丸数字形式（改行で結合）
          const circledNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
          return answers.map((a, i) => `${circledNumbers[i] || i + 1}${a}`).join('\n');
        } else if (answers.length > 1) {
          // 複数正解（matchMode !== 'all'で複数回答）：
          // ・回答1\n・回答2\n・回答3... の箇条書き形式（改行で縦に並べる）
          return answers.map(a => `・${a}`).join('\n');
        }
        // 単一回答
        return answers[0];
      }
      return question.descriptiveAnswer || '';
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
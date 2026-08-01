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
  if (!question) return '問題データがありません';

  try {
    if (question.answerType === 'descriptive') {
      // Priority 1: descriptiveAnswerGroups (new format)
      if (question.descriptiveAnswerGroups && Array.isArray(question.descriptiveAnswerGroups)) {
        const groups = question.descriptiveAnswerGroups
          .filter(group => group && group.length > 0)
          .map(group => group.filter(a => a && a.trim()).join(' / '))
          .filter(text => text.length > 0);

        if (groups.length > 0) {
          return groups.join(' | ');
        }
      }

      // Priority 2: descriptiveAnswer (old format)
      if (question.descriptiveAnswer) {
        if (Array.isArray(question.descriptiveAnswer)) {
          const answers = question.descriptiveAnswer.filter(a => a && a.trim());
          if (answers.length > 0) {
            return answers.join(' / ');
          }
        } else if (typeof question.descriptiveAnswer === 'string') {
          return question.descriptiveAnswer;
        }
      }

      return '回答が設定されていません';
    }
    
    if (question.answerType === 'truefalse') {
      return question.trueFalseAnswer ? '○ (正しい)' : '× (間違い)';
    }
    
    if (question.answerType === 'multiple') {
      if (question.multipleChoice?.options) {
        const options = question.multipleChoice.options;
        const correct = question.multipleChoice.correctAnswer;
        if (options && Array.isArray(options) && correct !== undefined) {
          const answer = options[correct] || '選択肢がありません';
          return `正解: ${answer}`;
        }
      }
      return '正解が設定されていません';
    }
    
    return '回答形式が不明です';
  } catch (e) {
    console.error('getAnswerText error:', e, question);
    return '回答の表示中にエラーが発生しました';
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
  if (!question) return [['']];
  
  try {
    // Priority 1: descriptiveAnswerGroups (new format)
    if (question.descriptiveAnswerGroups && Array.isArray(question.descriptiveAnswerGroups)) {
      // Ensure all elements are arrays
      const groups = question.descriptiveAnswerGroups.map(group => 
        Array.isArray(group) ? group : [String(group)]
      );
      // Filter out empty groups
      const filtered = groups.filter(group => group.some(a => a && a.trim()));
      return filtered.length > 0 ? filtered : [['']];
    }
    
    // Priority 2: descriptiveAnswer (old format)
    if (question.descriptiveAnswer !== undefined && question.descriptiveAnswer !== null) {
      if (Array.isArray(question.descriptiveAnswer)) {
        const answers = question.descriptiveAnswer.filter(a => a && a.trim());
        return answers.length > 0 ? [answers] : [['']];
      }
      if (typeof question.descriptiveAnswer === 'string') {
        return [[question.descriptiveAnswer]];
      }
    }
    
    return [['']];
  } catch (e) {
    console.error('getAnswerGroups error:', e);
    return [['']];
  }
};

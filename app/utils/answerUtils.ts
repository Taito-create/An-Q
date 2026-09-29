import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question, MultipleChoice } from '../types/question';
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

/** ASCII（英数字・記号のみ）だけで構成されているか */
const isAsciiOnly = (s: string): boolean => /^[\x00-\x7F]+$/.test(s);

export const checkDescriptiveAnswer = (userAnswer: string, question: Question): boolean => {
  const groups = getAnswerGroups(question);
  if (groups.length === 0) {
    return false;
  }

  // 判定共通ロジック:
  // - 英語（ASCIIのみ）: 部分一致は誤判定を生むため完全一致のみ
  //   例) 正解 "apple" に対し "pineapple" は不正解
  // - 日本語を含む: 3文字以上なら部分一致も許可（社会/理科で必要）
  //   例) 正解 "りんご" に対し "りんごジュース" は正解
  // - 1〜2文字は完全一致のみ（既存仕様を維持）
  const matchesAny = (userPart: string, candidates: string[]): boolean => {
    const normalizedUserPart = normalizeForCompare(userPart);
    return candidates.some(candidate => {
      const correct = normalizeForCompare(candidate);
      // 空文字の正解候補は無効とする（未設定データで '' === '' が true になり
      // 「答えが未設定の問題」が正解と判定されてしまうため）
      if (correct === '') return false;
      // 英語（ASCIIのみ）同士は完全一致必須
      if (isAsciiOnly(correct) && isAsciiOnly(normalizedUserPart)) {
        return normalizedUserPart === correct;
      }
      // 日本語を含む場合は従来通り3文字以上で部分一致を許可
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
 * multipleChoice を新形式（correctAnswers 配列 + allowMultiple）へ正規化する。
 * 旧データ（correctAnswer が数値 / どちらもない）を読み取り専用で吸収する。
 */
export function normalizeMultipleChoice(mc: any): MultipleChoice | undefined {
  if (!mc || !Array.isArray(mc.options)) return undefined;

  const allowMultiple = mc.allowMultiple === true;

  // 新形式: correctAnswers が配列
  if (Array.isArray(mc.correctAnswers)) {
    const correctAnswers = mc.correctAnswers.filter(
      (i: any): i is number => typeof i === 'number' && Number.isFinite(i),
    );
    return {
      options: mc.options.map((o: any) => String(o ?? '')),
      correctAnswers: correctAnswers.length > 0 ? correctAnswers : [0],
      allowMultiple,
    };
  }

  // 旧形式: correctAnswer が数値
  if (typeof mc.correctAnswer === 'number' && Number.isFinite(mc.correctAnswer)) {
    return {
      options: mc.options.map((o: any) => String(o ?? '')),
      correctAnswers: [mc.correctAnswer],
      allowMultiple: false,
    };
  }

  return {
    options: mc.options.map((o: any) => String(o ?? '')),
    correctAnswers: [0],
    allowMultiple: false,
  };
}

/**
 * Firestoreから取得した問題データをアプリケーション用に正規化する
 * - descriptiveAnswerGroups が JSON 文字列の場合に配列にパースする
 * - multipleChoice を correctAnswers 配列形式へ正規化する
 */
export const normalizeQuestionFromFirestore = (q: any): Question => {
  if (!q) return q;

  const withMultipleChoice = (question: any): any => {
    if (!question.multipleChoice) return question;
    const normalized = normalizeMultipleChoice(question.multipleChoice);
    // 正規化できない（options が不正）場合は既存値をそのまま残す
    if (!normalized) return question;
    return { ...question, multipleChoice: normalized };
  };

  // descriptiveAnswerGroups が JSON 文字列の場合にパース
  if (q.descriptiveAnswerGroups && typeof q.descriptiveAnswerGroups === 'string') {
    try {
      const parsed = JSON.parse(q.descriptiveAnswerGroups);
      if (Array.isArray(parsed)) {
        return withMultipleChoice({ ...q, descriptiveAnswerGroups: parsed });
      }
    } catch (e) {
      console.error('normalizeQuestionFromFirestore parse failed:', e, q.id);
      return withMultipleChoice({ ...q, descriptiveAnswerGroups: undefined });
    }
  }
  return withMultipleChoice(q);
};

/**
 * descriptiveAnswerGroups が JSON 文字列の場合はパースする
 */
const parseAnswerGroups = (question: Question): string[][] | null => {
  const raw = question?.descriptiveAnswerGroups;
  if (!raw) return null;

  try {
    // 既に配列の場合
    if (Array.isArray(raw)) {
      return raw as string[][];
    }

    // JSON 文字列の場合
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        console.log(' descriptiveAnswerGroups parsed from JSON string');
        return parsed as string[][];
      }
    }
  } catch (e) {
    console.error(' Failed to parse descriptiveAnswerGroups:', e);
  }
  return null;
};

/**
 * 問題オブジェクトから回答テキストを取得する
 * @param question 問題オブジェクト
 * @returns 回答テキスト（○/、正解選択肢、記述回答など）
 */
export const getAnswerText = (question: Question): string => {
  console.log(' getAnswerText called for:', question?.question);
  console.log(' answerType:', question?.answerType);
  console.log(' descriptiveAnswerGroups:', question?.descriptiveAnswerGroups);
  console.log(' descriptiveAnswerGroups type:', typeof question?.descriptiveAnswerGroups);
  console.log(' descriptiveAnswer:', question?.descriptiveAnswer);
  console.log(' Full question object keys:', question ? Object.keys(question) : 'N/A');

  if (!question) return '問題データがありません';

  try {
    // Descriptive questions
    if (question.answerType === 'descriptive') {
      // Priority 1: descriptiveAnswerGroups (parse JSON string if needed)
      const parsedGroups = parseAnswerGroups(question);
      if (parsedGroups) {
        const groups = parsedGroups
          .filter(group => group && group.length > 0)
          .map(group => {
            const clean = group.filter(a => a && a.trim());
            return clean.length > 0 ? clean.join(' / ') : null;
          })
          .filter(text => text !== null);

        if (groups.length > 0) {
          const result = groups.join(' | ');
          console.log(' getAnswerText result (groups):', result);
          return result;
        }
      }

      // Priority 2: descriptiveAnswer (old format)
      if (question.descriptiveAnswer) {
        if (Array.isArray(question.descriptiveAnswer)) {
          const answers = question.descriptiveAnswer.filter(a => a && a.trim());
          if (answers.length > 0) {
            const result = answers.join(' / ');
            console.log(' getAnswerText result (array):', result);
            return result;
          }
        } else if (typeof question.descriptiveAnswer === 'string') {
          console.log(' getAnswerText result (string):', question.descriptiveAnswer);
          return question.descriptiveAnswer;
        }
      }

      console.warn(' No answer found for descriptive question');
      return '回答が設定されていません';
    }

    if (question.answerType === 'truefalse') {
      return question.trueFalseAnswer ? '○ (正しい)' : '× (間違い)';
    }

    if (question.answerType === 'multiple') {
      if (question.multipleChoice?.options) {
        const options = question.multipleChoice.options;
        // 新形式 (correctAnswers) を優先し、旧形式 (correctAnswer) にもフォールバック
        const correctIndices: number[] = Array.isArray(question.multipleChoice.correctAnswers)
          && question.multipleChoice.correctAnswers.length > 0
          ? question.multipleChoice.correctAnswers
          : (typeof question.multipleChoice.correctAnswer === 'number'
            ? [question.multipleChoice.correctAnswer]
            : []);
        if (Array.isArray(options) && correctIndices.length > 0) {
          // 複数正解は「正解: A, C」のように連結して表示
          const answer = correctIndices
            .map(i => options[i])
            .filter(Boolean)
            .join(', ') || '選択肢がありません';
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
    // Priority 1: descriptiveAnswerGroups (new format, parse JSON string if needed)
    const parsedGroups = parseAnswerGroups(question);
    if (parsedGroups) {
      // Ensure all elements are arrays
      const groups = parsedGroups.map(group => 
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

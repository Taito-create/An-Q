import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question } from '../types/question';
import { STORAGE_KEYS } from '../constants/storageKeys';

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

  const userAnswerLower = userAnswer.trim().toLowerCase();

  // matchModeが'all'の場合はすべてのキーワードが含まれているかチェック
  if (question.matchMode === 'all') {
    // 正解が配列の場合（新形式）
    const correctAnswers = Array.isArray(question.descriptiveAnswer)
      ? question.descriptiveAnswer
      : question.descriptiveAnswer.split(/[,\s]+/).filter((kw: string) => kw.length > 0);
    
    // ユーザー回答をスペース/カンマで分割
    const userKeywords = userAnswerLower.split(/[,\s]+/).filter(kw => kw.length > 0);
    
    // キーワード数が一致するかチェック
    if (userKeywords.length !== correctAnswers.length) {
      return false;
    }
    
    // 両方をソートして比較（順不同対応）
    const sortedUser = userKeywords.sort();
    const sortedCorrect = correctAnswers.map(kw => kw.trim().toLowerCase()).sort();
    
    return sortedUser.every((kw, i) => kw === sortedCorrect[i]);
  }

  // デフォルト（matchMode: 'any' または未指定）は完全一致または部分一致
  let correctAnswerStr = typeof question.descriptiveAnswer === 'string'
    ? question.descriptiveAnswer
    : (question.descriptiveAnswer as string[])[0] || '';
  
  // 正解文字列から「・」や余分な空白を除去
  // 複数正解が「・ことば\n・論理\n・理性」のような形式の場合、各候補をクリーニング
  const correctAnswers = correctAnswerStr
    .split('\n')
    .map(ans => ans.replace(/^[・]\s*/, '').trim())
    .filter(ans => ans.length > 0);
  
  // ユーザー回答をトリム
  const userAnswerTrimmed = userAnswerLower.trim();
  
  // クリーニング済みの正解候補と比較
  const correctAnswersLower = correctAnswers.map(ans => ans.toLowerCase());
  
  // 完全一致または部分一致をチェック
  return correctAnswersLower.some(
    correct => userAnswerTrimmed === correct || userAnswerTrimmed.includes(correct)
  );
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
    if (savedQuestions) {
      const allQuestions = JSON.parse(savedQuestions);
      const question = allQuestions.find((q: any) => q.id === questionId);
      if (question) {
        const answerText = getAnswerText(question);
        const alertTitle = locale === 'ja' ? '回答' : 'Answer';
        Alert.alert(alertTitle, answerText);
      } else {
        const errorMsg = locale === 'ja' ? '問題が見つかりません' : 'Question not found';
        Alert.alert(errorMsg, '');
      }
    }
  } catch (error) {
    console.error('回答表示エラー:', error);
    const errorMsg = locale === 'ja' ? '回答の取得に失敗しました' : 'Failed to get answer';
    Alert.alert('エラー', errorMsg);
  }
};
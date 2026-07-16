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
  const correctAnswerStr = typeof question.descriptiveAnswer === 'string'
    ? question.descriptiveAnswer
    : (question.descriptiveAnswer as string[])[0] || '';
  const correctAnswerLower = correctAnswerStr.trim().toLowerCase();
  
  return userAnswerLower === correctAnswerLower || userAnswerLower.includes(correctAnswerLower);
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
      // 配列の場合はカンマ区切りで表示（両解モードの場合は「両方正解」と明示）
      if (Array.isArray(question.descriptiveAnswer)) {
        const answers = question.descriptiveAnswer;
        if (question.matchMode === 'all' && answers.length > 1) {
          return `${answers.join('、')}（両方正解）`;
        }
        return answers.join('、');
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
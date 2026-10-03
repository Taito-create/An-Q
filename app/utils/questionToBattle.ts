import { Question } from '../types/question';
import { getAnswerGroups } from './answerUtils';

/**
 * Question から対戦で使う正解テキストを1つ抽出する。
 * - ○×（truefalse） → '○' or '×'
 * - 四択（multiple） → 正解選択肢を ' / ' で連結（複数正解対応）
 * - 記述（descriptive）→ 最初の正解グループの最初の候補
 *
 * 抽出できない場合は空文字を返す（呼び出し側で扱う）。
 */
export function convertToBattleAnswer(q: Question): string {
  if (!q) return '';

  if (q.answerType === 'truefalse') {
    return q.trueFalseAnswer ? '○' : '×';
  }

  if (q.answerType === 'multiple') {
    const mc = q.multipleChoice;
    if (!mc) return '';
    const correct =
      Array.isArray(mc.correctAnswers) && mc.correctAnswers.length > 0
        ? mc.correctAnswers
        : typeof mc.correctAnswer === 'number'
          ? [mc.correctAnswer]
          : [];
    if (correct.length === 0) return '';
    return correct
      .map((i) => mc.options[i])
      .filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
      .join(' / ');
  }

  if (q.answerType === 'descriptive') {
    const groups = getAnswerGroups(q);
    if (groups.length === 0) return '';
    const first = groups[0].filter((a) => a && a.trim());
    return first[0] ?? '';
  }

  return '';
}
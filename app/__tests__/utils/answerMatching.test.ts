/// <reference types="jest" />
/**
 * 回答判定の回帰テスト。
 *
 * 検証内容:
 *  1. 英語（ASCIIのみ）は完全一致のみ（pineapple は apple で不正解）
 *  2. 日本語は従来通り3文字以上で部分一致許可（りんごジュース は りんご で正解）
 *  3. 複数選択問題の正規化（旧 correctAnswer → 新 correctAnswers）
 *  4. 複数正解の表示
 */
import {
  checkDescriptiveAnswer,
  getAnswerText,
  normalizeMultipleChoice,
  normalizeQuestionFromFirestore,
} from '../../utils/answerUtils';
import { Question } from '../../types/question';

jest.mock('react-native', () => ({ Alert: { alert: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }));

const baseQuestion = (): Question => ({
  id: 1,
  question: 'テスト問題',
  answerType: 'descriptive',
  enabled: true,
  tags: [],
  mistakeCount: 0,
  createdAt: Date.now(),
});

describe('英語（ASCII）は完全一致のみ', () => {
  it('正解が部分一致でも不正解になること（pineapple は apple で不正解）', () => {
    const q: Question = { ...baseQuestion(), descriptiveAnswer: 'apple' };
    expect(checkDescriptiveAnswer('pineapple', q)).toBe(false);
    expect(checkDescriptiveAnswer('apple', q)).toBe(true);
    expect(checkDescriptiveAnswer('Apple', q)).toBe(true); // 大小文字は無視
  });

  it('複数候補の英語も完全一致のみ', () => {
    const q: Question = { ...baseQuestion(), descriptiveAnswerGroups: [['apple', 'banana']] };
    expect(checkDescriptiveAnswer('pineapple', q)).toBe(false);
    expect(checkDescriptiveAnswer('banana', q)).toBe(true);
  });
});

describe('日本語は部分一致を許可（既存仕様を維持）', () => {
  it('日本語の正解は部分一致で正解になること（りんごジュース は りんご で正解）', () => {
    const q: Question = { ...baseQuestion(), descriptiveAnswer: 'りんご' };
    expect(checkDescriptiveAnswer('りんごジュース', q)).toBe(true);
    expect(checkDescriptiveAnswer('りんご', q)).toBe(true);
  });

  it('社会（歴史）のような長文回答も部分一致で正解', () => {
    // 正解「織田信長」に対し「織田信長は武将として有名」→ 部分一致で正解
    const q: Question = { ...baseQuestion(), descriptiveAnswer: '織田信長' };
    expect(checkDescriptiveAnswer('織田信長は武将として有名', q)).toBe(true);
  });
});

describe('normalizeMultipleChoice（単一/複数正解の正規化）', () => {
  it('旧形式 correctAnswer を correctAnswers 配列に変換する', () => {
    const result = normalizeMultipleChoice({ options: ['A', 'B', 'C', 'D'], correctAnswer: 2 });
    expect(result?.correctAnswers).toEqual([2]);
    expect(result?.allowMultiple).toBe(false);
  });

  it('新形式 correctAnswers をそのまま保持する', () => {
    const result = normalizeMultipleChoice({
      options: ['A', 'B', 'C', 'D'],
      correctAnswers: [2, 3],
      allowMultiple: true,
    });
    expect(result?.correctAnswers).toEqual([2, 3]);
    expect(result?.allowMultiple).toBe(true);
  });

  it('どちらもない場合は [0] をデフォルトとする', () => {
    const result = normalizeMultipleChoice({ options: ['A', 'B', 'C', 'D'] });
    expect(result?.correctAnswers).toEqual([0]);
    expect(result?.allowMultiple).toBe(false);
  });

  it('options が不正な場合は undefined を返す', () => {
    expect(normalizeMultipleChoice(null)).toBeUndefined();
    expect(normalizeMultipleChoice({ correctAnswer: 1 })).toBeUndefined();
  });

  it('normalizeQuestionFromFirestore 内でも multipleChoice が正規化される', () => {
    const q = normalizeQuestionFromFirestore({
      id: 1,
      question: 'テスト',
      answerType: 'multiple',
      multipleChoice: { options: ['A', 'B', 'C', 'D'], correctAnswer: 1 },
    });
    expect(q.multipleChoice?.correctAnswers).toEqual([1]);
  });
});

describe('複数正解の表示（getAnswerText）', () => {
  it('単一正解は従来通り1つの選択肢を返す', () => {
    const q: Question = {
      ...baseQuestion(),
      answerType: 'multiple',
      multipleChoice: { options: ['A', 'B', 'C', 'D'], correctAnswers: [2] },
    };
    expect(getAnswerText(q)).toBe('正解: C');
  });

  it('複数正解は選択肢を連結して返す', () => {
    const q: Question = {
      ...baseQuestion(),
      answerType: 'multiple',
      multipleChoice: { options: ['A', 'B', 'C', 'D'], correctAnswers: [2, 3], allowMultiple: true },
    };
    expect(getAnswerText(q)).toBe('正解: C, D');
  });

  it('旧形式 correctAnswer でも正しく返す（後方互換）', () => {
    const q: Question = {
      ...baseQuestion(),
      answerType: 'multiple',
      multipleChoice: { options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
    };
    expect(getAnswerText(q)).toBe('正解: D');
  });
});

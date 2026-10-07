import { classifyError } from '../srs';
import type { SrsState } from '../../types/question';

const baseState = (overrides: Partial<SrsState> = {}): SrsState => ({
  memoryStrength: 50,
  nextReviewAt: Date.now(),
  lastReviewedAt: Date.now(),
  reviewCount: 3,
  correctStreak: 0,
  ...overrides,
});

describe('classifyError', () => {
  it('初回誤答 → unknown (1)', () => {
    expect(classifyError(undefined, { isCorrect: false, timeSpent: 20 })).toBe(1);
  });

  it('過去正解あり + 通常時間 → confused (2)', () => {
    const prev = baseState({ correctStreak: 3, lastReviewedAt: Date.now() - 10 * 86400000 });
    expect(classifyError(prev, { isCorrect: false, timeSpent: 20 })).toBe(2);
  });

  it('過去正解あり + 直近3日以内 + 10秒未満 → careless (3)', () => {
    const prev = baseState({ correctStreak: 3, lastReviewedAt: Date.now() - 86400000 });
    expect(classifyError(prev, { isCorrect: false, timeSpent: 5 })).toBe(3);
  });

  it('初回 + 3秒未満 → guess (4)', () => {
    expect(classifyError(undefined, { isCorrect: false, timeSpent: 2 })).toBe(4);
  });

  it('記述式 + 過去正解あり → confused (2)', () => {
    const prev = baseState({ correctStreak: 3, lastReviewedAt: Date.now() - 86400000 });
    expect(classifyError(prev, { isCorrect: false, timeSpent: 1, answerType: 'descriptive' })).toBe(2);
  });

  it('記述式 + 初回 → unknown (1)', () => {
    expect(classifyError(undefined, { isCorrect: false, timeSpent: 1, answerType: 'descriptive' })).toBe(1);
  });

  it('過去正解あり + 4日経過 + 5秒 → careless にならない (2)', () => {
    const prev = baseState({ correctStreak: 3, lastReviewedAt: Date.now() - 4 * 86400000 });
    expect(classifyError(prev, { isCorrect: false, timeSpent: 5 })).toBe(2);
  });
});
import type { SrsState } from '../types/question';

/** 1日 (ms) */
export const ONE_DAY_MS = 86_400_000;

/** SRS の初期値（復習履歴が無い問題の初期状態） */
export const DEFAULT_SRS_STATE: SrsState = {
  memoryStrength: 0,
  nextReviewAt: 0,
  lastReviewedAt: 0,
  reviewCount: 0,
  correctStreak: 0,
};

/**
 * 記憶強度から次回までの復習間隔 (ms) を返す。
 * 0-20: 1日 / 21-40: 3日 / 41-60: 7日 / 61-80: 14日 / 81-100: 30日
 */
export function intervalByStrength(strength: number): number {
  if (strength <= 20) return ONE_DAY_MS;
  if (strength <= 40) return ONE_DAY_MS * 3;
  if (strength <= 60) return ONE_DAY_MS * 7;
  if (strength <= 80) return ONE_DAY_MS * 14;
  return ONE_DAY_MS * 30;
}

/**
 * 回答結果から次の SRS 状態を計算する。
 *
 * - 正解時: 連続正解数に応じて記憶強度の上昇（+20 + ボーナス最大+10）
 * - 不正解時: 記憶強度を -30 下げ、連続正解をリセットして1日後に再出題
 * - previous が undefined の場合（復習履歴が無い問題）は初期値として扱う
 */
export function updateSrsState(
  previous: SrsState | undefined,
  isCorrect: boolean,
): SrsState {
  const now = Date.now();
  const reviewCount = (previous?.reviewCount ?? 0) + 1;

  if (!isCorrect) {
    const memoryStrength = Math.max(0, (previous?.memoryStrength ?? 0) - 30);
    return {
      memoryStrength,
      nextReviewAt: now + ONE_DAY_MS,
      lastReviewedAt: now,
      reviewCount,
      correctStreak: 0,
    };
  }

  const correctStreak = (previous?.correctStreak ?? 0) + 1;
  const bonus = Math.min(correctStreak * 2, 10);
  const memoryStrength = Math.min(100, (previous?.memoryStrength ?? 0) + 20 + bonus);

  return {
    memoryStrength,
    nextReviewAt: now + intervalByStrength(memoryStrength),
    lastReviewedAt: now,
    reviewCount,
    correctStreak,
  };
}

/**
 * 記憶強度を5段階のドット文字列に変換する。
 * undefined の場合は null を返す（未学習として非表示扱い）。
 *
 * memoryStrength === 0 でも1ドット塗りにするのは、
 * 「0 = 不正解で記憶強度が下がった状態」であり
 * 「未学習（srs undefined）」と区別するため。
 */
export function getSrsDotString(srs: SrsState | undefined): string | null {
  if (!srs) return null;
  const strength = srs.memoryStrength;
  let filled = 0;
  if (strength <= 20) filled = 1;
  else if (strength <= 40) filled = 2;
  else if (strength <= 60) filled = 3;
  else if (strength <= 80) filled = 4;
  else filled = 5;
  return '●'.repeat(filled) + '○'.repeat(5 - filled);
}

/** 塗られたドットの個数（0〜5）。未学習は 0 */
export function getSrsFilledDots(srs: SrsState | undefined): number {
  const dotStr = getSrsDotString(srs);
  if (!dotStr) return 0;
  return (dotStr.match(/●/g) || []).length;
}

/** 指定時刻までに復習期限が来ている問題か */
export function isDueForReview(srs: SrsState | undefined, now: number = Date.now()): boolean {
  // 復習履歴が無い問題は「期限切れ（＝出題候補）」として扱う
  if (!srs) return true;
  return srs.nextReviewAt <= now;
}
import type { SrsState } from '../types/question';

/** 誤答タイプ: 1 = unknown / 2 = confused / 3 = careless / 4 = guess */
export type ErrorType = 1 | 2 | 3 | 4;

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
 * 誤答タイプを判定する。
 * - 1 unknown: 初回誤答（過去に正解歴なし）
 * - 2 confused: 過去に正解歴あり（定着不足）
 * - 3 careless: 過去正解あり + 直近3日以内に復習 + 10秒未満
 * - 4 guess: 過去正解なし + 回答が極端に速い（勘）
 *
 * ※ 閾値（3秒 / 10秒 / 3日）は暫定。実データを貯めて Phase B/C で調整する。
 */
export function classifyError(
  previous: SrsState | undefined,
  result: { isCorrect: boolean; timeSpent: number; answerType?: string },
): ErrorType {
  const correctStreak = previous?.correctStreak ?? 0;

  // 記述式: タイピングに最低3秒以上かかるため、推測判定をスキップ。
  // 「過去正解あり → 混同 / 過去正解なし → 無知」の2択のみ。
  if (result.answerType === 'descriptive') {
    return correctStreak > 0 ? 2 : 1;
  }

  // 推測: 極端に速い（3秒未満）＋過去正解歴なし
  if (result.timeSpent < 3 && correctStreak === 0) return 4;

  // ケアレス: 過去正解あり + 直近3日以内に復習 + 10秒未満
  const lastReviewedAt = previous?.lastReviewedAt ?? 0;
  const daysSinceReview = (Date.now() - lastReviewedAt) / (1000 * 60 * 60 * 24);
  if (correctStreak > 0 && daysSinceReview < 3 && result.timeSpent < 10) return 3;

  // 混同: 過去正解あり
  if (correctStreak > 0) return 2;

  // 無知: 初回誤答
  return 1;
}

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

/** 記憶強度の3段階状態 */
export type SrsStatus = 'review' | 'learning' | 'stable';

/**
 * 記憶強度を3段階の状態に分類する。
 * undefined の場合は null（未学習として非表示扱い）。
 */
export function getSrsStatus(srs: SrsState | undefined): SrsStatus | null {
  if (!srs) return null;
  const s = srs.memoryStrength;
  if (s <= 20) return 'review';
  if (s <= 60) return 'learning';
  return 'stable';
}

/** 指定時刻までに復習期限が来ている問題か */
export function isDueForReview(srs: SrsState | undefined, now: number = Date.now()): boolean {
  // 復習履歴が無い問題は「期限切れ（＝出題候補）」として扱う
  if (!srs) return true;
  return srs.nextReviewAt <= now;
}
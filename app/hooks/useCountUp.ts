import { useEffect, useRef, useState } from 'react';

interface Options {
  /** アニメーション時間 (ms)。デフォルト 500 */
  duration?: number;
  /** false なら即時反映（演出OFF用）。デフォルト true */
  enabled?: boolean;
}

/**
 * 数値を目標値までカウントアップする。
 * - 初回マウント時: 0 → target
 * - target 変化時: 前回値 → target（クイズ後の増加など）
 * - enabled=false: 即時反映（アニメーションなし）
 * - アンマウント時に interval をクリア
 * - ease-out cubic で減速しながら到達
 */
export function useCountUp(target: number, { duration = 500, enabled = true }: Options = {}): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [display, setDisplay] = useState(enabled ? 0 : safeTarget);
  const prevRef = useRef(enabled ? 0 : safeTarget);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 前回の interval を必ず止める
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!enabled) {
      setDisplay(safeTarget);
      prevRef.current = safeTarget;
      return;
    }

    const from = prevRef.current;
    const to = safeTarget;
    if (from === to) {
      setDisplay(to);
      return;
    }

    const start = Date.now();
    const interval = 30; // 30ms ごとに更新（約33fps、処理負荷を抑える）

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic: 最初は速く、最後はゆっくり
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      if (t >= 1) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        prevRef.current = to;
      }
    }, interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [safeTarget, enabled, duration]);

  return display;
}
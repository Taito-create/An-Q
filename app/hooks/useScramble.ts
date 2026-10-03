import React, { useEffect, useRef, useState } from 'react';

const SCRAMBLE_CHARS = '!@#$%&*?<>/\\|=-_+[]{}';

function randomChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

interface Options {
  /** スクランブル期間の合計 ms。デフォルト 400 */
  duration?: number;
  /** 文字更新間隔の ms。デフォルト 50 */
  interval?: number;
  enabled?: boolean;
}

/**
 * finalText に確定するまでの間、ランダム文字を表示する。
 * - duration 経過後、確実に finalText に確定
 * - アンマウント時にタイマー／interval をクリア
 * - enabled=false なら finalText を即座に返す
 *
 * 注意: finalText と同じ長さのランダム文字列を返す（レイアウトシフトを防ぐため）
 */
export function useScramble(
  finalText: string,
  { duration = 400, interval = 50, enabled = true }: Options = {},
): string {
  const [display, setDisplay] = useState(finalText);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // 前回の interval を必ず止める（finalText が変わった場合・依存が変わった場合）
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!enabled || finalText.length === 0) {
      setDisplay(finalText);
      return;
    }

    const start = Date.now();

    // 初回の即時スクランブル
    setDisplay(Array.from({ length: finalText.length }, () => randomChar()).join(''));

    const tick = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= duration) {
        setDisplay(finalText);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      setDisplay(Array.from({ length: finalText.length }, () => randomChar()).join(''));
    };

    const id = setInterval(tick, interval);
    intervalRef.current = id;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [finalText, duration, interval, enabled]);

  return display;
}
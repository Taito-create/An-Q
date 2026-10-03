import { useEffect, useRef, useState } from 'react';

interface Options {
  /** 1文字あたりの ms。デフォルト 40 */
  speed?: number;
  /** 表示開始までの遅延 ms。デフォルト 0 */
  startDelay?: number;
  /** false なら即時全表示（アニメーション無効化や過去ログ用） */
  enabled?: boolean;
}

/**
 * テキストを1文字ずつ表示する。
 * - text が変わったら最初から再生
 * - アンマウント時にタイマークリア
 * - enabled=false なら text を即座に返す
 */
export function useTypewriter(
  text: string,
  { speed = 40, startDelay = 0, enabled = true }: Options = {},
): { displayed: string; done: boolean } {
  const [displayed, setDisplayed] = useState(enabled ? '' : text);
  const [done, setDone] = useState(!enabled);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // 依存が変わったときは前回のタイマーを全て破棄してから再生し直す
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    if (text.length === 0) {
      setDisplayed('');
      setDone(true);
      return;
    }

    setDisplayed('');
    setDone(false);

    let i = 0;
    const tick = () => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        setDone(true);
        return;
      }
      const id = setTimeout(tick, speed);
      timersRef.current.push(id);
    };

    const startId = setTimeout(tick, startDelay);
    timersRef.current.push(startId);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [text, speed, startDelay, enabled]);

  return { displayed, done };
}
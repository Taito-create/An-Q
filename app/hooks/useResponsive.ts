import { useState, useEffect } from 'react';

/**
 * 画面幅から端末区分を判定するレスポンシブフック。
 *
 * 既存の複数ファイル（index / browse / createHub / subHub / calendar / multiHub /
 * achievements）に同名フックが個別定義されていたが、ここに集約した。
 * スマホ幅（< 640px）でのヘッダー窮屈さを解消するレスポンシブ修正で使用する。
 *
 * 既存のローカル定義と同じ境界値（640 / 1024）に揃えている。
 */
export type ScreenType = 'mobile' | 'tablet' | 'desktop';

export const BREAKPOINTS = {
  tablet: 640,
  desktop: 1024,
} as const;

export function useResponsive(): ScreenType {
  const [screenType, setScreenType] = useState<ScreenType>('mobile');

  useEffect(() => {
    const checkScreen = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINTS.tablet) setScreenType('mobile');
      else if (width < BREAKPOINTS.desktop) setScreenType('tablet');
      else setScreenType('desktop');
    };

    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  return screenType;
}
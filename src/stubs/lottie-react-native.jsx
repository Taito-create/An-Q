import React from 'react';
import Lottie from 'lottie-react';

// RN の数値スタイルを CSS 値へ変換（数値は px 扱い、文字列はそのまま）
const toCss = (value) => (typeof value === 'number' ? `${value}px` : value);

// Web環境用のLottieビュー（lottie-reactを使用）
// ネイティブ版 LottieView と同じ imperative API（play / reset / pause / resume）を
// ref 経由で公開する。play(startFrame, endFrame) はマーカー相当のフレーム範囲を再生する。
const LottieView = React.forwardRef(
  ({ source, autoPlay, loop, style, speed = 1, playSpeed, resizeMode, ...props }, ref) => {
    if (!source) {
      return null;
    }

    // playSpeed / resizeMode を正しいプロパティ名にマッピング
    const finalSpeed = playSpeed ?? speed;
    const finalResizeMode = resizeMode ?? 'contain';

    // JSONデータから背景レイヤー（"nm": "BG"）を削除
    const cleanAnimationData = React.useMemo(() => {
      if (!source || !source.layers) {
        return source;
      }

      const cleaned = JSON.parse(JSON.stringify(source));

      // "nm": "BG" のレイヤーを探して削除
      if (cleaned.layers && Array.isArray(cleaned.layers)) {
        cleaned.layers = cleaned.layers.filter((layer) => {
          // レイヤー名が"BG"の場合は除外
          if (layer.nm === 'BG') {
            return false;
          }

          // 子レイヤー（グループ）内も再帰的にチェック
          if (layer.layers && Array.isArray(layer.layers)) {
            layer.layers = layer.layers.filter((subLayer) => subLayer.nm !== 'BG');
          }

          return true;
        });
      }

      return cleaned;
    }, [source]);

    // lottie-react（lottie-web）の内部インスタンスへの参照
    const lottieRef = React.useRef(null);

    // ネイティブ版 LottieView と互換の imperative API を公開
    React.useImperativeHandle(ref, () => ({
      play: (startFrame, endFrame) => {
        const lottie = lottieRef.current;
        if (!lottie) return;
        if (typeof startFrame === 'number' && typeof endFrame === 'number') {
          // 指定フレーム範囲（＝Lottie のマーカーセグメント）のみ再生
          lottie.playSegments([startFrame, endFrame], true);
        } else {
          lottie.play();
        }
      },
      reset: () => {
        const lottie = lottieRef.current;
        if (lottie) lottie.goToAndStop(0, true);
      },
      pause: () => {
        const lottie = lottieRef.current;
        if (lottie) lottie.pause();
      },
      resume: () => {
        const lottie = lottieRef.current;
        if (lottie) lottie.play();
      },
    }), []);

    // style オブジェクトを安全に処理（数値は px に変換し、未定義値は除外）
    const containerStyle = {
      position: style?.position || 'relative',
      top: style?.top !== undefined ? toCss(style.top) : undefined,
      right: style?.right !== undefined ? toCss(style.right) : undefined,
      bottom: style?.bottom !== undefined ? toCss(style.bottom) : undefined,
      left: style?.left !== undefined ? toCss(style.left) : undefined,
      width: style?.width || 300,
      height: style?.height || 300,
      zIndex: style?.zIndex,
      background: 'transparent',
    };

    // 未定義の値を削除（undefined な style 値を React へ渡すと warning になるため）
    Object.keys(containerStyle).forEach((key) => {
      if (containerStyle[key] === undefined) {
        delete containerStyle[key];
      }
    });

    return (
      <div style={containerStyle}>
        <Lottie
          lottieRef={lottieRef}
          animationData={cleanAnimationData}
          autoPlay={autoPlay}
          loop={loop}
          playspeed={finalSpeed}
          style={{
            width: '100%',
            height: '100%',
            background: 'transparent',
            objectFit: finalResizeMode,
          }}
          {...props}
        />
      </div>
    );
  }
);
LottieView.displayName = 'LottieView';

// エクスポートを default のみに統一（名前付きエクスポートとの組み合わせで
// キャッシュ化/相互運用時に ESM 解決が曖昧になるのを避ける）
export default LottieView;
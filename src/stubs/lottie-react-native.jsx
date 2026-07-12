import React from 'react';
import Lottie from 'lottie-react';

// Web環境用のLottieビュー（lottie-reactを使用）
const LottieView = ({ source, autoPlay, loop, style, speed = 1, ...props }) => {
  if (!source) {
    return null;
  }

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

  return (
    <div style={{ 
      position: 'relative', 
      width: style?.width || 300, 
      height: style?.height || 300,
      background: 'transparent'
    }}>
      <Lottie
        animationData={cleanAnimationData}
        autoPlay={autoPlay}
        loop={loop}
        playSpeed={speed}
        style={{ 
          width: '100%', 
          height: '100%',
          background: 'transparent'
        }}
        {...props}
      />
    </div>
  );
};

export default LottieView;
export { LottieView };
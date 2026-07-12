import React from 'react';
import Lottie from 'lottie-react';

// Web環境用のLottieビュー（lottie-reactを使用）
const LottieView = ({ source, autoPlay, loop, style, speed = 1, ...props }) => {
  if (!source) {
    return null;
  }

  return (
    <div style={{ position: 'relative', width: style?.width || 300, height: style?.height || 300 }}>
      <Lottie
        animationData={source}
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
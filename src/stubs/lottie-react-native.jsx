import React from 'react';
import Lottie from 'lottie-react';

// Web環境用のLottieビュー（lottie-reactを使用）
const LottieView = ({ source, autoPlay, loop, style, speed = 1, ...props }) => {
  if (!source) {
    return null;
  }

  return (
    <Lottie
      animationData={source}
      autoPlay={autoPlay}
      loop={loop}
      playSpeed={speed}
      style={style}
      {...props}
    />
  );
};

export default LottieView;
export { LottieView };
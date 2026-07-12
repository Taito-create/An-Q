import React from 'react';
import Lottie from 'lottie-react';

// Web環境用のLottieビュー（lottie-reactを使用）
const LottieView = ({ source, autoPlay, loop, style, ...props }) => {
  if (!source) {
    return null;
  }

  return (
    <Lottie
      animationData={source}
      autoPlay={autoPlay}
      loop={loop}
      style={style}
      {...props}
    />
  );
};

export default LottieView;
export { LottieView };
import React from 'react';

// Web環境用のLottieビュー モック
const LottieView = ({ source, autoPlay, loop, style, pointerEvents = 'auto', ...props }) => {
  // Web環境では何も表示しない（または必要に応じてプレースホルダーを表示）
  if (autoPlay && !loop) {
    // 1回だけ再生するアニメーションの場合、非表示
    return null;
  }
  
  // ループするアニメーションの場合はプレースホルダーを表示
  if (loop) {
    return (
      <div style={{ 
        ...style, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        borderRadius: '50%'
      }}>
        <span style={{ fontSize: '14px', color: '#999' }}>🎬</span>
      </div>
    );
  }
  
  return null;
};

export default LottieView;
export { LottieView };
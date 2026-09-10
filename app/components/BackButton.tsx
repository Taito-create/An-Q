import React from 'react';
import { Image } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { SoundManager } from '../sound';
import PressableButton from './PressableButton';
import { IMAGES } from '../constants/images';

interface BackButtonProps {
  /** 遷移先パス。省略時は navigate(-1) で前のページへ */
  to?: string;
  /** アイコンのサイズ（デフォルト 28） */
  size?: number;
  /** 追加のスタイル */
  style?: object;
  /** to の代わりに独自の onPress を使いたい場合 */
  onPress?: () => void;
}

export default function BackButton({ to, size = 28, style, onPress }: BackButtonProps) {
  const navigate = useNavigate();

  const handlePress = () => {
    SoundManager.play('decide');
    if (onPress) {
      onPress();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <PressableButton
      style={[
        {
          // 枠なし・テキストなし。矢印画像だけを表示
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 44,
          minWidth: 44,
          paddingVertical: 6,
          paddingHorizontal: 6,
        },
        style,
      ]}
      onPress={handlePress}
    >
      <Image
        source={IMAGES.backArrow}
        style={{ width: size, height: size, resizeMode: 'contain' }}
      />
    </PressableButton>
  );
}


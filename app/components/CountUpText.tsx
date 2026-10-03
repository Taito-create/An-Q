import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { useCountUp } from '../hooks/useCountUp';

interface Props {
  /** カウントアップの目標値 */
  value: number;
  /** 数値の後ろに付ける文字（例: '%'） */
  suffix?: string;
  /** 数値の前に付ける文字（例: 'Lv.'） */
  prefix?: string;
  /** true なら value の代わりに emptyText を表示（正答率の '--' など） */
  empty?: boolean;
  /** empty=true のときの表示。デフォルト '--' */
  emptyText?: string;
  /** false なら即時表示（演出OFF用）。デフォルト true */
  enabled?: boolean;
  duration?: number;
  style?: StyleProp<TextStyle>;
}

/**
 * 数値をカウントアップ表示する <Text>。
 * - enabled=false: 即時表示
 * - empty=true: emptyText を静的表示
 */
export default function CountUpText({
  value,
  suffix = '',
  prefix = '',
  empty = false,
  emptyText = '--',
  enabled = true,
  duration,
  style,
}: Props) {
  const display = useCountUp(value, { duration, enabled });

  if (empty) {
    return <Text style={style}>{emptyText}</Text>;
  }
  return <Text style={style}>{prefix}{display}{suffix}</Text>;
}
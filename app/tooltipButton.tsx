import React, { useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Platform } from 'react-native';
import { useTheme } from './theme';

interface Props {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  style?: object;
}

export default function TooltipButton({ onPress, label, children, style }: Props) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  if (Platform.OS === 'web') {
    // ウェブ：マウスホバーでツールチップ表示
    return (
      <View style={{ position: 'relative' }}>
        {visible && (
          <View style={[styles.tooltip, { backgroundColor: colors.text }]}>
            <Text style={[styles.tooltipText, { color: colors.card }]}>{label}</Text>
          </View>
        )}
        <TouchableOpacity
          style={style}
          onPress={onPress}
          {...({
            onMouseEnter: () => setVisible(true),
            onMouseLeave: () => setVisible(false),
          } as any)}
        >
          {children}
        </TouchableOpacity>
      </View>
    );
  }

  // スマホ：長押しでトースト表示
  return (
    <View style={{ position: 'relative' }}>
      {visible && (
        <View style={[styles.tooltip, { backgroundColor: colors.text }]}>
          <Text style={[styles.tooltipText, { color: colors.card }]}>{label}</Text>
        </View>
      )}
      <TouchableOpacity
        style={style}
        onPress={onPress}
        onLongPress={() => {
          setVisible(true);
          setTimeout(() => setVisible(false), 1500);
        }}
        delayLongPress={500}
      >
        {children}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    bottom: 38,
    left: -20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    zIndex: 9999,
    minWidth: 80,
    alignItems: 'center',
  },
  tooltipText: {
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  } as any,
});

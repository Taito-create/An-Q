import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Day = { dateString: string; day: number };

type CalendarProps = {
  onDayPress?: (day: Day) => void;
  dayComponent?: (props: { date: Day; state: string }) => React.ReactNode;
};

export const LocaleConfig = {
  locales: {} as Record<string, any>,
  defaultLocale: 'en',
};

export function Calendar({ onDayPress, dayComponent }: CalendarProps) {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const dateString = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const day: Day = { dateString, day: d };

  return (
    <View style={styles.wrap}>
      {dayComponent ? (
        <>{dayComponent({ date: day, state: '' })}</>
      ) : (
        <TouchableOpacity onPress={() => onDayPress?.(day)} style={styles.defaultDay}>
          <Text>{d}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 8 },
  defaultDay: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

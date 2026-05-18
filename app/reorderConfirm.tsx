import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ReorderConfirmScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary } = useTheme();
  const [searchParams] = useSearchParams();

  const locale = searchParams.get('locale') || 'ja';
  const ja = locale !== 'en';
  const before: string[] = JSON.parse(searchParams.get('before') || '[]');
  const after: string[] = JSON.parse(searchParams.get('after') || '[]');
  const mode = searchParams.get('mode') || 'compact';

  // ラベル定義
  const labels: Record<string, { ja: string; en: string; icon: string }> = {
    calendar:      { ja: 'カレンダー',       en: 'Calendar',    icon: 'calendar-outline' },
    mission:       { ja: 'ミッション',       en: 'Missions',    icon: 'clipboard-outline' },
    title:         { ja: '称号',             en: 'Titles',      icon: 'ribbon-outline' },
    shop:          { ja: 'ショップ',         en: 'Shop',        icon: 'storefront-outline' },
    manage:        { ja: 'タイマー設定',     en: 'Timer',       icon: 'timer-outline' },
    themeSettings: { ja: 'テーマカラー設定', en: 'Theme',       icon: 'color-palette-outline' },
    browse:        { ja: '学習履歴',         en: 'History',     icon: 'stats-chart' },
    music:         { ja: '音楽設定',         en: 'Music',       icon: 'musical-notes' },
  };

  const apply = async () => {
    if (mode === 'compact') {
      await AsyncStorage.setItem('home_button_order', JSON.stringify(after));
    } else {
      await AsyncStorage.setItem('home_card_order', JSON.stringify(after));
    }
    SoundManager.play('complete');
    navigate('/', { replace: true });
  };

  const cancel = () => {
    SoundManager.play('decide');
    navigate(-1);
  };

  const renderList = (order: string[], title: string) => (
    <View style={[styles.column, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.colTitle, { color: colors.textSecondary }]}>{title}</Text>
      {order.map((key, i) => {
        const def = labels[key];
        if (!def) return null;
        return (
          <View key={key} style={[styles.item, { borderBottomColor: colors.border }]}>
            <Text style={[styles.num, { color: colors.primary }]}>{i + 1}</Text>
            <Ionicons name={def.icon as any} size={18} color={colors.primary} style={styles.icon} />
            <Text style={[styles.label, { color: colors.text }]}>{ja ? def.ja : def.en}</Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {ja ? 'ボタン配置の確認' : 'Confirm Button Order'}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        {ja ? '変更を適用しますか？' : 'Apply this change?'}
      </Text>

      <ScrollView style={styles.scroll}>
        <View style={styles.columns}>
          {renderList(before, ja ? '変更前' : 'Before')}
          <View style={styles.arrow}>
            <Text style={[styles.arrowText, { color: colors.primary }]}>→</Text>
          </View>
          {renderList(after, ja ? '変更後' : 'After')}
        </View>
      </ScrollView>

      <View style={styles.buttons}>
        <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={cancel}>
          <Text style={[styles.cancelText, { color: colors.textSecondary }]}>
            {ja ? 'キャンセル' : 'Cancel'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.applyBtn, { backgroundColor: colors.primary }]} onPress={apply}>
          <Text style={[styles.applyText, { color: onPrimary }]}>
            {ja ? '適用する' : 'Apply'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  scroll: { flex: 1 },
  columns: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  column: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 12 },
  colTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  num: { fontSize: 13, fontWeight: 'bold', width: 20 },
  icon: { marginRight: 6 },
  label: { fontSize: 13, flex: 1 },
  arrow: { justifyContent: 'center', paddingTop: 60 },
  arrowText: { fontSize: 24, fontWeight: 'bold' },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  cancelText: { fontWeight: 'bold', fontSize: 15 },
  applyBtn: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center' },
  applyText: { fontWeight: 'bold', fontSize: 15 },
});

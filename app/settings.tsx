import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, Text, View, TouchableOpacity, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SoundManager } from './sound';
import { useTheme, ThemeName, FontSize, PatternType } from './theme';

const themeOptions: { key: ThemeName; labelJa: string; labelEn: string; emoji: string }[] = [
  { key: 'blue',   labelJa: 'ブルー',   labelEn: 'Blue',   emoji: '🔵' },
  { key: 'green',  labelJa: 'グリーン', labelEn: 'Green',  emoji: '🟢' },
  { key: 'orange', labelJa: 'オレンジ', labelEn: 'Orange', emoji: '🟠' },
  { key: 'pink',   labelJa: 'ピンク',   labelEn: 'Pink',   emoji: '🩷' },
  { key: 'sakura', labelJa: 'サクラ',   labelEn: 'Sakura', emoji: '🌸' },
  { key: 'purple', labelJa: 'パープル', labelEn: 'Purple', emoji: '🟣' },
  { key: 'red',    labelJa: 'レッド',   labelEn: 'Red',    emoji: '🔴' },
  { key: 'dark',   labelJa: 'ダーク',   labelEn: 'Dark',   emoji: '⚫' },
];

// HEXカラーコードのバリデーション
const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex);

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, currentTheme, setTheme, setCustomColor, customColor, fontSize, setFontSize, scale, pattern, setPattern } = useTheme();
  const [language, setLanguage] = useState<'ja' | 'en'>('ja');
  const [hexInput, setHexInput] = useState(customColor || '');
  const [hexError, setHexError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem('user_language').then(lang => {
      if (lang === 'ja' || lang === 'en') setLanguage(lang);
    });
  }, []);

  const ja = language === 'ja';

  const handleThemeSelect = (theme: ThemeName) => {
    setTheme(theme);
    setHexInput('');
    setHexError('');
    SoundManager.play('decide');
  };

  const handleCustomColor = () => {
    const hex = hexInput.startsWith('#') ? hexInput : '#' + hexInput;
    if (!isValidHex(hex)) {
      setHexError(ja ? '正しいHEXコードを入力してください（例: #FF5733）' : 'Enter a valid HEX code (e.g. #FF5733)');
      return;
    }
    setHexError('');
    setCustomColor(hex);
    SoundManager.play('decide');
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: Math.round(22 * scale) }]}>
          {ja ? 'テーマカラー設定' : 'Theme Settings'}
        </Text>
      </View>

      {/* Preset Themes */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? 'プリセット' : 'Presets'}
        </Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary, fontSize: Math.round(13 * scale) }]}>
          {ja ? '8種類のプリセットから選択' : 'Choose from 8 preset themes'}
        </Text>
        <View style={styles.themeGrid}>
          {themeOptions.map(opt => {
            const selected = currentTheme === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.themeCard, {
                  backgroundColor: selected ? colors.primary + '20' : colors.background,
                  borderColor: selected ? colors.primary : colors.border,
                  borderWidth: selected ? 2 : 1,
                }]}
                onPress={() => handleThemeSelect(opt.key)}
              >
                <Text style={styles.themeEmoji}>{opt.emoji}</Text>
                <Text style={[styles.themeLabel, { color: selected ? colors.primary : colors.text, fontSize: Math.round(11 * scale) }]}>
                  {ja ? opt.labelJa : opt.labelEn}
                </Text>
                {selected && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Custom Color */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? 'カスタムカラー' : 'Custom Color'}
        </Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary, fontSize: Math.round(13 * scale) }]}>
          {ja ? 'HEXカラーコードで自由に設定できます' : 'Set any color using a HEX code'}
        </Text>

        {/* Color Preview */}
        <View style={styles.customRow}>
          <View style={[styles.colorPreviewBox, {
            backgroundColor: isValidHex(hexInput.startsWith('#') ? hexInput : '#' + hexInput)
              ? (hexInput.startsWith('#') ? hexInput : '#' + hexInput)
              : colors.border
          }]} />
          <TextInput
            style={[styles.hexInput, {
              borderColor: hexError ? colors.error : colors.border,
              color: colors.text,
              backgroundColor: colors.background,
              fontSize: Math.round(15 * scale),
            }]}
            value={hexInput}
            onChangeText={text => { setHexInput(text); setHexError(''); }}
            placeholder="#FF5733"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            maxLength={7}
          />
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.primary }]}
            onPress={handleCustomColor}
          >
            <Text style={styles.applyButtonText}>{ja ? '適用' : 'Apply'}</Text>
          </TouchableOpacity>
        </View>

        {hexError ? <Text style={[styles.errorText, { color: colors.error }]}>{hexError}</Text> : null}

        {currentTheme === 'custom' && (
          <View style={[styles.customActiveBadge, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
            <Text style={[styles.customActiveBadgeText, { color: colors.primary }]}>
              {ja ? `カスタムカラー適用中: ${customColor}` : `Custom color active: ${customColor}`}
            </Text>
          </View>
        )}

        {/* Color suggestions */}
        <Text style={[styles.suggestLabel, { color: colors.textSecondary, fontSize: Math.round(12 * scale) }]}>
          {ja ? 'カラー例' : 'Examples'}
        </Text>
        <View style={styles.suggestRow}>
          {['#FF5733','#2ECC71','#3498DB','#9B59B6','#F39C12','#1ABC9C','#E74C3C','#34495E'].map(hex => (
            <TouchableOpacity
              key={hex}
              style={[styles.suggestDot, { backgroundColor: hex, borderColor: hexInput === hex ? colors.text : 'transparent' }]}
              onPress={() => { setHexInput(hex); setHexError(''); }}
            />
          ))}
        </View>
      </View>

      {/* Font Size */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? 'フォントサイズ' : 'Font Size'}
        </Text>
        <View style={styles.row}>
          {([
            { key: 'small',  labelJa: '小',  labelEn: 'S', preview: 12 },
            { key: 'medium', labelJa: '中',  labelEn: 'M', preview: 16 },
            { key: 'large',  labelJa: '大',  labelEn: 'L', preview: 20 },
          ] as { key: FontSize; labelJa: string; labelEn: string; preview: number }[]).map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.fontButton, {
                borderColor: fontSize === opt.key ? colors.primary : colors.border,
                borderWidth: fontSize === opt.key ? 2 : 1,
                backgroundColor: fontSize === opt.key ? colors.primary + '15' : colors.background,
              }]}
              onPress={() => { setFontSize(opt.key); SoundManager.play('decide'); }}
            >
              <Text style={{ fontSize: opt.preview, color: fontSize === opt.key ? colors.primary : colors.text, fontWeight: 'bold' }}>
                {ja ? opt.labelJa : opt.labelEn}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Pattern */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? '背景模様' : 'Background Pattern'}
        </Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary, fontSize: Math.round(13 * scale) }]}>
          {ja ? '画面の背景に模様を追加できます' : 'Add a decorative pattern to the background'}
        </Text>
        <View style={styles.themeGrid}>
          {([
            { key: 'none',     labelJa: 'なし',   labelEn: 'None',     icon: '○' },
            { key: 'dots',     labelJa: 'ドット',  labelEn: 'Dots',     icon: '·' },
            { key: 'stripes',  labelJa: 'ストライプ', labelEn: 'Stripes', icon: '/' },
            { key: 'grid',     labelJa: '格子',   labelEn: 'Grid',     icon: '+' },
            { key: 'waves',    labelJa: '波線',   labelEn: 'Waves',    icon: '~' },
            { key: 'diamonds', labelJa: 'ダイヤ',  labelEn: 'Diamonds', icon: '◇' },
          ] as { key: PatternType; labelJa: string; labelEn: string; icon: string }[]).map(opt => {
            const selected = pattern === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[styles.themeCard, {
                  backgroundColor: selected ? colors.primary + '20' : colors.background,
                  borderColor: selected ? colors.primary : colors.border,
                  borderWidth: selected ? 2 : 1,
                }]}
                onPress={() => { setPattern(opt.key); SoundManager.play('decide'); }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4, color: selected ? colors.primary : colors.textSecondary }}>
                  {opt.icon}
                </Text>
                <Text style={[styles.themeLabel, { color: selected ? colors.primary : colors.text, fontSize: Math.round(10 * scale) }]}>
                  {ja ? opt.labelJa : opt.labelEn}
                </Text>
                {selected && <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Preview */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? 'プレビュー' : 'Preview'}
        </Text>
        <View style={[styles.previewBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.previewButton, { backgroundColor: colors.primary }]}>
            <Text style={[styles.previewButtonText, { fontSize: Math.round(15 * scale) }]}>
              {ja ? 'サンプルボタン' : 'Sample Button'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.previewTitle, { color: colors.primary, fontSize: Math.round(17 * scale) }]}>
            {ja ? 'サンプルタイトル' : 'Sample Title'}
          </Text>
          <View style={styles.tagRow}>
            <View style={[styles.tag, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.tagText, { color: colors.primary, fontSize: Math.round(13 * scale) }]}>Tag 1</Text>
            </View>
            <View style={[styles.tag, { backgroundColor: colors.secondary + '30' }]}>
              <Text style={[styles.tagText, { color: colors.primary, fontSize: Math.round(13 * scale) }]}>Tag 2</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Back Button */}
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary }]}
        onPress={() => { SoundManager.play('decide'); router.canGoBack() ? router.back() : router.replace("/"); }}
      >
        <Text style={[styles.backButtonText, { fontSize: Math.round(16 * scale) }]}>
          {ja ? '戻る' : 'Back'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, borderBottomWidth: 1 },
  headerTitle: { fontWeight: 'bold' },
  section: { padding: 20, marginBottom: 12 },
  sectionTitle: { fontWeight: 'bold', marginBottom: 6 },
  sectionDesc: { marginBottom: 16 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeCard: { width: '22%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 6 },
  themeEmoji: { fontSize: 22, marginBottom: 4 },
  themeLabel: { fontWeight: '600', textAlign: 'center' },
  checkmark: { fontSize: 12, fontWeight: 'bold', position: 'absolute', top: 4, right: 6 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  colorPreviewBox: { width: 40, height: 40, borderRadius: 8 },
  hexInput: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, fontFamily: 'monospace' },
  applyButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  applyButtonText: { color: 'white', fontWeight: 'bold' },
  errorText: { fontSize: 12, marginBottom: 8 },
  customActiveBadge: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  customActiveBadgeText: { fontSize: 13, fontWeight: '600' },
  suggestLabel: { marginBottom: 8 },
  suggestRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  suggestDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  row: { flexDirection: 'row', gap: 12 },
  fontButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  previewBox: { padding: 16, borderRadius: 12, borderWidth: 1, gap: 10 },
  previewButton: { padding: 12, borderRadius: 20, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 20 },
  previewButtonText: { color: 'white', fontWeight: 'bold' },
  previewTitle: { fontWeight: 'bold' },
  tagRow: { flexDirection: 'row', gap: 8 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontWeight: '500' },
  backButton: { margin: 20, padding: 16, borderRadius: 12, alignItems: 'center' },
  backButtonText: { color: 'white', fontWeight: 'bold' },
});

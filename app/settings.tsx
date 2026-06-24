import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, Text, View, TouchableOpacity, TextInput, Switch } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigate } from 'react-router-dom';
import { SoundManager } from './sound';
import { useTheme, ThemeName, FontSize } from './theme';
import { useLocale } from './hooks/useLocale';
import { AnimationLevel, animationConfigs } from './animations';

const themeOptions: { key: ThemeName; labelJa: string; labelEn: string; emoji: string }[] = [
  { key: 'blue',   labelJa: 'ブルー',   labelEn: 'Blue',   emoji: '🔵' },
  { key: 'green',  labelJa: 'グリーン', labelEn: 'Green',  emoji: '🟢' },
  { key: 'orange', labelJa: 'オレンジ', labelEn: 'Orange', emoji: '🟠' },
  { key: 'pink',   labelJa: 'ピンク',   labelEn: 'Pink',   emoji: '🩷' },
  { key: 'sakura', labelJa: 'サクラ',   labelEn: 'Sakura', emoji: '🌸' },
  { key: 'purple', labelJa: 'パープル', labelEn: 'Purple', emoji: '🟣' },
  { key: 'red',     labelJa: 'レッド',     labelEn: 'Red',     emoji: '🔴' },
  { key: 'dark',    labelJa: 'ダーク',     labelEn: 'Dark',    emoji: '⚫' },
  { key: 'cyberpunk', labelJa: 'サイバーパンク', labelEn: 'Cyberpunk', emoji: '🤖' },
];

const isValidHex = (hex: string) => /^#[0-9A-Fa-f]{6}$/.test(hex);

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { colors, currentTheme, setTheme, setCustomColor, customColor, fontSize, setFontSize, scale, pattern, setPattern, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const ja = locale === 'ja';
  const [hexInput, setHexInput] = useState(customColor || '');
  const [hexError, setHexError] = useState('');
  const [animationLevel, setAnimationLevel] = useState<AnimationLevel>('standard');

  useEffect(() => {
    loadAnimationSetting();
  }, []);

  const loadAnimationSetting = async () => {
    try {
      const saved = await AsyncStorage.getItem('animation_level');
      if (saved === 'none' || saved === 'lite' || saved === 'standard' || saved === 'rich') {
        setAnimationLevel(saved);
      }
    } catch (e) {
      console.error('Failed to load animation setting:', e);
    }
  };

  const handleAnimationLevelChange = async (level: AnimationLevel) => {
    setAnimationLevel(level);
    await AsyncStorage.setItem('animation_level', level);
    SoundManager.play('decide');
  };

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
      {/* Header with close button */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: Math.round(22 * scale) }]}>
          {ja ? 'テーマカラー設定' : 'Theme Settings'}
        </Text>
        <TouchableOpacity
          style={{
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: colors.primary,
            borderRadius: isCyberpunk ? 0 : 10,
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 70,
          }}
          onPress={() => { SoundManager.play('decide'); navigate('/'); }}
        >
          <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
            {locale === 'ja' ? '戻る' : 'Back'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Preset Themes */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? 'プリセット' : 'Presets'}
        </Text>
        <Text style={[styles.sectionDesc, { color: colors.textSecondary, fontSize: Math.round(13 * scale) }]}>
          {ja ? '9種類のプリセットから選択' : 'Choose from 9 preset themes'}
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
            <Text style={[styles.applyButtonText, { color: onPrimary }]}>{ja ? '適用' : 'Apply'}</Text>
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

      {/* Effects */}
      <View style={[styles.section, { backgroundColor: colors.card }]}>
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
          {ja ? 'エフェクト' : 'Effects'}
        </Text>
        <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
          <Text style={[styles.settingLabel, { color: colors.text, fontSize: Math.round(16 * scale) }]}>
            {ja ? 'アニメーション' : 'Animations'}
          </Text>
          <Switch
            value={animationLevel !== 'none'}
            onValueChange={(val) => handleAnimationLevelChange(val ? 'standard' : 'none')}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#FFF"
          />
        </View>

        {animationLevel !== 'none' && (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: colors.text, fontSize: 12 }]}>
              {ja ? 'アニメーションレベル' : 'Animation Level'}
            </Text>
            {(['lite', 'standard', 'rich'] as AnimationLevel[]).map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.animationOptionBtn,
                  { borderColor: colors.border, backgroundColor: colors.background },
                  animationLevel === level && { backgroundColor: colors.primary + '20', borderColor: colors.primary, borderWidth: 2 }
                ]}
                onPress={() => handleAnimationLevelChange(level)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionLabel, { color: colors.text, fontWeight: animationLevel === level ? '700' : '500' }]}>
                    {animationConfigs[level].label}
                  </Text>
                  <Text style={[styles.optionDesc, { color: colors.textSecondary, fontSize: 12 }]}>
                    {animationConfigs[level].description}
                  </Text>
                  <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {animationConfigs[level].features.map((f, i) => (
                      <View
                        key={i}
                        style={[styles.featureBadge, { backgroundColor: colors.primary + '20' }]}
                      >
                        <Text style={[styles.featureBadgeText, { color: colors.primary, fontSize: 10 }]}>
                          {f}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                {animationLevel === level && (
                  <Text style={[{ color: colors.primary, fontSize: 16, fontWeight: 'bold' }]}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
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
  applyButtonText: { fontWeight: 'bold' },
  errorText: { fontSize: 12, marginBottom: 8 },
  customActiveBadge: { padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  customActiveBadgeText: { fontSize: 13, fontWeight: '600' },
  suggestLabel: { marginBottom: 8 },
  suggestRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  suggestDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  row: { flexDirection: 'row', gap: 12 },
  fontButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 56 },
  sectionLabel: { fontWeight: '600', marginBottom: 8 },
  animationOptionBtn: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionLabel: { fontSize: 14, fontWeight: '600' },
  optionDesc: { marginTop: 2 },
  featureBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  featureBadgeText: { fontWeight: '500' },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
});
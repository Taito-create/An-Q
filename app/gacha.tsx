import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { useLocale } from './hooks/useLocale';
import { translations } from './translations';
import { loadStats, saveStats } from './missions';

const FORTUNES = {
  ja: [
    { id: 'daikichi', label: '大吉', message: '今日は絶好調！勉強もはかどるでしょう！', reward: 50 },
    { id: 'chukichi', label: '中吉', message: '順調な1日に。コツコツ頑張ろう！', reward: 30 },
    { id: 'shokichi', label: '小吉', message: 'ラッキーなことがあるかも？', reward: 20 },
    { id: 'kichi', label: '吉', message: '普通が一番。無理せずいきましょう。', reward: 10 },
    { id: 'suekichi', label: '末吉', message: '運は徐々に上昇中！', reward: 5 },
    { id: 'kyo', label: '凶', message: '今日は休むのも大事な選択です。', reward: 0 },
  ],
  en: [
    { id: 'daikichi', label: 'Best', message: 'Perfect day for studying!', reward: 50 },
    { id: 'chukichi', label: 'Good', message: 'Steady progress today!', reward: 30 },
    { id: 'shokichi', label: 'Fair', message: 'Something lucky might happen?', reward: 20 },
    { id: 'kichi', label: 'Normal', message: 'Take it easy today.', reward: 10 },
    { id: 'suekichi', label: 'So-so', message: 'Luck is rising slowly!', reward: 5 },
    { id: 'kyo', label: 'Bad', message: 'Rest is also important.', reward: 0 },
  ],
};

export default function GachaScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, isCyberpunk } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const [result, setResult] = useState<{ id: string; label: string; message: string; reward: number } | null>(null);
  const [coins, setCoins] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    loadCoins();
  }, []);

  const loadCoins = async () => {
    const coinStr = await AsyncStorage.getItem('user_coins');
    setCoins(parseInt(coinStr || '0', 10));
  };

  const drawOmikuji = async () => {
    if (isDrawing) return;
    
    const cost = 30;
    if (coins < cost) {
      Alert.alert(
        locale === 'ja' ? 'コイン不足' : 'Insufficient Coins',
        locale === 'ja' ? `おみくじには${cost}コイン必要です` : `Omikuji costs ${cost} coins`
      );
      return;
    }

    setIsDrawing(true);
    
    // コイン消費
    await AsyncStorage.setItem('user_coins', (coins - cost).toString());
    setCoins(coins - cost);
    
    // 統計更新
    const stats = await loadStats();
    stats.totalCoinsSpent = (stats.totalCoinsSpent || 0) + cost;
    await saveStats(stats);
    
    // 抽選 - id ベースで管理
    const fortunes = locale === 'ja' ? FORTUNES.ja : FORTUNES.en;
    const random = Math.random();
    let selectedId: string;
    
    if (random < 0.05) selectedId = 'daikichi';      // 大吉 5%
    else if (random < 0.15) selectedId = 'chukichi'; // 中吉 10%
    else if (random < 0.30) selectedId = 'shokichi'; // 小吉 15%
    else if (random < 0.50) selectedId = 'kichi';    // 吉 20%
    else if (random < 0.70) selectedId = 'suekichi'; // 末吉 20%
    else selectedId = 'kyo';                          // 凶 30%
    
    // 該当する運勢を取得
    const selected = fortunes.find(f => f.id === selectedId)!;
    
    setResult({
      id: selected.id,
      label: selected.label,
      message: selected.message,
      reward: selected.reward,
    });
    SoundManager.play('complete');
    
    // 当選コインを付与
    if (selected.reward > 0) {
      const newCoins = coins - cost + selected.reward;
      await AsyncStorage.setItem('user_coins', newCoins.toString());
      setCoins(newCoins);
    }
    
    setIsDrawing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          🎋 {locale === 'ja' ? 'おみくじ' : 'Omikuji'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={[styles.coinText, { color: colors.primary }]}>
            💰 {coins} {locale === 'ja' ? 'コイン' : 'Coins'}
          </Text>
          <TouchableOpacity
            style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: colors.primary, borderRadius: isCyberpunk ? 0 : 10, alignItems: 'center', justifyContent: 'center', minWidth: 70 }}
            onPress={() => { SoundManager.play('decide'); navigate('/'); }}
          >
            <Text style={{ color: onPrimary, fontWeight: '700', fontSize: 14 }}>
              {locale === 'ja' ? '戻る' : 'Back'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {!result ? (
          <>
            <Text style={[styles.costText, { color: colors.text }]}>
              🎴 {locale === 'ja' ? '1回 30コイン' : '30 coins per draw'}
            </Text>
            <TouchableOpacity
              style={[styles.drawButton, { backgroundColor: colors.primary }]}
              onPress={drawOmikuji}
              disabled={isDrawing}
            >
              <Text style={styles.drawButtonText}>
                {locale === 'ja' ? 'おみくじを引く' : 'Draw Omikuji'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.resultLevel, { color: colors.primary }]}>
              {result.label}
            </Text>
            <Text style={[styles.resultMessage, { color: colors.text }]}>
              {result.message}
            </Text>
            {result.reward > 0 && (
              <Text style={[styles.resultReward, { color: colors.success }]}>
                ✨ +{result.reward} {locale === 'ja' ? 'コイン' : 'Coins'}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.backButton, { backgroundColor: colors.primary }]}
              onPress={() => setResult(null)}
            >
              <Text style={styles.backButtonText}>
                {locale === 'ja' ? 'もう一度引く' : 'Draw Again'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  coinText: { fontSize: 16, fontWeight: 'bold' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  costText: { fontSize: 18, marginBottom: 20 },
  drawButton: { paddingHorizontal: 40, paddingVertical: 15, borderRadius: 12 },
  drawButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  resultCard: { width: '80%', padding: 30, borderRadius: 16, alignItems: 'center' },
  resultLevel: { fontSize: 32, fontWeight: 'bold', marginBottom: 16 },
  resultMessage: { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  resultReward: { fontSize: 18, fontWeight: 'bold', marginBottom: 24 },
  backButton: { paddingHorizontal: 30, paddingVertical: 12, borderRadius: 10 },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Modal, ScrollView, Image } from 'react-native';
import PressableButton from './components/PressableButton';
import { useNavigate } from 'react-router-dom';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import { useLocale } from './hooks/useLocale';
import { loadStats, saveStats } from './missions';
import { X } from 'lucide-react';
import { IMAGES } from './constants/images';
import { GACHA_ITEMS, GachaItem, RARITY_COLORS, RARITY_LABELS, RARITY_RATES } from './gachaItems';

const COST_SINGLE = 100;
const COST_TEN = 1000;

// レアリティを重み付け抽選で決定
const drawRarity = (): GachaItem['rarity'] => {
  const rand = Math.random() * 100;
  let cumulative = 0;
  const order: GachaItem['rarity'][] = ['UR', 'SR', 'R', 'N'];
  for (const r of order) {
    cumulative += RARITY_RATES[r];
    if (rand < cumulative) return r;
  }
  return 'N';
};

// 1回の抽選
const drawItem = (): GachaItem => {
  const rarity = drawRarity();
  const candidates = GACHA_ITEMS.filter(item => item.rarity === rarity);
  const pool = candidates.length > 0 ? candidates : GACHA_ITEMS;
  return pool[Math.floor(Math.random() * pool.length)];
};

// 10連（最後の1枠はSR以上確定）
const drawTen = (): GachaItem[] => {
  const results: GachaItem[] = [];
  for (let i = 0; i < 9; i++) {
    results.push(drawItem());
  }
  const srCandidates = GACHA_ITEMS.filter(item => item.rarity === 'SR' || item.rarity === 'UR');
  const pool = srCandidates.length > 0 ? srCandidates : GACHA_ITEMS;
  results.push(pool[Math.floor(Math.random() * pool.length)]);
  return results;
};

export default function GachaScreen() {
  const navigate = useNavigate();
  const { colors, br } = useTheme();
  const locale = useLocale();
  const [coins, setCoins] = useState(0);
  const [books, setBooks] = useState(0);
  const [results, setResults] = useState<GachaItem[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
useEffect(() => {
    loadBalances();
  }, []);

  const loadBalances = async () => {
    const coinStr = await AsyncStorage.getItem('user_coins');
    const stats = await loadStats();
    setCoins(parseInt(coinStr || '0', 10));
    setBooks(stats.totalBooks || 0);
  };

  // 排出アイテムの報酬を反映（コイン/本）
  const applyRewards = async (items: GachaItem[]) => {
    let coinReward = 0;
    let bookReward = 0;
    for (const item of items) {
      if (item.type === 'coin') coinReward += item.value || 0;
      if (item.type === 'book') bookReward += item.value || 0;
    }
    if (coinReward > 0) {
      const newCoins = coins + coinReward;
      await AsyncStorage.setItem('user_coins', newCoins.toString());
      setCoins(newCoins);
    }
    if (bookReward > 0) {
      const stats = await loadStats();
      stats.totalBooks = (stats.totalBooks || 0) + bookReward;
      await saveStats(stats);
      setBooks(stats.totalBooks);
    }
    if (coinReward > 0 || bookReward > 0) {
      SoundManager.play('complete');
    }
  };

  const drawGacha = async (count: 1 | 10) => {
    if (isDrawing) return;
    const cost = count === 1 ? COST_SINGLE : COST_TEN;
    if (coins < cost) {
      Alert.alert(
        locale === 'ja' ? 'コイン不足' : 'Insufficient Coins',
        locale === 'ja' ? `ガチャには${cost}コイン必要です` : `Gacha costs ${cost} coins`
      );
      return;
    }

    setIsDrawing(true);
    try {
      // コイン消費
      const newCoins = coins - cost;
      await AsyncStorage.setItem('user_coins', newCoins.toString());
      setCoins(newCoins);

      // 統計更新
      const stats = await loadStats();
      stats.totalCoinsSpent = (stats.totalCoinsSpent || 0) + cost;
      await saveStats(stats);

      // 抽選
      const items = count === 1 ? [drawItem()] : drawTen();
      setResults(items);
      setShowResult(true);
      SoundManager.play('decide');
      await applyRewards(items);
    } catch (error) {
      console.error('Gacha draw failed:', error);
    } finally {
      setIsDrawing(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ヘッダー */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, justifyContent: 'flex-start', alignItems: 'center', gap: 10 }]}>
        <PressableButton
          style={{ minHeight: 44, minWidth: 44, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: br, borderWidth: 1, borderColor: colors.primary, backgroundColor: 'transparent' }}
          onPress={() => { SoundManager.play('decide'); navigate('/sub'); }}
        >
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>← {locale === 'ja' ? '戻る' : 'Back'}</Text>
        </PressableButton>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexShrink: 1 }}>
          <Image source={IMAGES.coin} style={{ width: 22, height: 22, resizeMode: 'contain' }} />
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {locale === 'ja' ? 'ガチャ' : 'Gacha'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.headerBalance, { color: colors.primary }]}>
              <Image source={IMAGES.coin} style={{ width: 18, height: 18, resizeMode: 'contain' }} /> {coins}
            </Text>
            <Text style={[styles.headerBalance, { color: colors.success }]}>
              <Image source={IMAGES.book} style={{ width: 18, height: 18, resizeMode: 'contain' }} /> {books}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {/* メインバナー */}
        <View style={[styles.banner, { backgroundColor: colors.primary + '20', borderColor: colors.primary }]}>
          <Text style={[styles.bannerTitle, { color: colors.primary }]}>
            {locale === 'ja' ? 'レアアイテムガチャ' : 'Rare Item Gacha'}
          </Text>
          <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
            {locale === 'ja' ? '伝説の王冠を狙え！' : 'Aim for the Legendary Crown!'}
          </Text>
          <TouchableOpacity onPress={() => setShowRateModal(true)} style={{ marginTop: 6 }}>
            <Text style={[styles.rateButton, { color: colors.textSecondary }]}>
              {locale === 'ja' ? '提供割合を確認 →' : 'View Rates →'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* レアリティ色の凡例 */}
        <View style={styles.legendRow}>
          {(Object.keys(RARITY_LABELS[locale]) as GachaItem['rarity'][]).map((r) => (
            <View key={r} style={[styles.legendItem, { backgroundColor: RARITY_COLORS[r].bg + '22', borderColor: RARITY_COLORS[r].border }]}>
              <Text style={[styles.legendText, { color: RARITY_COLORS[r].border }]}>{RARITY_LABELS[locale][r]}</Text>
            </View>
          ))}
        </View>

        {/* ガチャボタン */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.drawButton, { backgroundColor: colors.primary, opacity: coins < COST_SINGLE ? 0.5 : 1 }]}
            onPress={() => drawGacha(1)}
            disabled={coins < COST_SINGLE || isDrawing}
          >
            <Text style={styles.drawButtonText}>
              {locale === 'ja' ? `1回引く (${COST_SINGLE}コイン)` : `Draw 1 (${COST_SINGLE} coins)`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.drawButton, { backgroundColor: colors.primary, opacity: coins < COST_TEN ? 0.5 : 1 }]}
            onPress={() => drawGacha(10)}
            disabled={coins < COST_TEN || isDrawing}
          >
            <Text style={styles.drawButtonText}>
              {locale === 'ja' ? `10連引く (${COST_TEN}コイン)` : `Draw 10 (${COST_TEN} coins)`}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.noteText, { color: colors.textSecondary }]}>
          {locale === 'ja' ? '10連では最後の1枠がSR以上確定！' : '10-draw guarantees SR or higher on the last slot!'}
        </Text>

        {isDrawing && (
          <Text style={[styles.noteText, { color: colors.textSecondary, marginTop: 12 }]}>
            {locale === 'ja' ? '抽選中...' : 'Drawing...'}
          </Text>
        )}
      </ScrollView>
{/* 結果モーダル */}
      <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setShowResult(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.resultModal, { backgroundColor: colors.card }]}>
            <View style={styles.resultHeaderRow}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {locale === 'ja' ? 'ガチャ結果' : 'Gacha Result'}
              </Text>
              <TouchableOpacity onPress={() => setShowResult(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }} bounces={false}>
              {results.map((item, index) => {
                const rc = RARITY_COLORS[item.rarity];
                return (
                  <View
                    key={index}
                    style={[
                      styles.resultItem,
                      {
                        borderColor: rc.border,
                        backgroundColor: rc.bg + '20',
                      },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.resultItemName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.resultItemRarity, { color: rc.border }]}>
                        {RARITY_LABELS[locale][item.rarity]}
                      </Text>
                    </View>
                    <Text style={[styles.resultItemMeta, { color: colors.textSecondary }]}>{item.description}</Text>
                    {item.type === 'coin' && item.value ? (
                      <Text style={[styles.resultItemReward, { color: colors.primary }]}>+{item.value} {locale === 'ja' ? 'コイン' : 'coins'}</Text>
                    ) : item.type === 'book' && item.value ? (
                      <Text style={[styles.resultItemReward, { color: colors.success }]}>+{item.value} {locale === 'ja' ? '冊' : 'books'}</Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowResult(false)}
            >
              <Text style={styles.closeButtonText}>
                {locale === 'ja' ? '閉じる' : 'Close'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 確率モーダル */}
      <Modal visible={showRateModal} transparent animationType="fade" onRequestClose={() => setShowRateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.resultModal, { backgroundColor: colors.card }]}>
            <View style={styles.resultHeaderRow}>
              <Text style={[styles.resultTitle, { color: colors.text }]}>
                {locale === 'ja' ? '提供割合' : 'Drop Rates'}
              </Text>
              <TouchableOpacity onPress={() => setShowRateModal(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {(Object.keys(RARITY_RATES) as GachaItem['rarity'][]).map((r) => (
              <View key={r} style={[styles.rateRow, { borderColor: colors.border }]}>
                <View style={[styles.ratePill, { backgroundColor: RARITY_COLORS[r].bg }]}>
                  <Text style={[styles.ratePillText, { color: RARITY_COLORS[r].text }]}>
                    {RARITY_LABELS[locale][r]}
                  </Text>
                </View>
                <Text style={[styles.ratePercent, { color: colors.text }]}>{RARITY_RATES[r]}%</Text>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowRateModal(false)}
            >
              <Text style={styles.closeButtonText}>
                {locale === 'ja' ? '閉じる' : 'Close'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  headerBalance: { fontSize: 13, fontWeight: '700' },
  content: { padding: 16, alignItems: 'stretch' },
  banner: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  bannerTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  bannerSub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  rateButton: { fontSize: 13, fontWeight: '600' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 20 },
  legendItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  legendText: { fontSize: 12, fontWeight: '700' },
  buttonRow: { flexDirection: 'column', gap: 12 },
  drawButton: { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  drawButtonText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  noteText: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  resultModal: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 20, maxHeight: '85%' },
  resultHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  resultTitle: { fontSize: 20, fontWeight: 'bold' },
  resultItem: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  resultItemName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  resultItemRarity: { fontSize: 13, fontWeight: '700' },
  resultItemMeta: { fontSize: 12, marginTop: 4 },
  resultItemReward: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  closeButton: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  ratePill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  ratePillText: { fontSize: 12, fontWeight: '700' },
  ratePercent: { fontSize: 16, fontWeight: 'bold' },
});

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Alert, Image } from 'react-native';
import PressableButton from './components/PressableButton';
import BackButton from './components/BackButton';
import { useNavigate } from 'react-router-dom';
import { useTheme } from './theme';
import { SoundManager } from './sound';
import {
  SHOP_ITEMS, loadStats, saveStats, loadPurchases, purchaseItem,
  UserStats, PurchaseRecord,
} from './missions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';
import { useLocale } from './hooks/useLocale';
import { Music, Repeat, ShoppingBag, Check, Crown, Palette } from 'lucide-react';
import { IMAGES } from './constants/images';
import { SHOP_ITEMS as GENERAL_SHOP_ITEMS, ShopItem as GeneralShopItem, loadPurchasedIds, savePurchasedIds } from './shopItems';

export default function ShopScreen() {
  const navigate = useNavigate();
  const { colors, onPrimary, scale, isCyberpunk, br } = useTheme();
  const locale = useLocale();
  const t = translations[locale];
  const fs = (n: number) => Math.round(n * scale);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [message, setMessage] = useState('');
  /* UI強化: コイン通貨対応の一般ショップ */
  const [coins, setCoins] = useState(0);
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);

  useEffect(() => {
    loadStats().then(setStats);
    loadPurchases().then(setPurchases);
    AsyncStorage.getItem('user_coins').then(v => setCoins(parseInt(v || '0', 10)));
    loadPurchasedIds().then(setPurchasedIds);
  }, []);

  // 一般アイテム（コイン/本両対応）の購入
  const purchaseGeneralItem = async (item: GeneralShopItem) => {
    if (purchasedIds.includes(item.id)) return;

    if (item.currency === 'coins') {
      if (coins < item.price) {
        Alert.alert(
          locale === 'ja' ? 'コイン不足' : 'Insufficient Coins',
          locale === 'ja' ? `このアイテムには${item.price}コイン必要です` : `This item costs ${item.price} coins`
        );
        SoundManager.play('wrong' as any);
        return;
      }
      const newCoins = coins - item.price;
      await AsyncStorage.setItem('user_coins', newCoins.toString());
      setCoins(newCoins);
    } else {
      const currentBooks = stats?.totalBooks ?? 0;
      if (currentBooks < item.price) {
        Alert.alert(
          locale === 'ja' ? '本不足' : 'Insufficient Books',
          locale === 'ja' ? `このアイテムには${item.price}冊の本が必要です` : `This item costs ${item.price} books`
        );
        SoundManager.play('wrong' as any);
        return;
      }
      const updatedStats = await loadStats();
      updatedStats.totalBooks = Math.max(0, updatedStats.totalBooks - item.price);
      await saveStats(updatedStats);
      setStats(updatedStats);
    }

    // コインブースター系（type: 'item' かつコイン通貨）はコインを還元
    let bonusMessage = '';
    if (item.id === 's3') {
      const bonus = 50;
      const boosted = (await AsyncStorage.getItem('user_coins')) || '0';
      const total = parseInt(boosted, 10) + bonus;
      await AsyncStorage.setItem('user_coins', total.toString());
      setCoins(total);
      bonusMessage = locale === 'ja' ? `（コイン+${bonus}）` : `(coins +${bonus})`;
    }
    if (item.id === 's4') {
      const updatedStats = await loadStats();
      updatedStats.totalBooks += 1;
      await saveStats(updatedStats);
      setStats(updatedStats);
      bonusMessage = locale === 'ja' ? '（本+1）' : '(books +1)';
    }

    const nextIds = [...purchasedIds, item.id];
    await savePurchasedIds(nextIds);
    setPurchasedIds(nextIds);

    SoundManager.play('complete');
    Alert.alert(
      locale === 'ja' ? '購入完了！' : 'Purchase Complete!',
      `${item.name}${bonusMessage ? ' ' + bonusMessage : ''}`
    );
  };

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const handlePurchase = async (itemId: string) => {
    const result = await purchaseItem(itemId);
    if (result.success) {
      SoundManager.play('complete');
      const updated = await loadStats();
      const updatedPurchases = await loadPurchases();
      setStats(updated);
      setPurchases(updatedPurchases);
      showMessage(t.purchased);
    } else {
      SoundManager.play('wrong' as any);
      if (result.reason === 'insufficient') {
        showMessage(t.notEnoughBooks);
      } else if (result.reason === 'max_reached') {
        showMessage(t.alreadyPurchased);
      }
    }
  };

  const getPurchaseCount = (itemId: string) =>
    purchases.find(p => p.itemId === itemId)?.count ?? 0;

  const questionLimit = stats?.questionSlots ?? 20;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 10 }]}>
        <BackButton to="/sub" />
        <Text style={[styles.headerTitle, { color: colors.text, fontSize: fs(20), flex: 1, flexShrink: 1 }]} numberOfLines={1}>
          {t.shopTitle}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {coins > 0 && (
            <View style={[styles.booksBadge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.booksText, { color: colors.primary, fontSize: fs(15) }]}>
                <Image source={IMAGES.coin} style={{ width: 18, height: 18, resizeMode: 'contain', marginRight: 4 }} />{coins}
              </Text>
            </View>
          )}
          {stats && (
            <View style={[styles.booksBadge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.booksText, { color: colors.primary, fontSize: fs(15) }]}>
                <Image source={IMAGES.book} style={{ width: 18, height: 18, resizeMode: 'contain', marginRight: 4 }} />{stats.totalBooks}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Message */}
      {message ? (
        <View style={[styles.messageBanner, { backgroundColor: colors.success }]}>
          <Text style={[styles.messageText, { fontSize: fs(14) }]}>{message}</Text>
        </View>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ===== 一般アイテム（コイン/本） ===== */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fs(16) }]}>
          {locale === 'ja' ? 'アイテムショップ' : 'Item Shop'}
        </Text>
        {GENERAL_SHOP_ITEMS.map((item) => {
          const isPurchased = purchasedIds.includes(item.id);
          const isCoinIcon = item.icon === 'Coins';
          const isBookIcon = item.icon === 'BookOpen';
          const IconComp =
            item.icon === 'Palette' ? Palette :
            item.icon === 'Crown' ? Crown : ShoppingBag;
          return (
            <View key={item.id} style={[styles.generalCard, { backgroundColor: colors.card, borderColor: isPurchased ? colors.success : colors.border }]}>
              <View style={styles.generalTop}>
                <View style={[styles.generalIconWrap, { backgroundColor: colors.primary + '18' }]}>
                  {isCoinIcon ? (
                    <Image source={IMAGES.coin} style={{ width: 24, height: 24, resizeMode: 'contain' }} />
                  ) : isBookIcon ? (
                    <Image source={IMAGES.book} style={{ width: 24, height: 24, resizeMode: 'contain' }} />
                  ) : (
                    <IconComp size={24} color={colors.primary} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.itemTitle, { color: colors.text, fontSize: fs(15) }]}>{item.name}</Text>
                    {isPurchased && (
                      <View style={[styles.purchasedBadge, { backgroundColor: colors.success }]}>
                        <Check size={12} color="#fff" />
                        <Text style={styles.purchasedBadgeText}>
                          {locale === 'ja' ? '購入済み' : 'Owned'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.itemDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>{item.description}</Text>
                </View>
              </View>
              <View style={styles.generalFooter}>
                <Text style={[styles.itemPrice, { color: item.currency === 'coins' ? colors.primary : colors.success, fontSize: fs(14), fontWeight: 'bold' }]}>
                  {item.currency === 'coins' ? (
                    <>
                      <Image source={IMAGES.coin} style={{ width: 16, height: 16, resizeMode: 'contain', marginRight: 4 }} />{item.price}
                    </>
                  ) : (
                    <>
                      <Image source={IMAGES.book} style={{ width: 16, height: 16, resizeMode: 'contain', marginRight: 4 }} />{item.price}{locale === 'ja' ? '冊' : ''}
                    </>
                  )}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.buyButton,
                    {
                      backgroundColor: isPurchased
                        ? colors.border
                        : (coins >= item.price || (stats?.totalBooks ?? 0) >= item.price)
                          ? colors.primary
                          : colors.border,
                    },
                  ]}
                  onPress={() => purchaseGeneralItem(item)}
                  disabled={isPurchased}
                >
                  <Text style={[styles.buyButtonText, { color: isPurchased ? colors.textSecondary : onPrimary, fontSize: fs(13) }]}>
                    {isPurchased ? (locale === 'ja' ? '購入済み' : 'Purchased') : (locale === 'ja' ? '購入' : 'Buy')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* ===== スペシャル（既存: 本専用機能） ===== */}
        <Text style={[styles.sectionTitle, { color: colors.text, fontSize: fs(16), marginTop: 20 }]}>
          {t.shopTitle}
        </Text>
        {/* Current status */}
        <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statusTitle, { color: colors.text, fontSize: fs(14) }]}>
            {t.currentStatus}
          </Text>
          <View style={styles.statusRow}>
            <Text style={[styles.statusLabel, { color: colors.textSecondary, fontSize: fs(13) }]}>
              {t.questionLimit}
            </Text>
            <Text style={[styles.statusValue, { color: colors.primary, fontSize: fs(15) }]}>
              {questionLimit} {locale === 'ja' ? '問' : 'questions'}
            </Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={[styles.statusLabel, { color: colors.textSecondary, fontSize: fs(13) }]}>
              {t.customBgm}
            </Text>
            <Text style={[styles.statusValue, { color: stats?.unlockedFeatures?.includes('custom_bgm') ? colors.success : colors.textSecondary, fontSize: fs(13) }]}>
              {stats?.unlockedFeatures?.includes('custom_bgm')
                ? t.unlocked
                : t.locked}
            </Text>
          </View>
        </View>

        {/* Shop items */}
        {SHOP_ITEMS.map(item => {
          const count = getPurchaseCount(item.id);
          const maxed = item.maxPurchase !== undefined && count >= item.maxPurchase;
          const canAfford = (stats?.totalBooks ?? 0) >= item.cost;

          return (
            <View key={item.id} style={[styles.itemCard, { backgroundColor: colors.card, borderColor: maxed ? colors.success : colors.border }]}>
              <View style={styles.itemTop}>
                <Text style={styles.itemIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemTitle, { color: colors.text, fontSize: fs(15) }]}>
                    {locale === 'ja' ? item.titleJa : item.titleEn}
                  </Text>
                  <Text style={[styles.itemDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>
                    {locale === 'ja' ? item.descJa : item.descEn}
                  </Text>
                </View>
                <View style={[styles.costBadge, { backgroundColor: colors.primary + '15' }]}>
                  <Text style={[styles.costText, { color: colors.primary, fontSize: fs(14) }]}>
                    <Image source={IMAGES.book} style={{ width: 16, height: 16, resizeMode: 'contain', marginRight: 4 }} />{item.cost}
                  </Text>
                </View>
              </View>

              {maxed ? (
                <View style={[styles.purchasedTag, { backgroundColor: colors.success + '20' }]}>
                  <Text style={[styles.purchasedText, { color: colors.success, fontSize: fs(13) }]}>
                    {t.alreadyPurchased}
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.buyButton, {
                    backgroundColor: canAfford ? colors.primary : colors.border,
                  }]}
                  onPress={() => handlePurchase(item.id)}
                  disabled={!canAfford}
                >
                  <Text style={[styles.buyButtonText, { color: canAfford ? onPrimary : colors.textSecondary, fontSize: fs(14) }]}>
                    {canAfford
                      ? t.purchase
                      : t.insufficientBooks}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Custom BGM section (unlocked only) */}
        {stats?.unlockedFeatures?.includes('custom_bgm') && (
          <CustomBGMSection colors={colors} onPrimary={onPrimary} fs={fs} t={t} />
        )}

        {/* ──────── コイン両替所 ──────── */}
        <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
          <View style={styles.itemTop}>
            <Repeat size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemTitle, { color: colors.text, fontSize: fs(15) }]}>
                {locale === 'ja' ? 'コイン両替所' : 'Coin Exchange'}
              </Text>
              <Text style={[styles.itemDesc, { color: colors.textSecondary, fontSize: fs(12) }]}>
                {locale === 'ja' ? 'コインを使って本を購入する' : 'Exchange coins for books'}
              </Text>
            </View>
          </View>

          <View style={[styles.exchangeRow, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.text, fontSize: fs(14) }]}>
                <Image source={IMAGES.book} style={{ width: 16, height: 16, resizeMode: 'contain', marginRight: 4 }} />{locale === 'ja' ? '本1冊' : '1 Book'}
              </Text>
              <Text style={[styles.statusLabel, { color: colors.textSecondary, fontSize: fs(12) }]}>
                {locale === 'ja' ? '問題スロット +5問' : '+5 Question Slots'}
              </Text>
            </View>
            <View style={[styles.costBadge, { backgroundColor: colors.primary + '15', marginRight: 12 }]}>
              <Text style={[styles.costText, { color: colors.primary, fontSize: fs(14) }]}>
                <Image source={IMAGES.coin} style={{ width: 16, height: 16, resizeMode: 'contain', marginRight: 4 }} />1,000 {locale === 'ja' ? 'コイン' : 'Coins'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.buyButton, { backgroundColor: colors.primary, minWidth: 90 }]}
              onPress={async () => {
                const coins = parseInt(await AsyncStorage.getItem('user_coins') || '0', 10);
                if (coins >= 1000) {
                  const stats = await loadStats();
                  stats.totalBooks = (stats.totalBooks || 0) + 1;
                  stats.questionSlots = (stats.questionSlots || 20) + 5;
                  stats.totalCoinsSpent = (stats.totalCoinsSpent || 0) + 1000;
                  await saveStats(stats);
                  await AsyncStorage.setItem('user_coins', (coins - 1000).toString());
                  setStats(await loadStats());
                  setMessage(t.purchased);
                  setTimeout(() => setMessage(''), 2500);
                  SoundManager.play('complete');
                } else {
                  Alert.alert(
                    locale === 'ja' ? 'コイン不足' : 'Insufficient Coins',
                    locale === 'ja' ? `あと${1000 - coins}コイン必要です` : `Need ${1000 - coins} more coins`
                  );
                }
              }}
            >
              <Text style={[styles.buyButtonText, { color: onPrimary, fontSize: fs(14) }]}>
                {locale === 'ja' ? '交換する' : 'Exchange'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────
// カスタムBGMコンポーネント（ウェブ専用）
// ─────────────────────────────────────────────

function CustomBGMSection({ colors, onPrimary, fs, t }: any) {
  const [fileName, setFileName] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const pickFile = () => {
    if (Platform.OS !== 'web') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setFileName(file.name);
      setAudioUrl(url);
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = url;
      }
    };
    input.click();
  };

  const togglePlay = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.loop = true;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <View style={[styles.customBGMCard, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <Text style={[styles.itemTitle, { color: colors.text, fontSize: fs(15), marginBottom: 8 }]}>
        <Music size={18} color={colors.primary} style={{ marginRight: 6 }} />{t.customBgm}
      </Text>
      <Text style={[styles.itemDesc, { color: colors.textSecondary, fontSize: fs(12), marginBottom: 12 }]}>
        {t.audioFileSupport}
      </Text>

      <TouchableOpacity
        style={[styles.buyButton, { backgroundColor: colors.primary, marginBottom: 10 }]}
        onPress={pickFile}
      >
        <Text style={[styles.buyButtonText, { color: onPrimary, fontSize: fs(14) }]}>
          {t.chooseFile}
        </Text>
      </TouchableOpacity>

      {fileName ? (
        <>
          <Text style={[styles.itemDesc, { color: colors.textSecondary, fontSize: fs(12), marginBottom: 8 }]}>
            {fileName}
          </Text>
          <TouchableOpacity
            style={[styles.buyButton, { backgroundColor: isPlaying ? colors.error : colors.success }]}
            onPress={togglePlay}
          >
            <Text style={[styles.buyButtonText, { color: '#fff', fontSize: fs(14) }]}>
              {isPlaying ? t.stop : t.play}
            </Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontWeight: 'bold' },
  booksBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  booksText: { fontWeight: 'bold' },
  messageBanner: { padding: 10, alignItems: 'center' },
  messageText: { color: '#fff', fontWeight: 'bold' },
  list: { flex: 1, padding: 16 },
  statusCard: { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  statusTitle: { fontWeight: 'bold', marginBottom: 10 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  statusLabel: {},
  statusValue: { fontWeight: 'bold' },
  itemCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  itemIcon: { fontSize: 28 },
  itemTitle: { fontWeight: 'bold', marginBottom: 3 },
  itemDesc: { lineHeight: 18 },
  costBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  costText: { fontWeight: 'bold' },
  buyButton: { padding: 12, borderRadius: 8, alignItems: 'center' },
  buyButtonText: { fontWeight: 'bold' },
  purchasedTag: { padding: 10, borderRadius: 8, alignItems: 'center' },
  purchasedText: { fontWeight: 'bold' },
  customBGMCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 2 },
  backButton: { margin: 16, padding: 14, borderRadius: 12, alignItems: 'center' },
  backButtonText: { fontWeight: 'bold' },
  exchangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  /* === UI強化: 一般アイテムショップ === */
  sectionTitle: { fontWeight: 'bold', marginBottom: 12 },
  generalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  generalTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  generalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchasedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  purchasedBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  itemPrice: {},
  generalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
});

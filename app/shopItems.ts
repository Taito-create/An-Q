// ──────────────────────────────────────────────
// ショップアイテム定義（コイン/本 両通貨対応）
// ──────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ShopCurrency = 'coins' | 'books';
export type ShopItemType = 'skin' | 'title' | 'background' | 'item';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: ShopCurrency;
  type: ShopItemType;
  icon: string; // Lucideアイコン名
}

export const SHOP_ITEMS: ShopItem[] = [
  // コインで購入
  { id: 's1', name: '限定スキン', description: '特別なデザインのスキン', price: 500, currency: 'coins', type: 'skin', icon: 'Palette' },
  { id: 's2', name: '称号「マスター」', description: '誇り高き称号', price: 300, currency: 'coins', type: 'title', icon: 'Crown' },
  { id: 's3', name: 'コインブースター', description: 'コインを50枚獲得', price: 100, currency: 'coins', type: 'item', icon: 'Coins' },

  // 本で購入
  { id: 's4', name: '特別な本', description: '貴重な知識の書', price: 5, currency: 'books', type: 'item', icon: 'BookOpen' },
  { id: 's5', name: '限定テーマ', description: '美しい背景デザイン', price: 3, currency: 'books', type: 'background', icon: 'Palette' },
  { id: 's6', name: '称号「賢者」', description: '知恵の象徴', price: 10, currency: 'books', type: 'title', icon: 'Crown' },
];

// ── 購入済みIDの永続化 ──
const PURCHASED_KEY = 'SHOP_ITEM_PURCHASES';

export async function loadPurchasedIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(PURCHASED_KEY);
    if (raw) return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load purchased shop items:', error);
  }
  return [];
}

export async function savePurchasedIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PURCHASED_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to save purchased shop items:', error);
  }
}
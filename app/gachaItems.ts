// ──────────────────────────────────────────────
// ガチャアイテム定義
// レアリティ: N / R / SR / UR
// ──────────────────────────────────────────────

export type GachaRarity = 'N' | 'R' | 'SR' | 'UR';
export type GachaItemType = 'skin' | 'title' | 'background' | 'coin' | 'book';

export interface GachaItem {
  id: string;
  name: string;
  rarity: GachaRarity;
  type: GachaItemType;
  icon: string; // Lucideアイコン名
  description: string;
  owned: boolean;
  /** コイン/本の付与量（type が 'coin' | 'book' の場合） */
  value?: number;
}

export const GACHA_ITEMS: GachaItem[] = [
  // ── N (ノーマル) 48% ──
  { id: 'n1', name: '普通の称号', rarity: 'N', type: 'title', icon: 'Award', description: '特に効果はありません', owned: false },
  { id: 'n2', name: '鉄のバッジ', rarity: 'N', type: 'background', icon: 'Shield', description: '落ち着いた色合いの背景', owned: false },
  { id: 'n3', name: '小さなコイン袋', rarity: 'N', type: 'coin', icon: 'Coins', description: 'コインを少し獲得', owned: false, value: 50 },
  { id: 'n4', name: '初級者の証', rarity: 'N', type: 'title', icon: 'BookOpen', description: '学習を始めた印', owned: false },
  { id: 'n5', name: '古びた本', rarity: 'N', type: 'book', icon: 'BookOpen', description: '本1冊獲得', owned: false, value: 1 },
  { id: 'n6', name: '無難なテーマ', rarity: 'N', type: 'background', icon: 'Palette', description: '落ち着いた配色の背景', owned: false },
  { id: 'n7', name: '銅のトロフィー', rarity: 'N', type: 'title', icon: 'Trophy', description: '小さな誇り', owned: false },
  { id: 'n8', name: '初心者の手帳', rarity: 'N', type: 'book', icon: 'Notebook', description: '本1冊獲得', owned: false, value: 1 },
  { id: 'n9', name: 'ありふれたコイン', rarity: 'N', type: 'coin', icon: 'Coins', description: 'コイン20枚獲得', owned: false, value: 20 },
  { id: 'n10', name: '鍛錬の証', rarity: 'N', type: 'title', icon: 'Zap', description: '毎日の努力を称えて', owned: false },

  // ── R (レア) 40% ──
  { id: 'r1', name: '銀のバッジ', rarity: 'R', type: 'background', icon: 'Shield', description: 'シルバー調の背景', owned: false },
  { id: 'r2', name: '知識の王冠', rarity: 'R', type: 'title', icon: 'Crown', description: '知識欲の証', owned: false },
  { id: 'r3', name: '中くらいのコイン袋', rarity: 'R', type: 'coin', icon: 'Coins', description: 'コイン100枚獲得', owned: false, value: 100 },
  { id: 'r4', name: '教科書セット', rarity: 'R', type: 'book', icon: 'BookOpen', description: '本3冊獲得', owned: false, value: 3 },
  { id: 'r5', name: 'レアスキン', rarity: 'R', type: 'skin', icon: 'Palette', description: '青い輝きのスキン', owned: false },
  { id: 'r6', name: '情熱のテーマ', rarity: 'R', type: 'background', icon: 'Palette', description: '力強い配色の背景', owned: false },
  { id: 'r7', name: '銀のトロフィー', rarity: 'R', type: 'title', icon: 'Trophy', description: '中堅の印', owned: false },

  // ── SR (スーパーレア) 9% ──
  { id: 'sr1', name: '金の王冠', rarity: 'SR', type: 'title', icon: 'Crown', description: '真の王者の証', owned: false },
  { id: 'sr2', name: '大判コイン', rarity: 'SR', type: 'coin', icon: 'Coins', description: 'コイン300枚獲得', owned: false, value: 300 },
  { id: 'sr3', name: '金のバッジ', rarity: 'SR', type: 'background', icon: 'Shield', description: '黄金の背景', owned: false },
  { id: 'sr4', name: 'SRスキン', rarity: 'SR', type: 'skin', icon: 'Sparkles', description: '輝く魔法のスキン', owned: false },
  { id: 'sr5', name: '図書館セット', rarity: 'SR', type: 'book', icon: 'BookOpen', description: '本10冊獲得', owned: false, value: 10 },

  // ── UR (ウルトラレア) 1% ──
  { id: 'ur1', name: '伝説の王冠', rarity: 'UR', type: 'title', icon: 'Crown', description: '究極の称号', owned: false },
  { id: 'ur2', name: 'URスキン', rarity: 'UR', type: 'skin', icon: 'Sparkles', description: '伝説のスキン', owned: false },
];

export const RARITY_COLORS: Record<GachaRarity, { bg: string; border: string; text: string }> = {
  N: { bg: '#8E8E93', border: '#8E8E93', text: '#FFFFFF' },
  R: { bg: '#007AFF', border: '#007AFF', text: '#FFFFFF' },
  SR: { bg: '#AF52DE', border: '#AF52DE', text: '#FFFFFF' },
  UR: { bg: '#FFD700', border: '#FFD700', text: '#000000' },
};

export const RARITY_LABELS: Record<'ja' | 'en', Record<GachaRarity, string>> = {
  ja: { N: 'ノーマル', R: 'レア', SR: 'スーパーレア', UR: 'ウルトラレア' },
  en: { N: 'Normal', R: 'Rare', SR: 'Super Rare', UR: 'Ultra Rare' },
};

/** 提供割合（パーセント） */
export const RARITY_RATES: Record<GachaRarity, number> = {
  N: 48,
  R: 40,
  SR: 9,
  UR: 1,
};
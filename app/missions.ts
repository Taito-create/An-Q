import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────
export type MissionPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Mission {
  id: string;
  period: MissionPeriod;
  titleJa: string;
  titleEn: string;
  descJa: string;
  descEn: string;
  goal: number;
  reward: number; // 本の報酬数
  statKey: StatKey;
}

export type StatKey =
  | 'quizPlayed'
  | 'questionsCreated'
  | 'correctAnswers'
  | 'loginDays'
  | 'perfectQuiz'
  | 'calendarEvents';

export interface MissionProgress {
  missionId: string;
  current: number;
  completed: boolean;
  claimedAt?: string; // ISO date string
  resetAt?: string;   // 次リセット日
}

export interface TitleBadge {
  id: string;
  titleJa: string;
  titleEn: string;
  descJa: string;
  descEn: string;
  condition: (stats: UserStats) => boolean;
  icon: string;
}

export interface UserStats {
  quizPlayed: number;
  questionsCreated: number;
  correctAnswers: number;
  loginDays: number;
  perfectQuiz: number;
  calendarEvents: number;
  maxStreak: number;
  totalBooks: number;
  firstLoginDate: string;
  lastLoginDate: string;
  unlockedTitles: string[];
  equippedTitle: string;
  currentCorrectStreak: number;  // 現在の連続正解数
  maxCorrectStreak: number;       // 最大連続正解数
  tagStats: Record<string, { correct: number; total: number }>; // タグ別成績
  totalCoins: number;           // 所持コイン
  totalCoinsEarned: number;     // 累計獲得コイン（統計用）
  totalCoinsSpent: number;      // 累計消費コイン（統計用）
  dailyLoginBonusClaimed: string; // 最終ボーナス受領日 (YYYY-MM-DD)
  loginStreak: number;           // 連続ログイン日数
  questionSlots?: number;        // 問題スロット拡張数
  unlockedFeatures?: string[];   // 解放済み機能のキー一覧
}

// ─────────────────────────────────────────────
// ミッション定義
// ─────────────────────────────────────────────
export const MISSIONS: Mission[] = [
  // デイリー
  { id: 'd1', period: 'daily', titleJa: '今日もクイズ！', titleEn: 'Daily Quiz', descJa: 'クイズを1回プレイする', descEn: 'Play a quiz once today', goal: 1, reward: 3, statKey: 'quizPlayed' },
  { id: 'd2', period: 'daily', titleJa: '問題作成者', titleEn: 'Question Creator', descJa: '問題を1問作成する', descEn: 'Create 1 question today', goal: 1, reward: 2, statKey: 'questionsCreated' },
  { id: 'd3', period: 'daily', titleJa: '正解ラッシュ', titleEn: 'Correct Rush', descJa: '今日10問正解する', descEn: 'Answer 10 questions correctly today', goal: 10, reward: 5, statKey: 'correctAnswers' },

  // ウィークリー
  { id: 'w1', period: 'weekly', titleJa: '週間クイズ王', titleEn: 'Weekly Quiz King', descJa: '今週クイズを5回プレイする', descEn: 'Play 5 quizzes this week', goal: 5, reward: 15, statKey: 'quizPlayed' },
  { id: 'w2', period: 'weekly', titleJa: '問題コレクター', titleEn: 'Question Collector', descJa: '今週問題を3問作成する', descEn: 'Create 3 questions this week', goal: 3, reward: 10, statKey: 'questionsCreated' },
  { id: 'w3', period: 'weekly', titleJa: '完璧主義者', titleEn: 'Perfectionist', descJa: '今週パーフェクトを1回達成する', descEn: 'Get a perfect score once this week', goal: 1, reward: 20, statKey: 'perfectQuiz' },

  // マンスリー
  { id: 'm1', period: 'monthly', titleJa: '月間チャンピオン', titleEn: 'Monthly Champion', descJa: '今月クイズを20回プレイする', descEn: 'Play 20 quizzes this month', goal: 20, reward: 50, statKey: 'quizPlayed' },
  { id: 'm2', period: 'monthly', titleJa: '問題マスター', titleEn: 'Question Master', descJa: '今月問題を10問作成する', descEn: 'Create 10 questions this month', goal: 10, reward: 40, statKey: 'questionsCreated' },
  { id: 'm3', period: 'monthly', titleJa: '試験管理者', titleEn: 'Exam Manager', descJa: '今月試験日を3件登録する', descEn: 'Register 3 exam dates this month', goal: 3, reward: 30, statKey: 'calendarEvents' },

  // 通年
  { id: 'y1', period: 'yearly', titleJa: '百問達成', titleEn: 'Century', descJa: '累計100問正解する', descEn: 'Answer 100 questions correctly in total', goal: 100, reward: 100, statKey: 'correctAnswers' },
  { id: 'y2', period: 'yearly', titleJa: '継続は力なり', titleEn: 'Consistency', descJa: '累計30日ログインする', descEn: 'Log in for 30 days total', goal: 30, reward: 80, statKey: 'loginDays' },
  { id: 'y3', period: 'yearly', titleJa: '問題職人', titleEn: 'Question Artisan', descJa: '累計50問作成する', descEn: 'Create 50 questions in total', goal: 50, reward: 120, statKey: 'questionsCreated' },
];

// ─────────────────────────────────────────────
// 称号定義
// ─────────────────────────────────────────────
export const TITLE_BADGES: TitleBadge[] = [
  { id: 'beginner',    icon: '🌱', titleJa: '初学者',     titleEn: 'Beginner',      descJa: 'クイズを初めてプレイした',       descEn: 'Played your first quiz',              condition: s => s.quizPlayed >= 1 },
  { id: 'studious',    icon: '📖', titleJa: '勉強家',     titleEn: 'Studious',      descJa: 'クイズを10回プレイした',         descEn: 'Played 10 quizzes',                   condition: s => s.quizPlayed >= 10 },
  { id: 'scholar',     icon: '🎓', titleJa: '学者',       titleEn: 'Scholar',       descJa: 'クイズを50回プレイした',         descEn: 'Played 50 quizzes',                   condition: s => s.quizPlayed >= 50 },
  { id: 'master',      icon: '👑', titleJa: 'マスター',   titleEn: 'Master',        descJa: 'クイズを100回プレイした',        descEn: 'Played 100 quizzes',                  condition: s => s.quizPlayed >= 100 },
  { id: 'creator',     icon: '✏️', titleJa: '問題作成者', titleEn: 'Creator',       descJa: '問題を10問作成した',             descEn: 'Created 10 questions',                condition: s => s.questionsCreated >= 10 },
  { id: 'architect',   icon: '🏗️', titleJa: '設計者',     titleEn: 'Architect',     descJa: '問題を50問作成した',             descEn: 'Created 50 questions',                condition: s => s.questionsCreated >= 50 },
  { id: 'perfecter',   icon: '💯', titleJa: '完璧主義者', titleEn: 'Perfectionist', descJa: 'パーフェクトを5回達成した',      descEn: 'Got 5 perfect scores',                condition: s => s.perfectQuiz >= 5 },
  { id: 'streak7',     icon: '🔥', titleJa: '7日連続',    titleEn: '7-Day Streak',  descJa: '7日連続ログインした',            descEn: 'Logged in 7 days in a row',           condition: s => s.maxStreak >= 7 },
  { id: 'streak30',    icon: '⚡', titleJa: '30日連続',   titleEn: '30-Day Streak', descJa: '30日連続ログインした',           descEn: 'Logged in 30 days in a row',          condition: s => s.maxStreak >= 30 },
  { id: 'centurion',   icon: '🏆', titleJa: '百問正解',   titleEn: 'Centurion',     descJa: '累計100問正解した',              descEn: 'Answered 100 questions correctly',    condition: s => s.correctAnswers >= 100 },
  { id: 'millionaire', icon: '📚', titleJa: '本持ち',     titleEn: 'Bookworm',      descJa: '本を100冊集めた',                descEn: 'Collected 100 books',                 condition: s => s.totalBooks >= 100 },
  { id: 'planner',     icon: '📅', titleJa: '計画者',     titleEn: 'Planner',       descJa: '試験日を5件登録した',            descEn: 'Registered 5 exam dates',             condition: s => s.calendarEvents >= 5 },
];

// ─────────────────────────────────────────────
// デフォルト統計
// ─────────────────────────────────────────────
export const DEFAULT_STATS: UserStats = {
  quizPlayed: 0,
  questionsCreated: 0,
  correctAnswers: 0,
  loginDays: 0,
  perfectQuiz: 0,
  calendarEvents: 0,
  maxStreak: 0,
  totalBooks: 0,
  firstLoginDate: new Date().toISOString().split('T')[0],
  lastLoginDate: new Date().toISOString().split('T')[0],
  unlockedTitles: [],
  equippedTitle: '',
  currentCorrectStreak: 0,
  maxCorrectStreak: 0,
  tagStats: {},
  totalCoins: 0,
  totalCoinsEarned: 0,
  totalCoinsSpent: 0,
  dailyLoginBonusClaimed: '',
  loginStreak: 0,
};

// ─────────────────────────────────────────────
// ストレージ操作
// ─────────────────────────────────────────────
const STATS_KEY = 'USER_STATS';
const PROGRESS_KEY = 'MISSION_PROGRESS';

export async function loadStats(): Promise<UserStats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    if (raw) return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_STATS };
}

export async function saveStats(stats: UserStats): Promise<void> {
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export async function loadProgress(): Promise<MissionProgress[]> {
  try {
    const raw = await AsyncStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function saveProgress(progress: MissionProgress[]): Promise<void> {
  await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

// ─────────────────────────────────────────────
// ミッション進捗の期間リセット判定
// ─────────────────────────────────────────────
function getPeriodKey(period: MissionPeriod): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const week = getWeekNumber(now);
  switch (period) {
    case 'daily':   return `${y}-${m}-${d}`;
    case 'weekly':  return `${y}-W${week}`;
    case 'monthly': return `${y}-${m}`;
    case 'yearly':  return `${y}`;
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ミッション進捗を取得（期間リセット込み）
export function getMissionProgress(
  mission: Mission,
  allProgress: MissionProgress[],
  stats: UserStats
): MissionProgress {
  const periodKey = getPeriodKey(mission.period);
  const existing = allProgress.find(p => p.missionId === mission.id);

  // 期間が変わっていたらリセット
  if (existing && existing.resetAt !== periodKey) {
    return { missionId: mission.id, current: 0, completed: false, resetAt: periodKey };
  }
  if (!existing) {
    return { missionId: mission.id, current: 0, completed: false, resetAt: periodKey };
  }
  return existing;
}

// 統計をインクリメントしてミッション進捗を更新
export async function incrementStat(
  key: StatKey,
  amount: number = 1
): Promise<{ newBooks: number; completedMissions: string[] }> {
  const stats = await loadStats();
  const progress = await loadProgress();

  (stats as any)[key] = ((stats as any)[key] || 0) + amount;

  let newBooks = 0;
  const completedMissions: string[] = [];

  const updatedProgress = MISSIONS.map(mission => {
    const p = getMissionProgress(mission, progress, stats);
    if (p.completed) return p;

    if (mission.statKey === key) {
      const newCurrent = Math.min(p.current + amount, mission.goal);
      if (newCurrent >= mission.goal) {
        newBooks += mission.reward;
        completedMissions.push(mission.id);
        return { ...p, current: newCurrent, completed: true };
      }
      return { ...p, current: newCurrent };
    }
    return p;
  });

  stats.totalBooks += newBooks;

  // 称号チェック
  TITLE_BADGES.forEach(badge => {
    if (!stats.unlockedTitles.includes(badge.id) && badge.condition(stats)) {
      stats.unlockedTitles.push(badge.id);
    }
  });

  await saveStats(stats);
  await saveProgress(updatedProgress);

  return { newBooks, completedMissions };
}

// ログイン処理
export async function recordLogin(): Promise<void> {
  const stats = await loadStats();
  const today = new Date().toISOString().split('T')[0];
  if (stats.lastLoginDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  stats.loginDays += 1;
  if (stats.lastLoginDate === yesterdayStr) {
    stats.maxStreak = (stats.maxStreak || 0) + 1;
  } else {
    stats.maxStreak = 1;
  }
  stats.lastLoginDate = today;

  await incrementStat('loginDays', 1);
}

// ─────────────────────────────────────────────
// ショップアイテム定義
// ─────────────────────────────────────────────
export interface ShopItem {
  id: string;
  titleJa: string;
  titleEn: string;
  descJa: string;
  descEn: string;
  cost: number;        // 本の消費数
  type: 'slot' | 'feature';
  featureKey?: string; // feature の場合の識別キー
  maxPurchase?: number; // 最大購入回数（undefined = 無制限）
  icon: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'question_slot',
    icon: '📝',
    titleJa: '問題スロット拡張 (+5問)',
    titleEn: 'Question Slot +5',
    descJa: '保存できる問題数を5問増やします（何度でも購入可）',
    descEn: 'Increase question limit by 5 (repeatable)',
    cost: 5,
    type: 'slot',
    maxPurchase: undefined,
  },
  {
    id: 'custom_bgm',
    icon: '🎵',
    titleJa: 'カスタムBGM解放',
    titleEn: 'Custom BGM Unlock',
    descJa: '自分の音楽ファイルをBGMとして使えるようになります',
    descEn: 'Play your own music files as BGM',
    cost: 30,
    type: 'feature',
    featureKey: 'custom_bgm',
    maxPurchase: 1,
  },
  {
    id: 'extra_theme',
    icon: '🎨',
    titleJa: 'グラデーションテーマ解放',
    titleEn: 'Gradient Theme Unlock',
    descJa: 'テーマカラーにグラデーション模様を追加できます',
    descEn: 'Add gradient pattern to theme',
    cost: 20,
    type: 'feature',
    featureKey: 'gradient_theme',
    maxPurchase: 1,
  },
];

// ショップ購入履歴
export interface PurchaseRecord {
  itemId: string;
  count: number;
}

const PURCHASE_KEY = 'SHOP_PURCHASES';

export async function loadPurchases(): Promise<PurchaseRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(PURCHASE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function savePurchases(purchases: PurchaseRecord[]): Promise<void> {
  await AsyncStorage.setItem(PURCHASE_KEY, JSON.stringify(purchases));
}

// 購入処理
export async function purchaseItem(
  itemId: string
): Promise<{ success: boolean; reason?: string }> {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { success: false, reason: 'not_found' };

  const stats = await loadStats();
  const purchases = await loadPurchases();
  const record = purchases.find(p => p.itemId === itemId);
  const count = record?.count ?? 0;

  if (item.maxPurchase !== undefined && count >= item.maxPurchase) {
    return { success: false, reason: 'max_reached' };
  }
  if (stats.totalBooks < item.cost) {
    return { success: false, reason: 'insufficient' };
  }

  stats.totalBooks -= item.cost;

  // スロット拡張の場合は questionSlots を増やす
  if (item.type === 'slot' && item.id === 'question_slot') {
    stats.questionSlots = (stats.questionSlots ?? 20) + 5;
  }
  // feature の場合は unlockedFeatures に追加
  if (item.type === 'feature' && item.featureKey) {
    if (!stats.unlockedFeatures) stats.unlockedFeatures = [];
    if (!stats.unlockedFeatures.includes(item.featureKey)) {
      stats.unlockedFeatures.push(item.featureKey);
    }
  }

  const updatedPurchases = record
    ? purchases.map(p => p.itemId === itemId ? { ...p, count: p.count + 1 } : p)
    : [...purchases, { itemId, count: 1 }];

  await saveStats(stats);
  await savePurchases(updatedPurchases);
  return { success: true };
}

// ─────────────────────────────────────────────
// クイズ結果の記録（連続正解・タグ別成績）
// ─────────────────────────────────────────────
export interface QuizAnswerRecord {
  isCorrect: boolean;
  tags: string[];
}

export async function recordQuizAnswers(answers: QuizAnswerRecord[]): Promise<void> {
  const stats = await loadStats();
  if (!stats.tagStats) stats.tagStats = {};
  if (typeof stats.currentCorrectStreak !== 'number') stats.currentCorrectStreak = 0;
  if (typeof stats.maxCorrectStreak !== 'number') stats.maxCorrectStreak = 0;

  for (const ans of answers) {
    if (ans.isCorrect) {
      stats.currentCorrectStreak += 1;
      if (stats.currentCorrectStreak > stats.maxCorrectStreak) {
        stats.maxCorrectStreak = stats.currentCorrectStreak;
      }
    } else {
      stats.currentCorrectStreak = 0;
    }
    // タグ別成績
    for (const tag of ans.tags) {
      if (!stats.tagStats[tag]) stats.tagStats[tag] = { correct: 0, total: 0 };
      stats.tagStats[tag].total += 1;
      if (ans.isCorrect) stats.tagStats[tag].correct += 1;
    }
  }
  await saveStats(stats);
}

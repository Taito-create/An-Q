import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, runTransaction, Unsubscribe } from 'firebase/firestore';
import { db } from '../config/firebase';

export interface TitleDefinition {
  id: string;
  icon: string;
  titleJa: string;
  titleEn: string;
  descriptionJa: string;
  descriptionEn: string;
  category: 'starter' | 'mission' | 'event' | 'future';
}

export interface UserProgressDocument {
  username: string;
  bio: string;
  profileImage: string | null;
  currentTitle: string;
  unlockedTitles: string[];
  level: number;
  currentXP: number;
  nextLevelXP: number;
  totalCoins: number;
  totalBooks: number;
  totalQuestionsCreated: number;
  totalQuizzesPlayed: number;
  totalCorrectAnswers: number;
  totalQuestionsAnswered: number;
  correctRate: number;
  streakDays: number;
  joinDate: number;
  lastLoginDate: number;
  achievements: string[];
}

export interface ProgressRewardResult {
  document: UserProgressDocument;
  leveledUp: number;
  levelUpCoins: number;
}

export interface QuizRewardInput {
  correctCount: number;
  questionCount: number;
  bonusXP?: number;
  bonusCoins?: number;
}

const DEFAULT_PROFILE: UserProgressDocument = {
  username: 'An-Q Learner',
  bio: '',
  profileImage: null,
  currentTitle: 'apprentice',
  unlockedTitles: ['apprentice', 'memory-monk'],
  level: 1,
  currentXP: 0,
  nextLevelXP: 100,
  totalCoins: 0,
  totalBooks: 0,
  totalQuestionsCreated: 0,
  totalQuizzesPlayed: 0,
  totalCorrectAnswers: 0,
  totalQuestionsAnswered: 0,
  correctRate: 0,
  streakDays: 1,
  joinDate: Date.now(),
  lastLoginDate: Date.now(),
  achievements: [],
};

const STORAGE_KEYS = {
  username: 'user_username',
  bio: 'user_bio',
  profileImage: 'user_profile_image',
  currentTitle: 'user_current_title',
  unlockedTitles: 'user_unlocked_titles',
  level: 'user_level',
  xp: 'user_xp',
  coins: 'user_coins',
  books: 'user_books',
  streak: 'streakCount',
  lastStudyDate: 'lastStudyDate',
  joinDate: 'join_date',
  lastLoginDate: 'lastLoginDate',
};

export const TITLE_LIBRARY: TitleDefinition[] = [
  {
    id: 'apprentice',
    icon: '👑',
    titleJa: '見習い暗記人',
    titleEn: 'Apprentice Mnemonic',
    descriptionJa: '最初に装備される基本称号です',
    descriptionEn: 'The default starter title',
    category: 'starter',
  },
  {
    id: 'memory-monk',
    icon: '📿',
    titleJa: '暗記行者',
    titleEn: 'Memory Monk',
    descriptionJa: '覚えることを修行に変える者',
    descriptionEn: 'Turns memorization into a discipline',
    category: 'starter',
  },
  {
    id: 'warm-old-new',
    icon: '📚',
    titleJa: '温故知新',
    titleEn: 'Warm Old, New Know',
    descriptionJa: '古きを温ねて新しきを知る称号',
    descriptionEn: 'Learn the new by revisiting the old',
    category: 'future',
  },
  {
    id: 'time-is-money',
    icon: '⏳',
    titleJa: '時は金なり',
    titleEn: 'Time is Money',
    descriptionJa: '時間を制する学び手の称号',
    descriptionEn: 'For learners who value every minute',
    category: 'future',
  },
  {
    id: 'sage-of-study',
    icon: '🧠',
    titleJa: '学びの仙人',
    titleEn: 'Sage of Study',
    descriptionJa: '知識を蓄え続ける賢者',
    descriptionEn: 'A sage who keeps learning',
    category: 'future',
  },
  {
    id: 'unbroken-will',
    icon: '🔥',
    titleJa: '不撓不屈',
    titleEn: 'Unbroken Will',
    descriptionJa: '何度でも立ち上がる不屈の称号',
    descriptionEn: 'A title for relentless perseverance',
    category: 'future',
  },
];

export function resolveTitleDefinition(titleId: string | null | undefined): TitleDefinition {
  return TITLE_LIBRARY.find((title) => title.id === titleId) ?? TITLE_LIBRARY[0];
}

export function getTitleLabel(titleId: string | null | undefined, locale: 'ja' | 'en' = 'ja'): string {
  const definition = resolveTitleDefinition(titleId);
  return locale === 'ja' ? definition.titleJa : definition.titleEn;
}

export function getTitleDisplay(titleId: string | null | undefined, locale: 'ja' | 'en' = 'ja'): string {
  const definition = resolveTitleDefinition(titleId);
  return `${definition.icon}${getTitleLabel(titleId, locale)}`;
}

export function getUnlockedTitleDefinitions(unlockedTitleIds: string[] = []) {
  const unlocked = new Set(unlockedTitleIds);
  return TITLE_LIBRARY.filter((title) => unlocked.has(title.id));
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function isLocalSameDay(first: number, second: number) {
  const firstDate = new Date(first);
  const secondDate = new Date(second);
  return firstDate.getFullYear() === secondDate.getFullYear()
    && firstDate.getMonth() === secondDate.getMonth()
    && firstDate.getDate() === secondDate.getDate();
}

function isLocalNextDay(current: number, previous: number) {
  const expected = new Date(previous);
  expected.setDate(expected.getDate() + 1);
  return isLocalSameDay(current, expected.getTime());
}

function nextLevelThreshold(previousThreshold: number) {
  return Math.max(previousThreshold + 1, Math.ceil(previousThreshold * 1.2));
}

function normalizeDocument(data: Partial<UserProgressDocument> & Record<string, any> = {}): UserProgressDocument {
  const joinDate = toNumber(data.joinDate, DEFAULT_PROFILE.joinDate);
  const lastLoginDate = toNumber(data.lastLoginDate, joinDate || DEFAULT_PROFILE.lastLoginDate);
  const unlockedTitles = Array.isArray(data.unlockedTitles) && data.unlockedTitles.length > 0
    ? data.unlockedTitles
    : DEFAULT_PROFILE.unlockedTitles;
  const currentTitle = typeof data.currentTitle === 'string' && data.currentTitle.trim()
    ? data.currentTitle
    : DEFAULT_PROFILE.currentTitle;
  return {
    username: typeof data.username === 'string' && data.username.trim() ? data.username : DEFAULT_PROFILE.username,
    bio: typeof data.bio === 'string' ? data.bio : DEFAULT_PROFILE.bio,
    profileImage: typeof data.profileImage === 'string' ? data.profileImage : data.profileImage ?? null,
    currentTitle: unlockedTitles.includes(currentTitle) ? currentTitle : unlockedTitles[0],
    unlockedTitles,
    level: Math.max(1, Math.floor(toNumber(data.level, DEFAULT_PROFILE.level))),
    currentXP: Math.max(0, Math.floor(toNumber(data.currentXP, DEFAULT_PROFILE.currentXP))),
    nextLevelXP: Math.max(1, Math.floor(toNumber(data.nextLevelXP, DEFAULT_PROFILE.nextLevelXP))),
    totalCoins: Math.max(0, Math.floor(toNumber(data.totalCoins, DEFAULT_PROFILE.totalCoins))),
    totalBooks: Math.max(0, Math.floor(toNumber(data.totalBooks, DEFAULT_PROFILE.totalBooks))),
    totalQuestionsCreated: Math.max(0, Math.floor(toNumber(data.totalQuestionsCreated, DEFAULT_PROFILE.totalQuestionsCreated))),
    totalQuizzesPlayed: Math.max(0, Math.floor(toNumber(data.totalQuizzesPlayed, DEFAULT_PROFILE.totalQuizzesPlayed))),
    totalCorrectAnswers: Math.max(0, Math.floor(toNumber(data.totalCorrectAnswers, DEFAULT_PROFILE.totalCorrectAnswers))),
    totalQuestionsAnswered: Math.max(0, Math.floor(toNumber(data.totalQuestionsAnswered, DEFAULT_PROFILE.totalQuestionsAnswered))),
    correctRate: Math.max(0, Math.min(100, Math.floor(toNumber(data.correctRate, DEFAULT_PROFILE.correctRate)))),
    streakDays: Math.max(1, Math.floor(toNumber(data.streakDays, DEFAULT_PROFILE.streakDays))),
    joinDate,
    lastLoginDate,
    achievements: Array.isArray(data.achievements) ? data.achievements : DEFAULT_PROFILE.achievements,
  };
}

function applyLevelUps(document: UserProgressDocument): ProgressRewardResult {
  let leveledUp = 0;
  let levelUpCoins = 0;
  let level = document.level;
  let currentXP = document.currentXP;
  let nextLevelXP = document.nextLevelXP;
  let totalCoins = document.totalCoins;

  while (currentXP >= nextLevelXP) {
    currentXP -= nextLevelXP;
    level += 1;
    leveledUp += 1;
    levelUpCoins += 100;
    totalCoins += 100;
    nextLevelXP = nextLevelThreshold(nextLevelXP);
  }

  const nextDocument = normalizeDocument({
    ...document,
    level,
    currentXP,
    nextLevelXP,
    totalCoins,
    correctRate: document.totalQuestionsAnswered > 0
      ? Math.round((document.totalCorrectAnswers / document.totalQuestionsAnswered) * 100)
      : 0,
  });

  return {
    document: nextDocument,
    leveledUp,
    levelUpCoins,
  };
}

async function syncLocalStorage(document: UserProgressDocument) {
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.username, document.username],
    [STORAGE_KEYS.bio, document.bio],
    [STORAGE_KEYS.profileImage, document.profileImage || ''],
    [STORAGE_KEYS.currentTitle, document.currentTitle],
    [STORAGE_KEYS.unlockedTitles, JSON.stringify(document.unlockedTitles)],
    [STORAGE_KEYS.level, String(document.level)],
    [STORAGE_KEYS.xp, String(document.currentXP)],
    [STORAGE_KEYS.coins, String(document.totalCoins)],
    [STORAGE_KEYS.books, String(document.totalBooks)],
    [STORAGE_KEYS.streak, String(document.streakDays)],
    [STORAGE_KEYS.lastStudyDate, new Date(document.lastLoginDate).toDateString()],
    [STORAGE_KEYS.joinDate, String(document.joinDate)],
    [STORAGE_KEYS.lastLoginDate, String(document.lastLoginDate)],
  ]);
}

async function updateProgressDocument(
  userId: string,
  mutator: (current: UserProgressDocument) => UserProgressDocument
): Promise<ProgressRewardResult> {
  const ref = doc(db, 'users', userId);

  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = normalizeDocument(snapshot.exists() ? snapshot.data() : {});
    const mutated = normalizeDocument(mutator(current));
    const finalResult = applyLevelUps(mutated);

    transaction.set(ref, finalResult.document, { merge: true });
    return finalResult;
  });

  await syncLocalStorage(result.document);
  return result;
}

export function buildInitialUserProfile(username: string, profileImage: string | null, now = Date.now()) {
  return normalizeDocument({
    ...DEFAULT_PROFILE,
    username,
    profileImage,
    joinDate: now,
    lastLoginDate: now,
    streakDays: 1,
  });
}

export async function equipTitle(userId: string, titleId: string) {
  return updateProgressDocument(userId, (current) => {
    if (!current.unlockedTitles.includes(titleId)) {
      return current;
    }

    return {
      ...current,
      currentTitle: titleId,
    };
  });
}

export async function unlockTitle(userId: string, titleId: string) {
  return updateProgressDocument(userId, (current) => {
    if (current.unlockedTitles.includes(titleId)) {
      return current;
    }

    return {
      ...current,
      unlockedTitles: [...current.unlockedTitles, titleId],
    };
  });
}

export function subscribeUserProgress(userId: string, onChange: (document: UserProgressDocument) => void): Unsubscribe {
  const ref = doc(db, 'users', userId);
  return onSnapshot(ref, (snapshot) => {
    if (snapshot.exists()) {
      onChange(normalizeDocument(snapshot.data()));
    }
  });
}

export function normalizeUserProfileDocument(data: Partial<UserProgressDocument> & Record<string, any>) {
  return normalizeDocument(data);
}

export async function readUserProfileDocument(userId: string) {
  const { getDoc } = await import('firebase/firestore');
  const snapshot = await getDoc(doc(db, 'users', userId));
  if (!snapshot.exists()) return null;
  return normalizeDocument(snapshot.data());
}

export async function syncLoginStreak(userId: string, now = Date.now()) {
  return updateProgressDocument(userId, (current) => {
    const lastLoginDate = current.lastLoginDate || current.joinDate || now;
    let streakDays = current.streakDays || 1;

    if (isLocalSameDay(now, lastLoginDate)) {
      streakDays = current.streakDays || 1;
    } else if (isLocalNextDay(now, lastLoginDate)) {
      streakDays += 1;
    } else {
      streakDays = 1;
    }

    return {
      ...current,
      streakDays,
      lastLoginDate: now,
    };
  });
}

export async function awardQuestionCreation(userId: string) {
  return updateProgressDocument(userId, (current) => ({
    ...current,
    totalQuestionsCreated: current.totalQuestionsCreated + 1,
    currentXP: current.currentXP + 10,
    totalCoins: current.totalCoins + 5,
  }));
}

export async function recordQuizPlayed(userId: string) {
  return updateProgressDocument(userId, (current) => ({
    ...current,
    totalQuizzesPlayed: current.totalQuizzesPlayed + 1,
  }));
}

export async function recordCorrectAnswer(userId: string, amount: number = 1) {
  const delta = Math.max(0, Math.floor(amount));
  return updateProgressDocument(userId, (current) => {
    const totalCorrectAnswers = current.totalCorrectAnswers + delta;
    const totalQuestionsAnswered = current.totalQuestionsAnswered + delta;

    return {
      ...current,
      totalCorrectAnswers,
      totalQuestionsAnswered,
      correctRate: totalQuestionsAnswered > 0 ? Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 100) : 0,
      currentXP: current.currentXP + (delta * 20),
      totalCoins: current.totalCoins + (delta * 10),
    };
  });
}

export async function addBooks(userId: string, amount: number) {
  const delta = Math.max(0, Math.floor(amount));
  return updateProgressDocument(userId, (current) => ({
    ...current,
    totalBooks: current.totalBooks + delta,
  }));
}

export async function spendBooks(userId: string, amount: number) {
  const delta = Math.max(0, Math.floor(amount));
  return updateProgressDocument(userId, (current) => ({
    ...current,
    totalBooks: Math.max(0, current.totalBooks - delta),
  }));
}

export async function awardQuizCompletion(userId: string, input: QuizRewardInput) {
  const safeCorrectCount = Math.max(0, Math.floor(input.correctCount));
  const safeQuestionCount = Math.max(0, Math.floor(input.questionCount));
  const bonusXP = Math.max(0, Math.floor(input.bonusXP || 0));
  const bonusCoins = Math.max(0, Math.floor(input.bonusCoins || 0));

  return updateProgressDocument(userId, (current) => {
    const totalCorrectAnswers = current.totalCorrectAnswers + safeCorrectCount;
    const totalQuestionsAnswered = current.totalQuestionsAnswered + safeQuestionCount;

    return {
      ...current,
      totalQuizzesPlayed: current.totalQuizzesPlayed + 1,
      totalCorrectAnswers,
      totalQuestionsAnswered,
      currentXP: current.currentXP + (safeCorrectCount * 20) + bonusXP,
      totalCoins: current.totalCoins + (safeCorrectCount * 10) + bonusCoins,
      correctRate: totalQuestionsAnswered > 0 ? Math.round((totalCorrectAnswers / totalQuestionsAnswered) * 100) : 0,
    };
  });
}

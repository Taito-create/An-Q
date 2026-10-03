import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, runTransaction, Unsubscribe } from 'firebase/firestore';
import { db } from '../config/firebase';
import { STORAGE_KEYS } from '../../app/constants/storageKeys';

/**
 * Firestore に保存してよい profileImage の最大長。
 * Base64 画像 (data:URL) は数十万〜数MBになり、ドキュメント1MB制限を超えて
 * 400 Bad Request (トランザクション失敗) を引き起こすため保存しない。
 * 将来の Firebase Storage 運用に備え、http(s) URL のみ保存を許可する。
 */
const MAX_PROFILE_IMAGE_LENGTH = 10_000;

/**
 * プロフィール画像の保存方針（重要）
 * - 自分の端末での表示用は AsyncStorage (`user_profile_image`) に Base64 で保存する（即時反映・高速）
 * - 対戦相手に見せる用の URL は Cloudinary にアップロードし、Firestore の `profileImage` に保存する
 *   （Firebase Storage は Blaze プランが必要なため、Cloudinary の無料枠を利用する）
 * - Base64 のまま Firestore には書かない（1MB 制限超過＝400 Bad Request の原因）
 * - 読み込みは readLocalProfileImage()、保存は saveLocalProfileImage() を使う。
 */
export const LOCAL_PROFILE_IMAGE_KEY = STORAGE_KEYS.USER_PROFILE_IMAGE;

/**
 * Firestore 書き込み用に profileImage を検査する。
 * - Base64 (data:URL) / 上限超過 → 空文字列を返す (merge 書き込みで既存の巨大フィールドも縮小する)
 * - http(s) URL → そのまま返す
 */
export function sanitizeProfileImageForFirestore(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('data:')) return '';
  if (value.length > MAX_PROFILE_IMAGE_LENGTH) return '';
  return value;
}

/** http(s) URL 形式か（＝ Firestore 経由でも配信できる形式か） */
export function isRemoteProfileImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//.test(value);
}

/**
 * プロフィール画像を唯一の保存先 (AsyncStorage) から読み出す。
 * 未設定・空文字は null に正規化する（'' を View の子に渡すと
 * react-native-web が "Unexpected text node" 警告を出すため null に統一する）。
 * ストレージが利用できない環境（プライベートモード等）でも呼び出し側を壊さないよう、
 * 失敗時は警告のみで null を返す。
 */
export async function readLocalProfileImage(): Promise<string | null> {
  try {
    const value = await AsyncStorage.getItem(LOCAL_PROFILE_IMAGE_KEY);
    return value && value.trim() ? value : null;
  } catch (e) {
    console.warn('readLocalProfileImage failed:', e);
    return null;
  }
}

/** プロフィール画像を AsyncStorage に保存する（null / 空文字は削除扱い） */
export async function saveLocalProfileImage(value: string | null | undefined): Promise<void> {
  await AsyncStorage.setItem(LOCAL_PROFILE_IMAGE_KEY, value && value.trim() ? value : '');
}

/**
 * Cloudinary の設定値（環境変数）を取得する。
 *
 * ※ `import.meta.env` は Jest (CommonJS 変換) で構文エラーになるため、
 *   vite.config.ts の `define` で文字列定数へ置換したグローバルを直接参照する。
 *   （`globalThis.__X__` のような間接アクセスでは define が置換できないため、
 *     必ず素の識別子 `__VITE_CLOUDINARY_CLOUD_NAME__` として書く必要がある）
 *   → 本番では .env の値が埋め込まれ、テストでは同名のグローバルを差し替えられる。
 */
function getViteEnv(): Record<string, string | undefined> {
  // ブラウザでは define 済み定数が埋め込まれる。
  // Jest など define が効かない環境では識別子が未定義になるため typeof で守る。
  const definedCloudName = typeof __VITE_CLOUDINARY_CLOUD_NAME__ !== 'undefined' ? __VITE_CLOUDINARY_CLOUD_NAME__ : undefined;
  const definedUploadPreset = typeof __VITE_CLOUDINARY_UPLOAD_PRESET__ !== 'undefined' ? __VITE_CLOUDINARY_UPLOAD_PRESET__ : undefined;

  // テストからは globalThis 経由で上書きできるようにする
  const fromGlobal = globalThis as unknown as Record<string, string | undefined>;
  return {
    VITE_CLOUDINARY_CLOUD_NAME: fromGlobal.__VITE_CLOUDINARY_CLOUD_NAME__ ?? definedCloudName,
    VITE_CLOUDINARY_UPLOAD_PRESET: fromGlobal.__VITE_CLOUDINARY_UPLOAD_PRESET__ ?? definedUploadPreset,
  };
}

/**
 * Cloudinary の設定値を取得する。
 * 未設定（.env がない／空文字）の場合は null を返し、呼び出し側で
 * 「アップロードできない」ことを判断できるようにする。
 */
function getCloudinaryConfig(): { cloudName: string; uploadPreset: string } | null {
  const env = getViteEnv();
  const cloudName = env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
  const uploadPreset = env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim();
  if (!cloudName || !uploadPreset) return null;
  return { cloudName, uploadPreset };
}

/** Cloudinary の設定が揃っているか（UI の警告表示などに使う） */
export function isCloudinaryConfigured(): boolean {
  return getCloudinaryConfig() !== null;
}

/**
 * Base64 画像を Cloudinary にアップロードし、ダウンロード URL を返す。
 * Firebase Storage は Blaze プランが必要なため、Cloudinary の無料枠（25GB）を使う。
 * @param base64Image data:image/jpeg;base64,... 形式の文字列
 * @returns ダウンロードURL（失敗時は null）
 */
export async function uploadProfileImageToCloudinary(base64Image: string): Promise<string | null> {
  const config = getCloudinaryConfig();
  if (!config) {
    console.warn('Cloudinary env vars are missing');
    return null;
  }

  // 既に URL の場合は再アップロード不要（そのまま使う）
  if (isRemoteProfileImageUrl(base64Image)) return base64Image;

  try {
    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('upload_preset', config.uploadPreset);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);

    const data = await res.json();
    return data.secure_url ?? null;
  } catch (e) {
    console.error('uploadProfileImageToCloudinary failed:', e);
    return null;
  }
}

/**
 * 任意の画像を Cloudinary にアップロードし、ダウンロードURLを返す。
 * プロフィール画像以外の用途（問題の画像など）でも使える汎用版。
 *
 * ※ Firestore の1MB制限を避けるため、問題画像も Base64 ではなくURLで保存する。
 * ※ リサイズ用パラメータ（w=, h=）は付けない。
 *    imageAnnotations（座標）が元の画像サイズを前提にしているため、
 *    配信時にリサイズすると注釈の位置がズレる。
 *
 * @param base64Image data:image/jpeg;base64,... 形式、または既存の http(s) URL
 * @returns ダウンロードURL（失敗時は null）
 */
export async function uploadImageToCloudinary(base64Image: string): Promise<string | null> {
  // 既に URL ならそのまま返す（再アップロード不要）
  if (isRemoteProfileImageUrl(base64Image)) return base64Image;

  const config = getCloudinaryConfig();
  if (!config) {
    console.warn('Cloudinary env vars are missing; keeping original image');
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('file', base64Image);
    formData.append('upload_preset', config.uploadPreset);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!res.ok) throw new Error(`Cloudinary upload failed: ${res.status}`);

    const data = await res.json();
    return data.secure_url ?? null;
  } catch (e) {
    console.error('uploadImageToCloudinary failed:', e);
    return null;
  }
}

export interface TitleDefinition {
  id: string;
  icon: string;
  titleJa: string;
  titleEn: string;
  descriptionJa: string;
  descriptionEn: string;
  category: 'starter' | 'mission' | 'event' | 'future';
}

export interface BattleStats {
  totalBattles: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface UserProgressDocument {
  username: string;
  bio: string;
  profileImage: string | null;
  currentTitle: string;
  equippedTitle?: string;
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
  /** 対戦戦績 (旧ドキュメントでは未定義 → 0 扱い) */
  battleStats?: BattleStats;
}

export interface ProgressRewardResult {
  document: UserProgressDocument;
  leveledUp: number;
  levelUpCoins: number;
  newLevel?: number;
  currentXP?: number;
  nextLevelXP?: number;
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
  battleStats: { totalBattles: 0, wins: 0, losses: 0, draws: 0 },
};

export const TITLE_LIBRARY: TitleDefinition[] = [
  {
    id: 'apprentice',
    icon: '',
    titleJa: '見習い暗記人',
    titleEn: 'Apprentice Mnemonic',
    descriptionJa: '最初に装備される基本称号です',
    descriptionEn: 'The default starter title',
    category: 'starter',
  },
  {
    id: 'memory-monk',
    icon: '',
    titleJa: '暗記行者',
    titleEn: 'Memory Monk',
    descriptionJa: '覚えることを修行に変える者',
    descriptionEn: 'Turns memorization into a discipline',
    category: 'starter',
  },
  {
    id: 'warm-old-new',
    icon: '',
    titleJa: '温故知新',
    titleEn: 'Warm Old, New Know',
    descriptionJa: '古きを温ねて新しきを知る称号',
    descriptionEn: 'Learn the new by revisiting the old',
    category: 'future',
  },
  {
    id: 'time-is-money',
    icon: '',
    titleJa: '時は金なり',
    titleEn: 'Time is Money',
    descriptionJa: '時間を制する学び手の称号',
    descriptionEn: 'For learners who value every minute',
    category: 'future',
  },
  {
    id: 'sage-of-study',
    icon: '',
    titleJa: '学びの仙人',
    titleEn: 'Sage of Study',
    descriptionJa: '知識を蓄え続ける賢者',
    descriptionEn: 'A sage who keeps learning',
    category: 'future',
  },
  {
    id: 'unbroken-will',
    icon: '',
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
    battleStats: normalizeBattleStats(data.battleStats),
  };
}

function normalizeBattleStats(value: unknown): BattleStats {
  const fallback: BattleStats = { totalBattles: 0, wins: 0, losses: 0, draws: 0 };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const v = value as Record<string, unknown>;
  return {
    totalBattles: Math.max(0, Math.floor(toNumber(v.totalBattles, 0))),
    wins: Math.max(0, Math.floor(toNumber(v.wins, 0))),
    losses: Math.max(0, Math.floor(toNumber(v.losses, 0))),
    draws: Math.max(0, Math.floor(toNumber(v.draws, 0))),
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
  // user_profile_cache を更新して、Home画面の loadUserProgress が
  // 最新の currentXP / nextLevelXP を即時読み込めるようにする
  // ※ 画像は profileImage キーごと除外する。
  //    旧実装は profileImage: null で埋めており、その値を
  //    updateProgressDocument / readLocalProgress が基点にすると
  //    Firestore の Cloudinary URL を null で上書きしてしまうため。
  //    画像はローカルの専用キー (user_profile_image) にのみ保存する。
  const { profileImage: _cachedImage, ...cacheDocument } = document;
  const profileCache = JSON.stringify(cacheDocument);

  const entries: [string, string][] = [
    [STORAGE_KEYS.USER_USERNAME, document.username],
    [STORAGE_KEYS.USER_BIO, document.bio],
    [STORAGE_KEYS.USER_CURRENT_TITLE, document.currentTitle],
    [STORAGE_KEYS.USER_UNLOCKED_TITLES, JSON.stringify(document.unlockedTitles)],
    [STORAGE_KEYS.USER_LEVEL, String(document.level)],
    [STORAGE_KEYS.USER_XP, String(document.currentXP)],
    [STORAGE_KEYS.USER_COINS, String(document.totalCoins)],
    [STORAGE_KEYS.USER_BOOKS, String(document.totalBooks)],
    [STORAGE_KEYS.STREAK_COUNT, String(document.streakDays)],
    [STORAGE_KEYS.LAST_STUDY_DATE, new Date(document.lastLoginDate).toDateString()],
    [STORAGE_KEYS.JOIN_DATE, String(document.joinDate)],
    [STORAGE_KEYS.LAST_LOGIN_DATE, String(document.lastLoginDate)],
    ['user_profile_cache', profileCache],
  ];

  // プロフィール画像は AsyncStorage が唯一の保存先。
  // Firestore 側には画像を保存しないため document.profileImage は通常 '' であり、
  // そのまま書き戻すとローカルに保存した画像が消えてしまう。
  // そのため「ローカルが空 かつ Firestore 側に http(s) URL が残っている」場合のみ補完する。
  try {
    const localImage = await AsyncStorage.getItem(LOCAL_PROFILE_IMAGE_KEY);
    if (!localImage && isRemoteProfileImageUrl(document.profileImage)) {
      entries.push([LOCAL_PROFILE_IMAGE_KEY, document.profileImage]);
    }
  } catch (e) {
    console.warn('syncLocalStorage: failed to inspect local profile image:', e);
  }

  await AsyncStorage.multiSet(entries);
}

/**
 * Firestore の transaction.set に渡す前に、無効な値を除去する。
 * - undefined → フィールドごと削除（Firestore は undefined を拒否する）
 * - NaN / Infinity → 0 に置換（Firestore は有限数のみ受け付ける）
 * - ネストしたオブジェクト（battleStats など）にも再帰的に適用
 * - 配列内の undefined / NaN / Infinity も除去
 */
function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined || value === null) return value;
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as T;
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => sanitizeForFirestore(v))
      .filter((v) => v !== undefined) as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      result[k] = sanitizeForFirestore(v);
    }
    return result as T;
  }
  return value;
}

async function updateProgressDocument(
  userId: string,
  mutator: (current: UserProgressDocument) => UserProgressDocument
): Promise<ProgressRewardResult> {
  const ref = doc(db, 'userProgress', userId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = normalizeDocument(snapshot.exists() ? snapshot.data() : {});
      const mutated = normalizeDocument(mutator(current));
      const finalResult = applyLevelUps(mutated);

      // 【重要】profileImage は Firestore 側で絶対に上書きしない
      // 画像の URL は app/profile.tsx の saveProfile が Cloudinary へアップロードして
      // setDoc で書き込むもの。ここで transaction.set すると、
      // ローカルキャッシュ由来の null / '' で Cloudinary URL を消してしまう。
      // 他のフィールド（XP・コイン・戦績など）は通常どおり更新する。
      const { profileImage: _preservedProfileImage, ...payloadWithoutImage } = finalResult.document;
      const sanitizedPayload = sanitizeForFirestore(payloadWithoutImage);
      console.log('updateProgressDocument payload:', sanitizedPayload);
      transaction.set(ref, sanitizedPayload, { merge: true });
      return finalResult;
    });

    await syncLocalStorage(result.document);
    return result;
  } catch (error: any) {
    console.error(' updateProgressDocument failed:', error);
    console.error('Error code:', error.code);

    // permission-denied エラー時はローカルデータで処理
    if (error.code === 'permission-denied') {
      console.warn(' Firestore permission denied, using local data');
      const localData = await readLocalProgress();
      const current = normalizeDocument(localData);
      const mutated = normalizeDocument(mutator(current));
      const finalResult = applyLevelUps(mutated);
      await syncLocalStorage(finalResult.document);
      return finalResult;
    }

    // invalid-argument / 400 エラー時: 既存の巨大 profileImage が原因の可能性
    // → profileImage を空文字で上書きして再試行する（1回だけ）
    if (error.code === 'invalid-argument' || error.message?.includes('400')) {
      console.warn(' Retrying after clearing profileImage (size limit workaround)');
      try {
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref);
          const current = normalizeDocument(snapshot.exists() ? snapshot.data() : {});
          const mutated = normalizeDocument(mutator(current));
          const finalResult = applyLevelUps(mutated);
          const { profileImage: _skip, ...payload } = finalResult.document;
          const sanitized = sanitizeForFirestore({ ...payload, profileImage: '' });
          transaction.set(ref, sanitized, { merge: true });
        });
        // 再試行成功時は、ローカルデータで結果を返す
        const localData = await readLocalProgress();
        const current = normalizeDocument(localData);
        const mutated = normalizeDocument(mutator(current));
        const finalResult = applyLevelUps(mutated);
        await syncLocalStorage(finalResult.document);
        return finalResult;
      } catch (retryError) {
        console.error(' Retry also failed:', retryError);
        throw retryError;
      }
    }

    throw error;
  }
}

async function readLocalProgress(): Promise<Partial<UserProgressDocument> & Record<string, any>> {
  try {
    const [
      username, bio, profileImage, currentTitle, unlockedTitles,
      level, xp, coins, books, streak, lastStudyDate, joinDate, lastLoginDate
    ] = await AsyncStorage.multiGet([
      STORAGE_KEYS.USER_USERNAME,
      STORAGE_KEYS.USER_BIO,
      STORAGE_KEYS.USER_PROFILE_IMAGE,
      STORAGE_KEYS.USER_CURRENT_TITLE,
      STORAGE_KEYS.USER_UNLOCKED_TITLES,
      STORAGE_KEYS.USER_LEVEL,
      STORAGE_KEYS.USER_XP,
      STORAGE_KEYS.USER_COINS,
      STORAGE_KEYS.USER_BOOKS,
      STORAGE_KEYS.STREAK_COUNT,
      STORAGE_KEYS.LAST_STUDY_DATE,
      STORAGE_KEYS.JOIN_DATE,
      STORAGE_KEYS.LAST_LOGIN_DATE,
    ]);

    return {
      username: username?.[1] || undefined,
      bio: bio?.[1] || undefined,
      profileImage: profileImage?.[1] || null,
      currentTitle: currentTitle?.[1] || undefined,
      unlockedTitles: unlockedTitles?.[1] ? JSON.parse(unlockedTitles[1]) : undefined,
      level: level?.[1] ? Number(level[1]) : undefined,
      currentXP: xp?.[1] ? Number(xp[1]) : undefined,
      totalCoins: coins?.[1] ? Number(coins[1]) : undefined,
      totalBooks: books?.[1] ? Number(books[1]) : undefined,
      streakDays: streak?.[1] ? Number(streak[1]) : undefined,
      joinDate: joinDate?.[1] ? Number(joinDate[1]) : undefined,
      lastLoginDate: lastLoginDate?.[1] ? Number(lastLoginDate[1]) : undefined,
    };
  } catch (e) {
    console.error('Failed to read local progress:', e);
    return {};
  }
}

export function buildInitialUserProfile(username: string, profileImage: string | null, now = Date.now()) {
  return normalizeDocument({
    ...DEFAULT_PROFILE,
    username,
    // 画像は AsyncStorage が唯一の保存先のため Firestore には保存しない。
    // 念のため Base64 (data:URL) / 上限超過は null へ縮小しておく（安全網）
    profileImage: sanitizeProfileImageForFirestore(profileImage),
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
  const ref = doc(db, 'userProgress', userId);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (snapshot.exists()) {
        onChange(normalizeDocument(snapshot.data()));
      }
    },
    (error: any) => {
      console.error(' subscribeUserProgress error:', error);
      console.error('Error code:', error.code);
      // permission-denied エラー時はローカルデータで初期化
      if (error.code === 'permission-denied') {
        console.warn(' Firestore permission denied, using local data');
        readLocalProgress().then((localData) => {
          onChange(normalizeDocument(localData));
        });
      }
    }
  );
}

export function normalizeUserProfileDocument(data: Partial<UserProgressDocument> & Record<string, any>) {
  return normalizeDocument(data);
}

export async function readUserProfileDocument(userId: string) {
  try {
    const { getDoc } = await import('firebase/firestore');
    const snapshot = await getDoc(doc(db, 'userProgress', userId));
    if (!snapshot.exists()) return null;
    return normalizeDocument(snapshot.data());
  } catch (error: any) {
    console.error(' readUserProfileDocument failed:', error);
    console.error('Error code:', error.code);

    // permission-denied エラー時はローカルデータで初期化
    if (error.code === 'permission-denied') {
      console.warn(' Firestore permission denied, using local data');
      const localData = await readLocalProgress();
      return normalizeDocument(localData);
    }

    throw error;
  }
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

/**
 * 一括問題作成時の報酬をまとめて付与する（/create/bulk 用）。
 * awardQuestionCreation は 1 問固定のため、N 問ぶんの XP・コイン・作成数を
 * 1 回のトランザクションでまとめて加算する（通信回数を増やさない）。
 */
export async function awardQuestionCreationBulk(userId: string, count: number) {
  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) {
    // 0 問のときは updateProgressDocument を呼ばない（不要な通信・ログを避ける）
    return readLocalProgress();
  }
  return updateProgressDocument(userId, (current) => ({
    ...current,
    totalQuestionsCreated: current.totalQuestionsCreated + safeCount,
    currentXP: current.currentXP + 10 * safeCount,
    totalCoins: current.totalCoins + 5 * safeCount,
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

/**
 * 対戦戦績を取得する (旧ドキュメントで未定義の場合は 0 埋めの戦績を返す)
 */
export function getBattleStats(profile: UserProgressDocument | null | undefined): BattleStats {
  return normalizeBattleStats(profile?.battleStats);
}

/**
 * 対戦結果を userProgress/{uid} の battleStats に加算する。
 * - totalBattles を +1 し、outcome に応じて wins / losses / draws を +1
 * - runTransaction で原子的に更新するため、同時更新でも整合する
 * - 重複加算の防止は呼び出し側 (sessionStorage の battle_reward_* キー) で行う
 * @returns 更新後の戦績 (取得/更新に失敗した場合は null)
 */
export async function recordBattleResult(
  userId: string,
  outcome: 'win' | 'lose' | 'draw'
): Promise<BattleStats | null> {
  const ref = doc(db, 'userProgress', userId);
  try {
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = normalizeDocument(snapshot.exists() ? snapshot.data() : {});
      const base = normalizeBattleStats(current.battleStats);
      const next: BattleStats = {
        totalBattles: base.totalBattles + 1,
        wins: base.wins + (outcome === 'win' ? 1 : 0),
        losses: base.losses + (outcome === 'lose' ? 1 : 0),
        draws: base.draws + (outcome === 'draw' ? 1 : 0),
      };
      transaction.set(ref, sanitizeForFirestore({ battleStats: next }), { merge: true });
      return next;
    });
  } catch (error: any) {
    console.error(' recordBattleResult failed:', error);
    return null;
  }
}

/**
 * XPを加算する（問題作成時など+10 XP用の軽量関数）
 * Firestore とローカルストレージ（AsyncStorage）の両方を更新し、レベルアップを適用する。
 * @returns レベルアップしたレベル数と新しいXP情報を含むProgressRewardResult
 */
export async function incrementXP(userId: string, amount: number): Promise<ProgressRewardResult> {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (safeAmount === 0) {
    const doc = await readUserProfileDocument(userId);
    return { document: doc || ({} as any), leveledUp: 0, levelUpCoins: 0, newLevel: doc?.level || 1, currentXP: doc?.currentXP || 0, nextLevelXP: doc?.nextLevelXP || 100 };
  }
  return updateProgressDocument(userId, (current) => ({
    ...current,
    currentXP: current.currentXP + safeAmount,
  }));
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/storageKeys';

/**
 * 安全なJSONパースユーティリティ
 * 
 * このプロジェクトでは、保存データの JSON.parse を各画面で直接呼ばず、
 * 必ずこのファイルの safeParse / safeParseArray / safeParseObject / safeParseWithError
 * のいずれかを経由してください。
 */

/**
 * 安全なJSONパースを行うユーティリティ
 *
 * JSON.parse() を安全に実行し、
 * パース失敗時はフォールバック値を返す。
 *
 * @param json パース対象のJSON文字列
 * @param fallback パース失敗時に返すフォールバック値
 * @returns パース結果またはフォールバック値
 */
export const safeParse = <T>(json: string | null | undefined, fallback: T): T => {
  if (!json) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(json);
    return parsed as T;
  } catch (error) {
    return fallback;
  }
};

/**
 * 安全なJSONパース（配列用）
 *
 * パース結果が配列であることを確認し、
 * 配列でない場合はフォールバックを返す。
 *
 * @param json パース対象のJSON文字列
 * @param fallback パース失敗時に返すフォールバック配列
 * @returns 配列またはフォールバック
 */
export const safeParseArray = <T>(json: string | null | undefined, fallback: T[]): T[] => {
  const parsed = safeParse<unknown>(json, null);

  if (Array.isArray(parsed)) {
    return parsed as T[];
  }

  return fallback;
};

/**
 * 安全なJSONパース（オブジェクト用）
 *
 * パース結果がオブジェクトであることを確認し、
 * オブジェクトでない場合はフォールバックを返す。
 * 保存データに新しいフィールドが無い場合も、
 * fallbackの値で自動的に補完する。
 *
 * @param json パース対象のJSON文字列
 * @param fallback パース失敗時に返すフォールバックオブジェクト
 * @returns オブジェクト（fallbackとparsedのマージ結果）またはフォールバック
 */
export const safeParseObject = <T extends object>(
  json: string | null | undefined,
  fallback: T
): T => {
  const parsed = safeParse<unknown>(json, null);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...fallback, ...parsed } as T;
  }

  return fallback;
};

/**
 * 安全なJSONパース（エラー情報付き）
 *
 * JSON.parse() を安全に実行し、
 * パース失敗時はエラー情報を返す。
 *
 * @param json パース対象のJSON文字列
 * @param fallback パース失敗時に返すフォールバック値
 * @returns パース結果とエラー情報
 */
export const safeParseWithError = <T>(
  json: string | null | undefined,
  fallback: T
): { data: T; error?: { message: string; originalError?: Error } } => {
  if (!json) {
    return { data: fallback };
  }

  try {
    const parsed = JSON.parse(json);
    return { data: parsed as T };
  } catch (error) {
    return {
      data: fallback,
      error: {
        message: 'JSON parse failed',
        originalError: error as Error
      }
    };
  }
};

// ──────────────────────────────────────────────
// タグのマスターリスト
// ──────────────────────────────────────────────

/**
 * タグのマスターリストを読み込む
 */
export const loadTagMasterList = async (): Promise<string[]> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.TAG_MASTER_LIST);
  return safeParseArray<string>(raw, []);
};

/**
 * タグのマスターリストを保存する（重複は自動的に除去）
 */
export const saveTagMasterList = async (tags: string[]): Promise<void> => {
  const deduped = Array.from(new Set(tags.map(t => t.trim()).filter(t => t.length > 0)));
  await AsyncStorage.setItem(STORAGE_KEYS.TAG_MASTER_LIST, JSON.stringify(deduped));
};

/**
 * タグをマスターリストに1つ追加する（既に存在する場合は何もしない）
 * @returns 追加できた場合は true、既に存在していた場合は false
 */
export const addTagToMasterList = async (tag: string): Promise<boolean> => {
  const trimmed = tag.trim();
  if (!trimmed) return false;

  const current = await loadTagMasterList();
  if (current.includes(trimmed)) {
    return false;
  }
  await saveTagMasterList([...current, trimmed]);
  return true;
};

/**
 * タグをマスターリストから1つ削除する
 */
export const removeTagFromMasterList = async (tag: string): Promise<void> => {
  const current = await loadTagMasterList();
  await saveTagMasterList(current.filter(t => t !== tag));
};
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MIGRATION_TARGETS } from './schema';

const BACKUP_PREFIX = 'backup_';
const BACKUP_LIST_KEY = 'backup_list';

/**
 * バックアップオブジェクト
 */
interface Backup {
  timestamp: number;
  version: number;
  data: Record<string, string>;
}

/**
 * バックアップメタデータ
 */
interface BackupMetadata {
  key: string;
  timestamp: number;
  size: number;
}

/**
 * バックアップを作成
 * @param version 現在のスキーマバージョン
 * @returns バックアップキー
 */
export const createBackup = async (version: number): Promise<string> => {
  try {
    const timestamp = Date.now();
    const backupKey = `${BACKUP_PREFIX}${timestamp}`;

    // 対象のデータをすべて取得
    const backupData: Record<string, string> = {};
    for (const key of MIGRATION_TARGETS) {
      const value = await AsyncStorage.getItem(key);
      if (value) {
        backupData[key] = value;
      }
    }

    // バックアップオブジェクトを作成して保存
    const backup: Backup = {
      timestamp,
      version,
      data: backupData,
    };

    await AsyncStorage.setItem(backupKey, JSON.stringify(backup));

    // バックアップリストに追加
    const backupList = await getBackupMetadataList();
    backupList.push({
      key: backupKey,
      timestamp,
      size: JSON.stringify(backup).length,
    });
    await AsyncStorage.setItem(BACKUP_LIST_KEY, JSON.stringify(backupList));

    console.log(`[Migration] Backup created: ${backupKey}`);
    return backupKey;
  } catch (error) {
    console.error('[Migration] Failed to create backup:', error);
    throw error;
  }
};

/**
 * バックアップから復元
 * @param backupKey バックアップキー
 * @returns 復元成功の可否
 */
export const restoreFromBackup = async (backupKey: string): Promise<boolean> => {
  try {
    const backupJson = await AsyncStorage.getItem(backupKey);
    if (!backupJson) {
      console.warn(`[Migration] Backup not found: ${backupKey}`);
      return false;
    }

    const backup: Backup = JSON.parse(backupJson);

    // バックアップデータをすべて復元
    for (const [key, value] of Object.entries(backup.data)) {
      await AsyncStorage.setItem(key, value);
    }

    console.log(`[Migration] Restored from backup: ${backupKey} (version ${backup.version})`);
    return true;
  } catch (error) {
    console.error('[Migration] Failed to restore from backup:', error);
    return false;
  }
};

/**
 * バックアップメタデータリストを取得
 */
export const getBackupMetadataList = async (): Promise<BackupMetadata[]> => {
  try {
    const listJson = await AsyncStorage.getItem(BACKUP_LIST_KEY);
    return listJson ? JSON.parse(listJson) : [];
  } catch (error) {
    console.error('[Migration] Failed to get backup list:', error);
    return [];
  }
};

/**
 * バックアップ一覧を取得
 * @returns バックアップキー配列
 */
export const getBackupList = async (): Promise<string[]> => {
  const metadataList = await getBackupMetadataList();
  return metadataList.map(m => m.key);
};

/**
 * 古いバックアップを削除
 * @param keepCount 保持するバックアップ数
 */
export const cleanupOldBackups = async (keepCount: number = 5): Promise<void> => {
  try {
    const metadataList = await getBackupMetadataList();

    if (metadataList.length <= keepCount) {
      return;
    }

    // タイムスタンプでソートして古いものから削除
    const sorted = [...metadataList].sort((a, b) => b.timestamp - a.timestamp);
    const toDelete = sorted.slice(keepCount);

    for (const backup of toDelete) {
      await AsyncStorage.removeItem(backup.key);
      console.log(`[Migration] Deleted old backup: ${backup.key}`);
    }

    // メタデータリストを更新
    const remainingMetadata = sorted.slice(0, keepCount);
    await AsyncStorage.setItem(BACKUP_LIST_KEY, JSON.stringify(remainingMetadata));

    console.log(`[Migration] Cleanup completed: kept ${keepCount} backups, deleted ${toDelete.length}`);
  } catch (error) {
    console.error('[Migration] Failed to cleanup backups:', error);
  }
};

/**
 * バックアップを削除
 * @param backupKey バックアップキー
 */
export const deleteBackup = async (backupKey: string): Promise<void> => {
  try {
    await AsyncStorage.removeItem(backupKey);

    const metadataList = await getBackupMetadataList();
    const filtered = metadataList.filter(m => m.key !== backupKey);
    await AsyncStorage.setItem(BACKUP_LIST_KEY, JSON.stringify(filtered));

    console.log(`[Migration] Deleted backup: ${backupKey}`);
  } catch (error) {
    console.error('[Migration] Failed to delete backup:', error);
  }
};

/**
 * 最新のバックアップを取得
 */
export const getLatestBackup = async (): Promise<string | null> => {
  const backupList = await getBackupList();
  return backupList.length > 0 ? backupList[0] : null;
};
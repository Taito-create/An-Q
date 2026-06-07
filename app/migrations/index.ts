import AsyncStorage from '@react-native-async-storage/async-storage';
import { MIGRATION_KEY, CURRENT_VERSION } from './schema';
import { createBackup, restoreFromBackup } from './backup';
import { handleFatalError } from '../utils/errorHandler';
import migration001 from './migrations/001_initial';
import migration002 from './migrations/002_annotations';

/**
 * MigrationUnit インターフェース
 * 各マイグレーションファイルが実装すべき構造
 */
export interface MigrationUnit {
  version: number;
  up(storage: typeof AsyncStorage): Promise<void>;
}

/**
 * 登録済みマイグレーション一覧（バージョン昇順）
 * Requirements: 8.1, 8.2, 8.3
 */
const MIGRATIONS: MigrationUnit[] = [migration001, migration002];

/**
 * マイグレーションを実行する
 *
 * 処理フロー:
 * 1. AsyncStorage から現在のバージョンを取得（null は 0 扱い）
 * 2. currentVersion === CURRENT_VERSION なら即返却（冪等性保証）
 * 3. バックアップを作成し backupKey を保持
 * 4. version > currentVersion の MigrationUnit を昇順に実行
 * 5. 完了後 db_version を CURRENT_VERSION に更新
 * 6. エラー発生時: restoreFromBackup → handleFatalError
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3
 */
export const runMigrations = async (): Promise<void> => {
  // 1. 現在バージョンを取得（null は 0 扱い）
  let currentVersion: number;
  try {
    const stored = await AsyncStorage.getItem(MIGRATION_KEY);
    currentVersion = stored !== null ? parseInt(stored, 10) : 0;
  } catch {
    // db_version 読み取り失敗時はバージョン 0 として全マイグレーションを実行
    currentVersion = 0;
  }

  // 2. 最新バージョンなら何もしない
  if (currentVersion === CURRENT_VERSION) {
    return;
  }

  // 3. バックアップを作成（Requirement 4.4: 失敗時はマイグレーションを中断）
  let backupKey: string;
  try {
    backupKey = await createBackup(currentVersion);
  } catch (backupError) {
    handleFatalError(backupError);
    return;
  }

  // 4. 未適用マイグレーションを昇順に実行
  const pending = MIGRATIONS.filter(m => m.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );

  try {
    for (const migration of pending) {
      await migration.up(AsyncStorage);
    }

    // 5. 完了後バージョンを更新
    await AsyncStorage.setItem(MIGRATION_KEY, String(CURRENT_VERSION));
  } catch (error) {
    // 6. エラー発生時: 復元を試みた後、成否に関わらず handleFatalError を呼ぶ
    try {
      await restoreFromBackup(backupKey);
    } catch {
      // 復元失敗も無視して handleFatalError へ進む
    }
    handleFatalError(error);
  }
};

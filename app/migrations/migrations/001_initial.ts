import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * MigrationUnit インターフェース
 * 各マイグレーションファイルが実装すべき構造
 */
interface MigrationUnit {
  version: number;
  up(storage: typeof AsyncStorage): Promise<void>;
}

/**
 * MigrationUnit v1: 初期スキーマ
 *
 * - `quiz_questions` キーが存在しない場合のみ空配列を書き込む
 * - 既存データは変更しない
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
const migration001: MigrationUnit = {
  version: 1,
  async up(storage) {
    const existing = await storage.getItem('quiz_questions');
    if (existing === null) {
      await storage.setItem('quiz_questions', JSON.stringify([]));
    }
  },
};

export default migration001;

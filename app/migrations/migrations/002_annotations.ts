import AsyncStorage from '@react-native-async-storage/async-storage';
import { Question } from '../../types/question';

/**
 * MigrationUnit インターフェース
 * 各マイグレーションファイルはこのインターフェースに準拠したオブジェクトをデフォルトエクスポートする
 */
interface MigrationUnit {
  version: number;
  up(storage: typeof AsyncStorage): Promise<void>;
}

/**
 * マイグレーション前の古いデータ形式に対応するための拡張型
 * createdAt が string の場合も許容する
 */
type QuestionV1 = Omit<Question, 'createdAt'> & {
  createdAt?: string | number;
};

/**
 * MigrationUnit v2: アノテーションフィールド追加
 *
 * - imageAnnotations（デフォルト []）を追加
 * - isShared（デフォルト false）を追加
 * - createdAt が string 型の場合、Unix タイムスタンプ（number）に変換
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
const migration002: MigrationUnit = {
  version: 2,
  async up(storage) {
    const raw = await storage.getItem('quiz_questions');
    if (!raw) return;

    const questions: QuestionV1[] = JSON.parse(raw);
    const updated = questions.map(q => ({
      ...q,
      imageAnnotations: q.imageAnnotations ?? [],
      isShared: q.isShared ?? false,
      createdAt: typeof q.createdAt === 'string'
        ? new Date(q.createdAt).getTime()
        : q.createdAt,
    }));

    await storage.setItem('quiz_questions', JSON.stringify(updated));
  },
};

export default migration002;

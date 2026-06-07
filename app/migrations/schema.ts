/**
 * データベースマイグレーション管理
 * スキーマバージョン管理とキー定義
 */

export const MIGRATION_KEY = 'db_version';
export const CURRENT_VERSION = 2;

/**
 * 各バージョンで追加されたフィールドの説明
 */
export const MIGRATION_CHANGELOG = {
  1: '初期スキーマ: 基本的なQuestion構造（question, answerType, descriptiveAnswer, trueFalseAnswer, multipleChoice）',
  2: 'imageAnnotations（画像注釈）と isShared（共有フラグ）フィールドを追加',
} as const;

/**
 * マイグレーション対象のストレージキー一覧
 */
export const MIGRATION_TARGETS = [
  'quiz_questions',
  'question_folders',
  'inbox_items',
  'quiz_stats',
] as const;
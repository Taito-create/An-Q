# Requirements Document

## Introduction

An-Q（React Native + TypeScript クイズアプリ）に AsyncStorage のデータマイグレーションシステムを実装する。
アプリ起動時に自動的にスキーマバージョンを確認し、必要に応じてマイグレーションを順次実行する。
マイグレーション前には自動バックアップを作成し、エラー発生時はバックアップから自動復元する。
バージョン管理により同一マイグレーションの二重実行を防ぎ、将来のスキーマ変更にも対応できる拡張可能な構造とする。

## Glossary

- **MigrationSystem**: AsyncStorage のスキーマバージョン管理とデータ変換を担うシステム全体
- **MigrationRunner**: マイグレーションの実行順序制御・バージョン管理・エラー時ロールバックを担うモジュール（`app/migrations/index.ts`）
- **MigrationUnit**: 特定バージョン間のデータ変換ロジックを持つ個別マイグレーションファイル（例: `001_initial.ts`）
- **BackupManager**: マイグレーション前バックアップの作成・復元・管理を担うモジュール（`app/migrations/backup.ts`）
- **ErrorHandler**: エラーレベル分類とユーザー通知を担うユーティリティ（`app/utils/errorHandler.ts`）
- **SchemaVersion**: AsyncStorage の `db_version` キーに保存される整数値（現在の最大値は 2）
- **MigrationTarget**: マイグレーション対象のストレージキー群（`quiz_questions`, `question_folders`, `inbox_items`, `quiz_stats`）
- **Question**: クイズ問題を表すデータ構造（`id`, `question`, `answerType`, `descriptiveAnswer`, `trueFalseAnswer`, `multipleChoice`, `enabled`, `tags`, `image`, `imageAnnotations`, `isShared`, `createdAt` を持つ）

---

## Requirements

### Requirement 1: 初期スキーママイグレーション（バージョン 1）

**User Story:** As a developer, I want an initial schema migration to set up the base data structure, so that new installations have a consistent starting state.

#### Acceptance Criteria

1. WHEN `quiz_questions` キーが AsyncStorage に存在しない場合、THE MigrationUnit v1 SHALL `quiz_questions` に空配列 `[]` を書き込む
2. WHEN `quiz_questions` キーが既に存在する場合、THE MigrationUnit v1 SHALL 既存データを変更せずに処理を完了する
3. THE MigrationUnit v1 SHALL `up(storage)` 関数と `version` プロパティ（値: `1`）をエクスポートする

---

### Requirement 2: アノテーション追加マイグレーション（バージョン 2）

**User Story:** As a developer, I want a migration to add imageAnnotations and isShared fields, so that existing questions gain the new schema fields without data loss.

#### Acceptance Criteria

1. WHEN バージョン 2 マイグレーションが実行される場合、THE MigrationUnit v2 SHALL `quiz_questions` の各 Question オブジェクトに `imageAnnotations` フィールドが存在しない場合は空配列 `[]` を追加する
2. WHEN バージョン 2 マイグレーションが実行される場合、THE MigrationUnit v2 SHALL `quiz_questions` の各 Question オブジェクトに `isShared` フィールドが存在しない場合は `false` を追加する
3. WHEN バージョン 2 マイグレーションが実行される場合、THE MigrationUnit v2 SHALL `quiz_questions` の各 Question の `createdAt` フィールドが文字列型の場合、Unix タイムスタンプ（number 型）に変換する
4. WHEN `quiz_questions` キーが AsyncStorage に存在しない場合、THE MigrationUnit v2 SHALL 何も変更せずに処理を完了する
5. THE MigrationUnit v2 SHALL `up(storage)` 関数と `version` プロパティ（値: `2`）をエクスポートする

---

### Requirement 3: マイグレーション実行管理

**User Story:** As a developer, I want a migration runner that manages version checks and sequential execution, so that migrations run in the correct order and only when necessary.

#### Acceptance Criteria

1. WHEN `runMigrations()` が呼び出される場合、THE MigrationRunner SHALL AsyncStorage から現在の SchemaVersion を取得する
2. WHEN 現在の SchemaVersion が `CURRENT_VERSION` と等しい場合、THE MigrationRunner SHALL マイグレーションを実行せずに処理を終了する
3. WHEN 実行すべきマイグレーションが存在する場合、THE MigrationRunner SHALL マイグレーション前に BackupManager を呼び出しバックアップを作成する
4. WHEN バックアップ作成が完了した場合、THE MigrationRunner SHALL 現在の SchemaVersion より大きいバージョンのマイグレーションをバージョン番号の昇順に順次実行する
5. WHEN すべてのマイグレーションが正常に完了した場合、THE MigrationRunner SHALL AsyncStorage の `db_version` を `CURRENT_VERSION` に更新する
6. THE MigrationRunner SHALL `runMigrations()` 関数をエクスポートする

---

### Requirement 4: エラー時ロールバック

**User Story:** As a developer, I want automatic rollback on migration failure, so that users don't end up with corrupted data.

#### Acceptance Criteria

1. WHEN マイグレーション実行中にエラーが発生した場合、THE MigrationRunner SHALL エラーログを出力し、BackupManager の `restoreFromBackup` を呼び出してバックアップから復元を試みる
2. WHEN バックアップからの復元が成功した場合、THE MigrationRunner SHALL ErrorHandler の `handleFatalError` を呼び出してアプリを停止する
3. WHEN バックアップからの復元が失敗した場合、THE MigrationRunner SHALL ErrorHandler の `handleFatalError` を呼び出してアプリを停止する
4. IF マイグレーション実行前にバックアップが存在しない場合、THEN THE MigrationRunner SHALL マイグレーション実行を中断してエラーを報告する

---

### Requirement 5: エラーハンドリングユーティリティ

**User Story:** As a developer, I want an error handling utility, so that fatal and non-fatal errors can be presented to users consistently.

#### Acceptance Criteria

1. THE ErrorHandler SHALL `ErrorLevel` 列挙型（`INFO`, `WARNING`, `FATAL`）をエクスポートする
2. WHEN `showUserError(message, level)` が呼び出される場合、THE ErrorHandler SHALL `ErrorLevel` に応じたメッセージをコンソールに出力する
3. WHEN `handleFatalError(error)` が呼び出される場合、THE ErrorHandler SHALL エラーメッセージをコンソールに出力し、`window.location.reload()` によるページリロードを行う
4. WHERE Web プラットフォームの場合、THE ErrorHandler SHALL `window.location.reload()` を使用してアプリを再起動する

---

### Requirement 6: アプリ起動時の自動マイグレーション実行

**User Story:** As a user, I want migrations to run automatically on app startup, so that I don't need to manually trigger data updates.

#### Acceptance Criteria

1. WHEN アプリが起動する場合、THE App SHALL `useEffect` フック内で `runMigrations()` を呼び出す
2. WHEN `runMigrations()` が正常に完了した場合、THE App SHALL 通常のアプリ画面を表示する
3. WHEN `runMigrations()` がエラーをスローした場合、THE App SHALL `handleFatalError` を呼び出してアプリの動作を停止する
4. THE App SHALL マイグレーション完了前にアプリのメインコンテンツを表示しない（初期化ブロック）

---

### Requirement 7: 冪等性の保証

**User Story:** As a developer, I want migrations to be idempotent based on version tracking, so that the same migration is never executed twice.

#### Acceptance Criteria

1. WHEN `runMigrations()` が呼び出され、現在の SchemaVersion が `CURRENT_VERSION` と等しい場合、THE MigrationRunner SHALL いかなる MigrationUnit も実行しない
2. WHEN 一部のマイグレーションのみ未適用の場合、THE MigrationRunner SHALL 適用済みバージョンより大きいバージョンの MigrationUnit のみを実行する
3. WHEN すべてのマイグレーションが完了した場合、THE MigrationRunner SHALL `db_version` を `CURRENT_VERSION` に設定し、次回起動時に再実行されないことを保証する

---

### Requirement 8: 拡張可能なマイグレーション構造

**User Story:** As a developer, I want the migration system to be easily extensible, so that future schema changes can be added with minimal effort.

#### Acceptance Criteria

1. THE MigrationRunner SHALL `MigrationUnit` インターフェース（`version: number` と `up(storage: typeof AsyncStorage): Promise<void>` を持つ）に準拠したオブジェクトを格納する配列 `MIGRATIONS` を管理する
2. WHEN 新しいマイグレーションを追加する場合、THE MigrationRunner SHALL 新しい MigrationUnit ファイルを `MIGRATIONS` 配列に追加するだけで動作するよう設計される
3. THE MigrationRunner SHALL `MIGRATIONS` 配列をバージョン番号の昇順で管理する

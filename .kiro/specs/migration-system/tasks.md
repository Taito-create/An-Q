# Implementation Plan: migration-system

## Overview

AsyncStorage データマイグレーションシステムを順次実装する。
まず ErrorHandler と MigrationUnit の個別ファイルを作成し、次に MigrationRunner でそれらを統合、最後に App.js に初期化処理を追加してすべてを結線する。

## Tasks

- [x] 1. ErrorHandler ユーティリティの実装
  - `app/utils/errorHandler.ts` を新規作成する
  - `ErrorLevel` enum（`INFO`, `WARNING`, `FATAL`）をエクスポートする
  - `showUserError(message: string, level: ErrorLevel): void` を実装する（FATAL → `console.error`、WARNING → `console.warn`、INFO → `console.info`）
  - `handleFatalError(error: unknown): void` を実装する（`console.error` 出力後 `window.location.reload()` を呼び出す）
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 1.1 ErrorHandler のプロパティテストを作成する
    - **Property 10: showUserError が ErrorLevel に応じた console メソッドを呼ぶ**
    - **Validates: Requirements 5.2**
    - ランダムな message 文字列と全 ErrorLevel 値の組み合わせで検証する
    - **Property 11: handleFatalError は任意のエラーに対して常にログ出力とリロードを行う**
    - **Validates: Requirements 5.3**
    - ランダムなエラーオブジェクトで `console.error` と `window.location.reload` が呼ばれることを検証する

- [x] 2. MigrationUnit v1（初期スキーマ）の実装
  - `app/migrations/migrations/001_initial.ts` を新規作成する
  - `MigrationUnit` インターフェース（`version: 1`, `up(storage): Promise<void>`）を実装する
  - `up()` 内で `AsyncStorage.getItem('quiz_questions')` が `null` の場合のみ `[]` を書き込む
  - `version` プロパティと `up` 関数をデフォルトエクスポートする
  - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.1 MigrationUnit v1 のプロパティテストを作成する
    - **Property 1: v1 マイグレーションが quiz_questions を初期化する**
    - **Validates: Requirements 1.1**
    - `quiz_questions` が未存在のモックストレージで `up()` を実行し、`quiz_questions === '[]'` を検証する
    - **Property 2: v1 マイグレーションが既存データを保持する**
    - **Validates: Requirements 1.2**
    - ランダムな Question 配列を設定したモックストレージで `up()` を実行し、データが変化しないことを検証する

- [x] 3. MigrationUnit v2（アノテーション追加）の実装
  - `app/migrations/migrations/002_annotations.ts` を新規作成する
  - `version: 2` と `up(storage): Promise<void>` を実装する
  - `quiz_questions` が `null` の場合は何もせずに返す
  - 各 Question に `imageAnnotations`（デフォルト `[]`）・`isShared`（デフォルト `false`）を追加する
  - `createdAt` が `string` 型の場合 `new Date(q.createdAt).getTime()` で `number` に変換する
  - `app/types/question.ts` の `Question` 型を利用する
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 3.1 MigrationUnit v2 のプロパティテストを作成する
    - **Property 3: v2 マイグレーションが全 Question にデフォルトフィールドを追加する**
    - **Validates: Requirements 2.1, 2.2**
    - `imageAnnotations` と `isShared` が任意の組み合わせで欠損する Question 配列でテストし、実行後すべての Question が両フィールドを持つことを検証する
    - **Property 4: v2 マイグレーションが createdAt を number 型に変換する**
    - **Validates: Requirements 2.3**
    - `createdAt` が `string`/`number`/`undefined` のランダム Question 配列でテストし、実行後 `createdAt` が存在する場合は常に `number` 型であることを検証する

- [ ] 4. MigrationRunner エントリポイントの実装
  - `app/migrations/index.ts` を新規作成する
  - `MigrationUnit` インターフェースを定義する
  - `migration001` と `migration002` をインポートして `MIGRATIONS` 配列（昇順）に登録する
  - `runMigrations()` 関数を実装する：
    1. `AsyncStorage.getItem(MIGRATION_KEY)` で現在バージョンを取得（`null` は `0` 扱い）
    2. `currentVersion === CURRENT_VERSION` なら即返却
    3. `createBackup(currentVersion)` でバックアップを作成し `backupKey` を保持
    4. `version > currentVersion` の MigrationUnit を昇順でループ実行
    5. 完了後 `AsyncStorage.setItem(MIGRATION_KEY, String(CURRENT_VERSION))`
    6. エラー発生時: `restoreFromBackup(backupKey)` → `handleFatalError(error)`
  - `runMigrations` をエクスポートする
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 7.1, 7.2, 7.3, 8.1, 8.2, 8.3_

  - [ ]* 4.1 MigrationRunner のプロパティテストを作成する
    - **Property 5: 最新バージョンでは runMigrations が何も実行しない**
    - **Validates: Requirements 3.2, 7.1**
    - `db_version = CURRENT_VERSION` のモックストレージで `runMigrations()` を実行し、すべての `up()` が呼ばれないことを検証する
    - **Property 6: バックアップはマイグレーションより先に作成される**
    - **Validates: Requirements 3.3**
    - 任意の開始バージョン（0 または 1）で、`createBackup` が最初の `up()` より先に呼ばれる順序を検証する
    - **Property 7: 未適用マイグレーションのみ昇順で実行される**
    - **Validates: Requirements 3.4, 7.2**
    - ランダムな開始バージョン（0〜CURRENT_VERSION-1）で、実行された `up()` のバージョン番号が開始バージョンより大きく昇順であることを検証する
    - **Property 8: 成功後に db_version が更新され、次回実行は無操作になる**
    - **Validates: Requirements 3.5, 7.3**
    - 任意の開始バージョンで `runMigrations()` 実行後、`db_version === CURRENT_VERSION` であり、再実行でも `up()` が一切呼ばれないことを検証する
    - **Property 9: マイグレーション失敗時は常にロールバックと handleFatalError が呼ばれる**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - エラーをスローするモック MigrationUnit を注入し、`restoreFromBackup` と `handleFatalError` が両方呼ばれることを検証する

- [~] 5. Checkpoint — ここまでのテストがすべてパスすることを確認する
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. App.js への初期化処理追加
  - `App.js` を修正して `runMigrations` と `handleFatalError` をインポートする
  - `useEffect` フックを追加し、マウント時に `runMigrations()` を呼び出す
  - `runMigrations()` が失敗した場合は `handleFatalError(error)` を呼び出す
  - マイグレーション完了前はローディング表示（またはブランク）を返してメインコンテンツをブロックする
  - `useState` で `migrationReady` フラグを管理し、完了後にアプリ画面を描画する
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 6.1 App.js の初期化フローのユニットテストを作成する
    - マウント時に `runMigrations` が呼ばれることを検証する（統合 6.1）
    - `runMigrations` 成功後にアプリコンテンツが表示されることを検証する（例 6.2）
    - `runMigrations` 失敗時に `handleFatalError` が呼ばれることを検証する（例 6.3）
    - マイグレーション完了前にメインコンテンツが非表示であることを検証する（例 6.4）
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [~] 7. Final Checkpoint — 全テストパスと結合確認
  - Ensure all tests pass, ask the user if questions arise.
  - `MIGRATIONS` 配列のバージョンが昇順であることを確認する（Requirements 8.3）
  - アプリを起動してマイグレーションログ（`[Migration]`）がコンソールに出力されることを手動確認する

## Notes

- タスクに `*` が付いたサブタスクはオプションであり、MVP 実装時はスキップ可能
- プロパティテストには `fast-check` を使用する（`npm install --save-dev fast-check`）
- AsyncStorage のモックには `@react-native-async-storage/async-storage/jest/async-storage-mock` を使用する
- 各プロパティテストは最低 100 回イテレーション実行する（fast-check デフォルト）
- タグ形式: `// Feature: migration-system, Property N: <property_text>`
- `window.location.reload` のテストでは `jest.spyOn(window.location, 'reload')` でモックする

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2"] },
    { "wave": 3, "tasks": ["3"] },
    { "wave": 4, "tasks": ["4"] },
    { "wave": 5, "tasks": ["5"] },
    { "wave": 6, "tasks": ["6"] },
    { "wave": 7, "tasks": ["7"] }
  ]
}
```

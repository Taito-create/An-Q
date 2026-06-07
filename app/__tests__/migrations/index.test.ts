/**
 * マイグレーションシステムのテスト
 *
 * テスト対象: app/migrations/index.ts (runMigrations)
 *
 * 設計上の注意:
 * - handleFatalError は throw せず window.location.reload() を呼ぶだけなので
 *   エラーケースは "rejects" ではなく handleFatalError の呼び出し確認で検証する
 * - createBackup は MIGRATION_TARGETS のキーを getItem で読む → モック順序に注意
 * - バックアップキー形式: `backup_${timestamp}` (バージョン番号は含まない)
 *
 * @jest-environment node
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/storageKeys';

// ── モック ────────────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// handleFatalError をモック（window.location.reload が node 環境にないため）
const mockHandleFatalError = jest.fn();
jest.mock('../../utils/errorHandler', () => ({
  handleFatalError: (...args: unknown[]) => mockHandleFatalError(...args),
  ErrorLevel: { INFO: 'INFO', WARNING: 'WARNING', FATAL: 'FATAL' },
}));

// ── テスト対象 ────────────────────────────────
import { runMigrations } from '../../migrations';

// ── ヘルパー ──────────────────────────────────
const mockGet = AsyncStorage.getItem as jest.Mock;
const mockSet = AsyncStorage.setItem as jest.Mock;

/**
 * createBackup が MIGRATION_TARGETS を順番に getItem するため、
 * バックアップ作成フローで消費される getItem をまとめてセットアップする。
 *
 * MIGRATION_TARGETS = ['quiz_questions', 'question_folders', 'inbox_items', 'quiz_stats']
 * その後 getBackupMetadataList のために 'backup_list' を getItem
 */
function setupBackupGetItemReturns(quizQuestionsValue: string | null = null) {
  mockGet
    .mockResolvedValueOnce(quizQuestionsValue)  // quiz_questions
    .mockResolvedValueOnce(null)                 // question_folders
    .mockResolvedValueOnce(null)                 // inbox_items
    .mockResolvedValueOnce(null)                 // quiz_stats
    .mockResolvedValueOnce(null);                // backup_list (getBackupMetadataList)
}

// ─────────────────────────────────────────────
describe('マイグレーションシステム', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSet.mockResolvedValue(undefined); // setItem はデフォルトで成功
  });

  // ── 冪等性（スキップ） ──────────────────────
  describe('最新バージョン到達済みの場合', () => {
    it('既にバージョン2の場合マイグレーションをスキップすること', async () => {
      mockGet.mockResolvedValueOnce('2'); // DB_VERSION = 2

      await runMigrations();

      // DB_VERSION の読み込み1回だけで完了
      expect(mockGet).toHaveBeenCalledTimes(1);
      expect(mockGet).toHaveBeenCalledWith(STORAGE_KEYS.DB_VERSION);
      // setItem は一切呼ばれない
      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  // ── バージョン0から2へ（初回起動） ───────────
  describe('初回起動時（バージョン0）', () => {
    it('バージョン2まで全マイグレーションが実行されること', async () => {
      mockGet.mockResolvedValueOnce(null); // DB_VERSION → null (バージョン0扱い)
      setupBackupGetItemReturns(null);     // バックアップ作成
      // migration001: quiz_questions = null → 空配列書き込み
      mockGet.mockResolvedValueOnce(null);
      // migration002: quiz_questions = '[]' （直前に書き込まれた状態）
      mockGet.mockResolvedValueOnce('[]');

      await runMigrations();

      // 最終的に DB_VERSION が '2' に更新されること
      expect(mockSet).toHaveBeenCalledWith(STORAGE_KEYS.DB_VERSION, '2');
    });

    it('quiz_questions が存在しない場合は空配列で初期化されること', async () => {
      mockGet.mockResolvedValueOnce(null); // DB_VERSION
      setupBackupGetItemReturns(null);     // バックアップ (quiz_questions = null)
      mockGet.mockResolvedValueOnce(null); // migration001 の getItem
      mockGet.mockResolvedValueOnce('[]'); // migration002 の getItem

      await runMigrations();

      // migration001 が空配列を書き込む
      expect(mockSet).toHaveBeenCalledWith(STORAGE_KEYS.QUIZ_QUESTIONS, '[]');
    });
  });

  // ── バージョン1から2へ ─────────────────────
  describe('バージョン1 → 2 のマイグレーション', () => {
    const oldData = JSON.stringify([
      {
        id: 1,
        question: 'テスト問題',
        answerType: 'truefalse',
        trueFalseAnswer: true,
        enabled: true,
        tags: ['タグ1'],
        mistakeCount: 0,
        createdAt: '2024-01-01T00:00:00.000Z', // 文字列形式（旧スキーマ）
      },
    ]);

    it('imageAnnotations と isShared が追加されること', async () => {
      mockGet.mockResolvedValueOnce('1');      // DB_VERSION = 1
      setupBackupGetItemReturns(oldData);      // バックアップ作成
      mockGet.mockResolvedValueOnce(oldData);  // migration002 の getItem

      await runMigrations();

      const setItemCalls = mockSet.mock.calls;
      const questionsCall = setItemCalls.find(
        ([key]) => key === STORAGE_KEYS.QUIZ_QUESTIONS
      );

      expect(questionsCall).toBeDefined();
      const migrated = JSON.parse(questionsCall![1]);
      expect(migrated[0]).toHaveProperty('imageAnnotations', []);
      expect(migrated[0]).toHaveProperty('isShared', false);
    });

    it('createdAt が string → number に変換されること', async () => {
      mockGet.mockResolvedValueOnce('1');
      setupBackupGetItemReturns(oldData);
      mockGet.mockResolvedValueOnce(oldData);

      await runMigrations();

      const setItemCalls = mockSet.mock.calls;
      const questionsCall = setItemCalls.find(
        ([key]) => key === STORAGE_KEYS.QUIZ_QUESTIONS
      );

      expect(questionsCall).toBeDefined();
      const migrated = JSON.parse(questionsCall![1]);
      expect(typeof migrated[0].createdAt).toBe('number');
      // 元の ISO 文字列と同じタイムスタンプになっていること
      expect(migrated[0].createdAt).toBe(
        new Date('2024-01-01T00:00:00.000Z').getTime()
      );
    });

    it('既存フィールドがそのまま保持されること', async () => {
      mockGet.mockResolvedValueOnce('1');
      setupBackupGetItemReturns(oldData);
      mockGet.mockResolvedValueOnce(oldData);

      await runMigrations();

      const setItemCalls = mockSet.mock.calls;
      const questionsCall = setItemCalls.find(
        ([key]) => key === STORAGE_KEYS.QUIZ_QUESTIONS
      );

      const migrated = JSON.parse(questionsCall![1]);
      expect(migrated[0].id).toBe(1);
      expect(migrated[0].question).toBe('テスト問題');
      expect(migrated[0].tags).toEqual(['タグ1']);
      expect(migrated[0].trueFalseAnswer).toBe(true);
    });

    it('マイグレーション後に DB_VERSION が 2 に更新されること', async () => {
      mockGet.mockResolvedValueOnce('1');
      setupBackupGetItemReturns(oldData);
      mockGet.mockResolvedValueOnce(oldData);

      await runMigrations();

      expect(mockSet).toHaveBeenCalledWith(STORAGE_KEYS.DB_VERSION, '2');
    });

    it('quiz_questions が null の場合は何もせず完了すること', async () => {
      mockGet.mockResolvedValueOnce('1');  // DB_VERSION
      setupBackupGetItemReturns(null);     // バックアップ (quiz_questions = null)
      mockGet.mockResolvedValueOnce(null); // migration002 の getItem

      await runMigrations();

      // quiz_questions への setItem は呼ばれない（null の場合は早期 return）
      const questionsCall = mockSet.mock.calls.find(
        ([key]) => key === STORAGE_KEYS.QUIZ_QUESTIONS
      );
      expect(questionsCall).toBeUndefined();

      // DB_VERSION は更新される
      expect(mockSet).toHaveBeenCalledWith(STORAGE_KEYS.DB_VERSION, '2');
    });
  });

  // ── バックアップ作成 ──────────────────────────
  describe('バックアップ', () => {
    it('マイグレーション前にバックアップが作成されること', async () => {
      mockGet.mockResolvedValueOnce(null); // DB_VERSION
      setupBackupGetItemReturns(null);
      mockGet.mockResolvedValueOnce(null); // migration001
      mockGet.mockResolvedValueOnce('[]'); // migration002

      await runMigrations();

      // `backup_${timestamp}` キーで setItem が呼ばれていること
      const backupCall = mockSet.mock.calls.find(
        ([key]) => typeof key === 'string' && key.startsWith('backup_')
      );
      expect(backupCall).toBeDefined();
    });
  });

  // ── エラーハンドリング ─────────────────────────
  describe('エラーハンドリング', () => {
    it('マイグレーション中にエラーが発生した場合 handleFatalError が呼ばれること', async () => {
      mockGet.mockResolvedValueOnce('1');      // DB_VERSION
      setupBackupGetItemReturns(null);         // バックアップ作成

      // migration002 の getItem で例外を発生させる
      mockGet.mockRejectedValueOnce(new Error('storage read error'));

      await runMigrations();

      expect(mockHandleFatalError).toHaveBeenCalledTimes(1);
      expect(mockHandleFatalError).toHaveBeenCalledWith(
        expect.any(Error)
      );
    });

    it('バックアップ作成に失敗した場合 handleFatalError が呼ばれマイグレーションが中断されること', async () => {
      mockGet.mockResolvedValueOnce('1'); // DB_VERSION
      // MIGRATION_TARGETS の getItem を正常に返した後、setItem で失敗させる
      mockGet
        .mockResolvedValueOnce(null)  // quiz_questions
        .mockResolvedValueOnce(null)  // question_folders
        .mockResolvedValueOnce(null)  // inbox_items
        .mockResolvedValueOnce(null)  // quiz_stats
        .mockResolvedValueOnce(null); // backup_list
      // バックアップの setItem を失敗させる
      mockSet.mockRejectedValueOnce(new Error('backup write failed'));

      await runMigrations();

      expect(mockHandleFatalError).toHaveBeenCalledTimes(1);
      // DB_VERSION は更新されない（マイグレーション中断）
      expect(mockSet).not.toHaveBeenCalledWith(STORAGE_KEYS.DB_VERSION, '2');
    });
  });
});

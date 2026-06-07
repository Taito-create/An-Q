/**
 * ErrorHandler ユーティリティ
 * エラーレベル分類とユーザー通知を担うユーティリティ
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

/**
 * エラーの重大度レベルを表す列挙型
 */
export enum ErrorLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  FATAL = 'FATAL',
}

/**
 * エラーレベルに応じたコンソール出力を行う
 * - FATAL   → console.error
 * - WARNING → console.warn
 * - INFO    → console.info
 *
 * @param message - ユーザーに表示するエラーメッセージ
 * @param level   - エラーの重大度レベル
 */
export const showUserError = (message: string, level: ErrorLevel): void => {
  switch (level) {
    case ErrorLevel.FATAL:
      console.error(`[FATAL] ${message}`);
      break;
    case ErrorLevel.WARNING:
      console.warn(`[WARNING] ${message}`);
      break;
    case ErrorLevel.INFO:
      console.info(`[INFO] ${message}`);
      break;
  }
};

/**
 * 致命的なエラーを処理する
 * エラー内容をコンソールに出力した後、window.location.reload() でページをリロードする
 * Expo Web 環境向けの実装
 *
 * @param error - 発生したエラー（unknown 型）
 */
export const handleFatalError = (error: unknown): void => {
  console.error('[handleFatalError] 致命的なエラーが発生しました:', error);
  window.location.reload();
};

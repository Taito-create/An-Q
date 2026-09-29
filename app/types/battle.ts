import type { Timestamp } from 'firebase/firestore';

// ─────────────────────────────────────────────
// リアルタイム対戦 (Battle) のFirestoreデータモデル
// コレクション: `battleRooms/{roomId}`
// 既存パターン踏襲: Context API + onSnapshot + react-router-dom
// テーマは `app/theme.tsx` のカラーパレットをUI実装時に使用すること
// ─────────────────────────────────────────────

/** 対戦フェーズ (= BattleRoom.status と同値) */
export type BattlePhase =
  | 'waiting'
  | 'creating'
  | 'answering'
  | 'judging'
  | 'finished'
  | 'abandoned';

/** 出題者が登録する問題 + 正解 */
export interface BattleQuestion {
  text: string;
  answer: string;
}

/** 回答者が送信する回答 + 送信時刻(速度判定用) */
export interface BattleAnswer {
  text: string;
  submittedAt: Timestamp;
}

/** 出題者が相手の回答に対して下す正誤判定 */
export type BattleJudgement = 'correct' | 'incorrect';

/**
 * 対戦ルームの状態。
 *
 * 役割の約束:
 * - `hostId`: ルーム作成者 (createRoom を呼んだユーザーのUID)
 * - `guestId`: 参加者 (joinRoom を呼んだユーザーのUID)。参加前は null
 *
 * 進行の約束 (status):
 * - `waiting`: ゲスト待ち (guestId === null)
 * - `creating`: 双方が `hostQuestion` / `guestQuestion` を登録中
 * - `answering`: 双方の問題が出揃い、相手の問題に回答中
 * - `judging`: 双方の回答が出揃い、相手の回答を正誤判定中
 * - `finished`: 双方の判定が出揃い、対戦終了
 * - `abandoned`: ホストが退出し、対戦が破棄された状態
 *
 * 判定フィールドの約束 (submitJudgement は「相手の回答」に対する判定):
 * - `hostJudgement`: ホストが下した判定 (= guestAnswer に対する判定)
 * - `guestJudgement`: ゲストが下した判定 (= hostAnswer に対する判定)
 */
export interface BattleRoom {
  /** ドキュメントID (= ルームID) */
  id: string;
  /** 作成者のUID */
  hostId: string;
  /** 参加者のUID (参加前は null) */
  guestId: string | null;
  /** 進行フェーズ */
  status: BattlePhase;
  /** ルーム作成時刻 */
  createdAt: Timestamp;
  /** answering 開始時刻 (制限時間の基準。サーバータイムスタンプを使用) */
  timerStartAt: Timestamp | null;
  /** ホストが出題する問題 (未登録は null) */
  hostQuestion: BattleQuestion | null;
  /** ゲストが出題する問題 (未登録は null) */
  guestQuestion: BattleQuestion | null;
  /** ホストの回答 (ゲストの問題に対する回答。未回答は null) */
  hostAnswer: BattleAnswer | null;
  /** ゲストの回答 (ホストの問題に対する回答。未回答は null) */
  guestAnswer: BattleAnswer | null;
  /** ホストが下した判定 (guestAnswer に対する判定。未判定は null) */
  hostJudgement: BattleJudgement | null;
  /** ゲストが下した判定 (hostAnswer に対する判定。未判定は null) */
  guestJudgement: BattleJudgement | null;
  /** ホストの再戦希望フラグ (未定義時は false 扱い) */
  hostRematch?: boolean;
  /** ゲストの再戦希望フラグ (未定義時は false 扱い) */
  guestRematch?: boolean;
  /** 両者同意時にセットされる次ルームのID (未定義時は null 扱い) */
  rematchRoomId?: string | null;
}

/** Firestore コレクション名 */
export const BATTLE_ROOMS_COLLECTION = 'battleRooms';

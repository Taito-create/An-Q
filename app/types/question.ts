export interface ImageAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
}

export interface MultipleChoice {
  options: string[];
  /**
   * 正解の選択肢インデックス（配列で統一）。
   * 単一正解は [1]、複数正解は [0, 2] のように配列で保持する。
   * 旧データ互換のため任意（未設定の問は normalizeMultipleChoice が [0] に補完する）。
   */
  correctAnswers?: number[];
  /** UI用フラグ: true なら複数選択、false/未定義なら単一選択 */
  allowMultiple?: boolean;
  /** @deprecated 旧データ互換用。読み取り時のみ参照する（correctAnswers へ正規化される） */
  correctAnswer?: number;
}

/**
 * SRS（間隔反復学習）の学習状態。
 * Firestore のネスト配列制約を避けるため、数値フィールドのみで構成する。
 */
export interface SrsState {
  /** 記憶の強度 (0-100) */
  memoryStrength: number;
  /** 次回復習のタイムスタンプ(ms) */
  nextReviewAt: number;
  /** 最終復習のタイムスタンプ(ms) */
  lastReviewedAt: number;
  /** 総復習回数 */
  reviewCount: number;
  /** 連続正解数 */
  correctStreak: number;
  /**
   * 誤答タイプの履歴（新しい順、最大10件）。
   * 1 = unknown / 2 = confused / 3 = careless / 4 = guess
   * 数値のフラット配列（Firestore のネスト配列制約を回避）
   */
  errorHistory?: number[];
}

export interface Question {
  id: number;
  question: string;
  answerType: 'descriptive' | 'truefalse' | 'multiple';
  descriptiveAnswer?: string | string[];
  trueFalseAnswer?: boolean;
  multipleChoice?: MultipleChoice;
  enabled: boolean;
  tags: string[];
  topic?: string;
  image?: string | null;
  imageAnnotations?: ImageAnnotation[];
  isShared?: boolean;
  sharedMark?: string;
  mistakeCount?: number;
  createdAt?: number;
  explanation?: string;  // 正解時の解説（備考）
  wrongReason?: string;  // 後方互換性のため保持（旧データ用）
  matchMode?: 'any' | 'all';  // 記述問題の判定モード（any: 別解, all: 両解必須）
  descriptiveAnswerGroups?: string[][];
  // 空欄ごとにグループ化された正解候補。
  // 例: [["アポリア", "行き詰まり"], ["思い込み", "ドクサ"]]
  // 外側の配列＝空欄の数（AND条件）、内側の配列＝その空欄で
  // 許容する言い換え（OR条件）
  reading?: string;  // 読み仮名（任意）例: "もり おうがい"
  sharedWith?: string[]; // データ共有を許可するユーザーUIDの配列
  /** SRS（間隔反復学習）の状態。既存問題は undefined のまま扱う */
  srs?: SrsState;
}

export interface Folder {
  id: string;
  name: string;
  description?: string;
  questionIds: number[];
  createdAt?: number;
  isShared?: boolean;
  sharedMark?: string;
  parentId?: string;
  sharedWith?: string[]; // データ共有を許可するユーザーUIDの配列
}

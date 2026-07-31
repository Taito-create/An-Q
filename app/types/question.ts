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
  correctAnswer: number;
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
}
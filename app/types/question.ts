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
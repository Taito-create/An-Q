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
  descriptiveAnswer?: string;
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
}

export interface Folder {
  id: string;
  name: string;
  description?: string;
  questionIds: number[];
  createdAt?: number;
  isShared?: boolean;
  sharedMark?: string;
}
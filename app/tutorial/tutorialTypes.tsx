// チュートリアルの型定義
export interface TutorialTask {
  id: string;
  taskTitle: string; // 具体的なタスク名
  actionText: string; // ユーザーがすべき具体的なアクション
  targetElement?: string; // スポットライト対象の要素ID
  expectedAction?: string; // 期待されるアクションタイプ
  successMessage?: string; // 成功時のメッセージ
  nextButtonText?: string;
  skipButtonText?: string;
  isInteractive?: boolean; // ユーザー操作が必要かどうか
  disableOtherElements?: boolean; // 他の要素を無効化するか
  highlightOnly?: boolean; // ハイライトのみで操作制限しないか
}

export interface TutorialState {
  isActive: boolean;
  currentStep: number;
  tasks: TutorialTask[];
  spotlightElement?: Element | null;
  isWaitingForAction?: boolean; // ユーザーのアクション待機中か
  completedTasks?: string[]; // 完了したタスクIDリスト
  currentPhase?: 'solve' | 'review' | 'settings'; // 現在のフェーズ
}

export type TutorialType = 'firstTime' | 'questionCreation' | 'quizTaking' | 'settings' | 'interactive';

// タスクベースのチュートリアルコンテンツ
export const tutorialContent: Record<TutorialType, TutorialTask[]> = {
  firstTime: [
    {
      id: 'welcome',
      taskTitle: 'An-Qへようこそ！',
      actionText: 'タスクベースのチュートリアルを始めましょう',
      successMessage: '準備完了！',
      nextButtonText: '始める',
      skipButtonText: 'スキップ',
      isInteractive: false,
    },
    {
      id: 'solveQuiz',
      taskTitle: '実際に問題を1問解いてみよう',
      actionText: '光っている「クイズ開始」ボタンを押して、問題に答えてみましょう',
      targetElement: 'quiz-start-button',
      expectedAction: 'click',
      successMessage: 'ナイス！最初の問題をクリアしました！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
      highlightOnly: true,
    },
    {
      id: 'reviewMistakes',
      taskTitle: '間違えた問題を復習しよう',
      actionText: '間違えた問題があれば、もう一度挑戦してみましょう',
      targetElement: 'review-button',
      expectedAction: 'click',
      successMessage: '復習完了！学習効果が上がりました！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
    },
    {
      id: 'changeSettings',
      taskTitle: '設定を変えてみよう',
      actionText: '「設定」ボタンでBGMやテーマを変更してみましょう',
      targetElement: 'settings-button',
      expectedAction: 'click',
      successMessage: '設定完了！自分好みにカスタマイズできました！',
      nextButtonText: '完了',
      isInteractive: true,
      disableOtherElements: true,
    },
  ],
  
  interactive: [
    {
      id: 'solveFirst',
      taskTitle: 'まずは1問解いてみよう',
      actionText: 'クイズ開始ボタンを押して、最初の問題に挑戦しましょう',
      targetElement: 'quiz-start-button',
      expectedAction: 'click',
      successMessage: 'ナイス！正解です！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
    },
    {
      id: 'createCard',
      taskTitle: '新しいカードを1枚作ってみよう',
      actionText: '問題作成で、自分だけの問題を作成してみましょう',
      targetElement: 'create-question-button',
      expectedAction: 'click',
      successMessage: '素晴らしい！問題を作成しました！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
    },
  ],
  
  questionCreation: [
    {
      id: 'createFirstQuestion',
      taskTitle: '新しい問題を作成しよう',
      actionText: '問題文を入力して、答えを設定してみましょう',
      targetElement: 'question-input',
      expectedAction: 'input',
      successMessage: '問題作成完了！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
    },
  ],
  
  quizTaking: [
    {
      id: 'answerQuestion',
      taskTitle: '問題に答えよう',
      actionText: '正解だと思う選択肢をクリックしましょう',
      targetElement: 'answer-options',
      expectedAction: 'click',
      successMessage: '正解！素晴らしい！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
    },
  ],
  
  settings: [
    {
      id: 'changeTheme',
      taskTitle: 'テーマを変更しよう',
      actionText: '好きなテーマを選んでみましょう',
      targetElement: 'theme-grid',
      expectedAction: 'click',
      successMessage: 'テーマ変更完了！',
      nextButtonText: '次へ',
      isInteractive: true,
      disableOtherElements: true,
    },
  ],
};

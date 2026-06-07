import { getAnswerText } from '../../utils/answerUtils';
import { Question } from '../../types/question';

// Alert と AsyncStorage は使用しないが answerUtils がインポートするためモック
jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
}));

// ──────────────────────────────────────────────
// テストデータファクトリ
// ──────────────────────────────────────────────
const baseQuestion = (): Question => ({
  id: 1,
  question: 'テスト問題',
  answerType: 'descriptive',
  enabled: true,
  tags: [],
  mistakeCount: 0,
  createdAt: Date.now(),
});

// ──────────────────────────────────────────────
// テストスイート
// ──────────────────────────────────────────────
describe('getAnswerText', () => {
  // ── 記述式問題 ────────────────────────────────
  describe('記述式問題', () => {
    it('記述回答を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'descriptive',
        descriptiveAnswer: 'これが回答です',
      };
      expect(getAnswerText(question)).toBe('これが回答です');
    });

    it('回答が未設定の場合は空文字を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'descriptive',
        // descriptiveAnswer なし
      };
      expect(getAnswerText(question)).toBe('');
    });

    it('回答が空文字の場合も空文字を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'descriptive',
        descriptiveAnswer: '',
      };
      expect(getAnswerText(question)).toBe('');
    });
  });

  // ── ○×問題 ───────────────────────────────────
  describe('○×問題', () => {
    it('正解が true の場合 ○ を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'truefalse',
        trueFalseAnswer: true,
      };
      expect(getAnswerText(question)).toBe('○');
    });

    it('正解が false の場合 ✕ を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'truefalse',
        trueFalseAnswer: false,
      };
      expect(getAnswerText(question)).toBe('✕');
    });

    it('trueFalseAnswer が未設定の場合 ✕ を返すこと（falsy 扱い）', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'truefalse',
        // trueFalseAnswer なし → undefined → falsy → ✕
      };
      expect(getAnswerText(question)).toBe('✕');
    });
  });

  // ── 四択問題 ──────────────────────────────────
  describe('四択問題', () => {
    it('正解の選択肢番号（1-index）とテキストを返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'multiple',
        multipleChoice: {
          options: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
          correctAnswer: 2, // 選択肢C が正解（0-index）
        },
      };
      expect(getAnswerText(question)).toBe('3. 選択肢C');
    });

    it('correctAnswer が 0 の場合 "1. 選択肢A" を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'multiple',
        multipleChoice: {
          options: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
          correctAnswer: 0,
        },
      };
      expect(getAnswerText(question)).toBe('1. 選択肢A');
    });

    it('correctAnswer が undefined の場合 0 をデフォルトとし "1. 選択肢A" を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'multiple',
        multipleChoice: {
          options: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
          correctAnswer: undefined as any,
        },
      };
      expect(getAnswerText(question)).toBe('1. 選択肢A');
    });

    it('最後の選択肢（index 3）が正解の場合正しく返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'multiple',
        multipleChoice: {
          options: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
          correctAnswer: 3,
        },
      };
      expect(getAnswerText(question)).toBe('4. 選択肢D');
    });
  });

  // ── 未知の answerType ─────────────────────────
  describe('未知の answerType', () => {
    it('空文字を返すこと', () => {
      const question: Question = {
        ...baseQuestion(),
        answerType: 'unknown' as any,
      };
      expect(getAnswerText(question)).toBe('');
    });
  });
});

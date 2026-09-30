import {
  parseBulkText,
  expandAnswerCandidates,
  isJapaneseToken,
  cleanEnToken,
} from '../../../app/utils/bulkParser';

describe('parseBulkText', () => {
  it('単純な単語のペアを2件返す', () => {
    const { pairs, errors } = parseBulkText('apple りんご banana バナナ');
    expect(errors).toEqual([]);
    expect(pairs).toEqual([
      { question: 'apple', answer: 'りんご' },
      { question: 'banana', answer: 'バナナ' },
    ]);
  });

  it('句動詞（EN→EN→JA）を結合して1件にする', () => {
    const { pairs } = parseBulkText('give up 諦める take off 離陸する');
    expect(pairs).toEqual([
      { question: 'give up', answer: '諦める' },
      { question: 'take off', answer: '離陸する' },
    ]);
  });

  it('複数の意味（EN→JA→JA）を1つの正解にまとめる', () => {
    const { pairs } = parseBulkText('huge 巨大な、とてつもなく大きい');
    expect(pairs).toHaveLength(1);
    expect(pairs[0].question).toBe('huge');
    expect(pairs[0].answer).toBe('巨大な、とてつもなく大きい');
  });

  it('英単語の末尾・先頭のASCII句読点を除去する', () => {
    const { pairs } = parseBulkText('apple, りんご banana. バナナ');
    expect(pairs).toEqual([
      { question: 'apple', answer: 'りんご' },
      { question: 'banana', answer: 'バナナ' },
    ]);
  });

  it('括弧書きの意味をそのまま保持する', () => {
    const { pairs } = parseBulkText('apple りんご（果物）');
    expect(pairs).toEqual([{ question: 'apple', answer: 'りんご（果物）' }]);
  });

  it('改行区切りでも1行的一样にパースできる', () => {
    const { pairs } = parseBulkText('apple りんご\nbanana バナナ');
    expect(pairs).toHaveLength(2);
    expect(pairs[0].question).toBe('apple');
    expect(pairs[1].question).toBe('banana');
  });

  it('連続する空白を1つにまとめても正しくパースする', () => {
    const { pairs } = parseBulkText('  apple   りんご   banana  バナナ  ');
    expect(pairs).toHaveLength(2);
  });

  it('数字のみのトークンはEN（問題文側）に分類される', () => {
    const { pairs } = parseBulkText('100 百 200 二百');
    expect(pairs).toEqual([
      { question: '100', answer: '百' },
      { question: '200', answer: '二百' },
    ]);
  });

  it('先頭がJAのときはエラーを報告する', () => {
    const { pairs, errors } = parseBulkText('りんご apple りんご');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('りんご');
    expect(pairs).toHaveLength(1);
  });

  it('末尾にENだけ残るときのエラーを報告する', () => {
    const { errors } = parseBulkText('apple りんご banana');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('意味が見つかりません');
  });

  it('空文字では pairs も errors も空', () => {
    expect(parseBulkText('')).toEqual({ pairs: [], errors: [], duplicates: [] });
    expect(parseBulkText('   \n  ')).toEqual({ pairs: [], errors: [], duplicates: [] });
  });

  it('同一入力内の重複英単語を警告する', () => {
    const { pairs, duplicates } = parseBulkText('apple りんご apple みかん');
    expect(pairs).toHaveLength(2); // 保存自体は許容される
    expect(duplicates).toEqual(['apple']);
  });

  it('大文字小文字の違いを無視して重複を検出する', () => {
    const { duplicates } = parseBulkText('Apple りんご apple みかん');
    expect(duplicates).toEqual(['apple']);
  });

  it('500語のパースが高速（3秒以内）に完了する', () => {
    const words = ['apple', 'banana', 'orange', 'grape', 'melon'];
    const tokens: string[] = [];
    for (let i = 0; i < 500; i++) {
      tokens.push(words[i % words.length], `意味${i}`);
    }
    const input = tokens.join(' ');

    const start = Date.now();
    const { pairs } = parseBulkText(input);
    const elapsed = Date.now() - start;

    expect(pairs).toHaveLength(500);
    expect(elapsed).toBeLessThan(3000);
  });
});

describe('expandAnswerCandidates', () => {
  it('括弧なしならそのまま1候補', () => {
    expect(expandAnswerCandidates('りんご')).toEqual(['りんご']);
  });

  it('括弧書きは「括弧付き」と「括弧なし」の両方を登録する', () => {
    expect(expandAnswerCandidates('りんご（果物）')).toEqual(['りんご（果物）', 'りんご']);
  });

  it('読点で分割した複数の意味をそれぞれ登録する', () => {
    expect(expandAnswerCandidates('巨大な、とてつもなく大きい')).toEqual([
      '巨大な',
      'とてつもなく大きい',
    ]);
  });

  it('括弧付きと読点とASCIIカンマを複合して扱う', () => {
    expect(expandAnswerCandidates('りんご（果物）、apple')).toEqual([
      'りんご（果物）',
      'りんご',
      'apple',
    ]);
  });

  it('ASCIIの括弧にも対応する', () => {
    expect(expandAnswerCandidates('big(food)')).toEqual(['big(food)', 'big']);
  });

  it('空文字では空配列を返す', () => {
    expect(expandAnswerCandidates('')).toEqual([]);
  });
});

describe('isJapaneseToken / cleanEnToken', () => {
  it('非ASCIIを含むトークンは日本語と判定する', () => {
    expect(isJapaneseToken('りんご')).toBe(true);
    expect(isJapaneseToken('諦める')).toBe(true);
    expect(isJapaneseToken('（果物）')).toBe(true);
  });

  it('ASCIIのみのトークンは英語と判定する', () => {
    expect(isJapaneseToken('apple')).toBe(false);
    expect(isJapaneseToken('give up'.split(' ')[0])).toBe(false);
    expect(isJapaneseToken('100')).toBe(false);
  });

  it('先頭・末尾の句読点を除去し中間のハイフンは保持する', () => {
    expect(cleanEnToken('apple,')).toBe('apple');
    expect(cleanEnToken('banana.')).toBe('banana');
    expect(cleanEnToken('"well-known"')).toBe('well-known');
    expect(cleanEnToken('-apple-')).toBe('apple');
    expect(cleanEnToken('well-known')).toBe('well-known');
  });
});
/**
 * 英単語リストの一括パース用純関数（/create/bulk）。
 *
 * React / Firebase に依存しない純粋な関数のみを収めることで、
 * UI Celebrity なしで高速に単体テストできるようにしている。
 */

export interface ParsedPair {
  question: string;
  answer: string;
}

export interface ParseResult {
  pairs: ParsedPair[];
  errors: string[];
  /** 同一入力内で英単語が重複したときの警告（保存自体は許容） */
  duplicates: string[];
}

/** 非ASCII文字（ひらがな・カタカナ・漢字・全角記号など）を含む＝日本語トークン */
export function isJapaneseToken(token: string): boolean {
  return /[^\x00-\x7F]/.test(token);
}

/**
 * 英単語トークンの先頭・末尾にある ASCII 句読点を除去する。
 * apple, → apple / banana. → banana / "well-known" → well-known
 * （先頭・末尾だけを削るので well-known の中間ハイフンは保持される）
 */
export function cleanEnToken(t: string): string {
  return t.replace(/^[,.\-!?;:'"]+|[,.\-!?;:'"]+$/g, '');
}

/**
 * 「英単語 意味 英単語 意味 ...」形式のテキストを (問題, 正解) のペアに変換する。
 *
 * トークン分類方式:
 *  1. 改行を半角スペースに正規化し、連続する空白を1つにまとめる
 *  2. 半角スペースで分割してトークン列にする
 *  3. 非ASCII文字を含むトークン → JA（正解側）、ASCIIのみ → EN（問題文側）
 *  4. 連続する同分類のトークンをグループ化
 *  5. グループ列を先頭から EN→JA のペアとして抽出する
 *     - 先頭が JA → 対応する英単語がないのでエラー
 *     - EN→EN→JA → EN 2つを結合（句動詞: give up）
 *     - EN→JA→JA → JA 2つを結合（複数の意味）
 */
export function parseBulkText(text: string): ParseResult {
  const normalized = text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return { pairs: [], errors: [], duplicates: [] };

  const tokens = normalized.split(' ').filter(Boolean);
  const groups: { isJa: boolean; tokens: string[] }[] = [];
  for (const t of tokens) {
    const isJa = isJapaneseToken(t);
    const last = groups[groups.length - 1];
    if (last && last.isJa === isJa) last.tokens.push(t);
    else groups.push({ isJa, tokens: [t] });
  }

  const pairs: ParsedPair[] = [];
  const errors: string[] = [];
  let i = 0;
  while (i < groups.length) {
    if (groups[i].isJa) {
      errors.push(`「${groups[i].tokens.join(' ')}」に対応する英単語がありません`);
      i++;
      continue;
    }
    const enGroup = groups[i];
    const jaGroup = groups[i + 1];
    if (!jaGroup || !jaGroup.isJa) {
      errors.push(`「${enGroup.tokens.join(' ')}」の意味が見つかりません`);
      i++;
      continue;
    }
    const question = enGroup.tokens.map(cleanEnToken).filter(Boolean).join(' ').trim();
    const answer = jaGroup.tokens.join(' ').replace(/\s+/g, ' ').trim();
    if (!question || !answer) {
      errors.push(`パースに失敗しました: ${enGroup.tokens.join(' ')}`);
    } else {
      pairs.push({ question, answer });
    }
    i += 2;
  }

  // 同一入力内の重複英単語を検出（小文字で比較して大文字小文字を無視）
  const counts = new Map<string, number>();
  for (const p of pairs) {
    const key = p.question.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicates = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([word]) => word);

  return { pairs, errors, duplicates };
}

/**
 * 意味文字列を正解候補の配列へ展開する。
 * 例:
 *   りんご                    → ['りんご']
 *   りんご（果物）             → ['りんご（果物）', 'りんご']
 *   巨大な、とてつもなく大きい   → ['巨大な', 'とてつもなく大きい']
 *   りんご（果物）、apple       → ['りんご（果物）', 'りんご', 'apple']
 */
export function expandAnswerCandidates(answer: string): string[] {
  const parts = answer
    .split(/[、,]/)
    .map(s => s.trim())
    .filter(Boolean);
  const candidates: string[] = [];
  for (const part of parts) {
    candidates.push(part); // 元の形（括弧付き）
    // 括弧と中身を除いた形も追加し、「りんご（果物）」でも「りんご」でも正解にする
    const withoutParens = part
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (withoutParens && withoutParens !== part) candidates.push(withoutParens);
  }
  return [...new Set(candidates)];
}
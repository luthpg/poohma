/**
 * 検索バーの柔軟性向上のための正規化ユーティリティ
 * - ひらがな・カタカナの同一視
 * - 全角・半角英数字の正規化（NFKC）
 * - スペース・中黒の有無吸収（検索語スペースによるAND検索の維持と、対象テキスト側でのスペース・中黒除去吸収）
 */

/**
 * 全角カタカナをひらがなに変換する
 */
export function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60),
  );
}

/**
 * 検索語を NFKC 正規化、小文字化、ひらがな化する
 */
export function normalizeSearchWord(word: string): string {
  const nfkc = word.normalize("NFKC").toLowerCase();
  return katakanaToHiragana(nfkc);
}

/**
 * 検索クエリ文字列から AND 検索用の単語リストを抽出・正規化する
 * 全角・半角スペース、および中黒（・）を単語区切りとして扱う
 */
export function extractSearchWords(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // NFKC正規化（全角英数・半角カナの標準化、全角スペース \u3000 -> \u0020）
  const normalized = trimmed.normalize("NFKC").toLowerCase();

  // スペースおよび中黒を単語区切りとして分割
  return normalized
    .replace(/[・･]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(katakanaToHiragana);
}

/**
 * 検索対象テキストから、スペース・中黒の有無やひらがな・カタカナの違いを吸収する検索用バリエーションを生成する
 */
export function generateSearchVariants(text: string): string[] {
  if (!text) return [];

  // NFKC正規化 & 小文字化
  const normalized = text.normalize("NFKC").toLowerCase();
  const hiragana = katakanaToHiragana(normalized);

  // スペース（\s）および中黒（・, ･）を除去したバリエーション
  const noDelimiters = normalized.replace(/[\s・･]/g, "");
  const noDelimitersHiragana = hiragana.replace(/[\s・･]/g, "");

  const variants = new Set([
    normalized,
    hiragana,
    noDelimiters,
    noDelimitersHiragana,
  ]);

  return Array.from(variants).filter((v) => v.length > 0);
}

/**
 * 検索対象テキストのバリエーション群に対して、指定されたすべての検索単語（AND条件）がマッチするか判定する
 */
export function matchesSearchWords(
  searchableTexts: string[],
  searchWords: string[],
): boolean {
  if (searchWords.length === 0) return true;
  if (searchableTexts.length === 0) return false;

  // すべての対象テキストからバリエーションを展開
  const allVariants = searchableTexts.flatMap(generateSearchVariants);

  // AND検索: すべての単語がいずれかのバリエーションに含まれていること
  return searchWords.every((word) =>
    allVariants.some((variant) => variant.includes(word)),
  );
}

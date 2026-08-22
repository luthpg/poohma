export const HIRAGANA_GROUPS = [
  "あ",
  "か",
  "さ",
  "た",
  "な",
  "は",
  "ま",
  "や",
  "ら",
  "わ",
] as const;

export const ALPHABET_GROUPS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
] as const;

export const ALL_INDEX_GROUPS = [
  ...HIRAGANA_GROUPS,
  ...ALPHABET_GROUPS,
  "#",
] as const;

export type IndexGroupKey = (typeof ALL_INDEX_GROUPS)[number];

/**
 * カタカナを全角ひらがなに変換する
 */
export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60),
  );
}

/**
 * サービスレコードのソートキー（グループ順位 2 桁ゼロ埋めプレフィックス + 正規化文字列）を生成
 */
export function computeSortKey(
  input: string | { titleReading?: string; title: string },
  titleReading?: string,
): string {
  const record =
    typeof input === "string" ? { title: input, titleReading } : input;
  const rawText = (record.titleReading || record.title || "").trim();
  if (!rawText) return "99_";

  const groupKey = getIndexGroupKey(record);
  let rank = 99;
  const hIndex = HIRAGANA_GROUPS.indexOf(
    groupKey as (typeof HIRAGANA_GROUPS)[number],
  );
  if (hIndex !== -1) {
    rank = hIndex;
  } else {
    const aIndex = ALPHABET_GROUPS.indexOf(
      groupKey as (typeof ALPHABET_GROUPS)[number],
    );
    if (aIndex !== -1) {
      rank = 10 + aIndex;
    }
  }

  const prefix = rank.toString().padStart(2, "0");
  const normalized = katakanaToHiragana(
    rawText.normalize("NFKC"),
  ).toLowerCase();
  return `${prefix}_${normalized}`;
}

/**
 * レコードの titleReading（または title）の頭文字から、あ・か・さ… / A-Z / # のグループキーを取得
 */
export function getIndexGroupKey(record: {
  titleReading?: string;
  title: string;
}): IndexGroupKey {
  const rawText = (record.titleReading || record.title).trim();
  if (!rawText) return "#";

  // Unicode NFKC正規化を適用してからカタカナをひらがなに変換
  const nfkcNormalized = rawText.normalize("NFKC");
  const normalized = katakanaToHiragana(nfkcNormalized);
  const firstChar = normalized.charAt(0);
  const code = firstChar.charCodeAt(0);

  // ひらがな範囲 (U+3041 - U+3096)
  if (code >= 0x3041 && code <= 0x3096) {
    if ("あいうえおぁぃぅぇぉゔ".includes(firstChar)) return "あ";
    if ("かきくけこがぎぐげご".includes(firstChar)) return "か";
    if ("さしすせそざじずぜぞ".includes(firstChar)) return "さ";
    if ("たちつてとだぢづでどっ".includes(firstChar)) return "た";
    if ("なにぬねの".includes(firstChar)) return "な";
    if ("はひふへほばびぶべぼぱぴぷぺぽ".includes(firstChar)) return "は";
    if ("まみむめも".includes(firstChar)) return "ま";
    if ("やゆよゃゅょ".includes(firstChar)) return "や";
    if ("らりるれろ".includes(firstChar)) return "ら";
    if ("わをんゎゐゑ".includes(firstChar)) return "わ";
  }

  // 半角・全角アルファベット (A-Z, a-z)
  const upper = firstChar.toUpperCase();
  if (upper >= "A" && upper <= "Z") {
    return upper as IndexGroupKey;
  }

  // それ以外（数字・記号・直接の漢字など）
  return "#";
}

/**
 * レコードのリストをグループキーごとに分類・ソートする
 */
export function groupRecordsByIndex<
  T extends { titleReading?: string; title: string },
>(records: T[]): { groupKey: IndexGroupKey; items: T[] }[] {
  const map = new Map<IndexGroupKey, T[]>();

  for (const record of records) {
    const key = getIndexGroupKey(record);
    const existing = map.get(key) || [];
    existing.push(record);
    map.set(key, existing);
  }

  const result: { groupKey: IndexGroupKey; items: T[] }[] = [];

  for (const groupKey of ALL_INDEX_GROUPS) {
    const items = map.get(groupKey);
    if (items && items.length > 0) {
      result.push({ groupKey, items });
    }
  }

  return result;
}

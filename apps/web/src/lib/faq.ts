import type { FAQCategoryField, FAQContent } from "./cms.server";

export const FAQ_CATEGORIES = [
  { key: "general", label: "基本情報" },
  { key: "usage", label: "使い方" },
  { key: "account", label: "アカウント" },
  { key: "familyManagement", label: "家族管理" },
  { key: "backupAndExport", label: "バックアップ・エクスポート" },
  { key: "security", label: "セキュリティ" },
  { key: "troubleshooting", label: "トラブルシューティング" },
  { key: "technical", label: "技術情報" },
] as const;

export type FAQCategoryKey = (typeof FAQ_CATEGORIES)[number]["key"];

export const OTHER_CATEGORY_KEY = "other";
export const OTHER_CATEGORY_LABEL = "その他";

export type GroupedFaqCategory = {
  key: string;
  label: string;
  items: FAQContent[];
};

/**
 * FAQオブジェクトからカテゴリキー文字列を安全に抽出する
 */
export function extractCategoryKey(
  category: FAQCategoryField | undefined | null,
): string {
  if (category == null) {
    return "";
  }
  if (typeof category === "string") {
    return category.trim();
  }
  if (typeof category === "object" && typeof category.name === "string") {
    return category.name.trim();
  }
  return "";
}

/**
 * カテゴリキーに対応する日本語ラベルを取得する。未知のカテゴリは「その他」にマッピングする。
 */
export function getCategoryLabel(categoryKey: string): string {
  const normalizedKey = categoryKey.toLowerCase();
  const matched = FAQ_CATEGORIES.find(
    (cat) => cat.key.toLowerCase() === normalizedKey,
  );
  return matched ? matched.label : OTHER_CATEGORY_LABEL;
}

/**
 * HTML文字列からタグを除去し、検索用プレーンテキストを生成する
 */
export function stripHtml(html: string): string {
  if (!html) {
    return "";
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 検索文字列および検索対象テキストの正規化
 * 全角・半角や英字大文字・小文字の差を吸収する
 */
export function normalizeSearchText(value: string): string {
  if (!value) {
    return "";
  }
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

/**
 * FAQ単体が検索クエリにマッチするか判定する
 */
export function matchFaq(faq: FAQContent, normalizedQuery: string): boolean {
  if (normalizedQuery === "") {
    return true;
  }

  const rawKey = extractCategoryKey(faq.category);
  const label = getCategoryLabel(rawKey);

  const normalizedQuestion = normalizeSearchText(faq.question);
  const normalizedAnswer = normalizeSearchText(stripHtml(faq.answer));
  const normalizedLabel = normalizeSearchText(label);
  const normalizedKey = normalizeSearchText(rawKey);

  return (
    normalizedQuestion.includes(normalizedQuery) ||
    normalizedAnswer.includes(normalizedQuery) ||
    normalizedLabel.includes(normalizedQuery) ||
    normalizedKey.includes(normalizedQuery)
  );
}

/**
 * FAQ一覧を検索・フィルタリングし、カテゴリ順にグルーピングする
 *
 * @param faqs FAQ全件リスト
 * @param searchQuery 検索キーワード（未指定または空文字の場合は全件）
 * @returns グルーピングされたFAQカテゴリの配列
 */
export function filterAndGroupFaqs(
  faqs: FAQContent[],
  searchQuery?: string,
): GroupedFaqCategory[] {
  const normalizedQuery = normalizeSearchText(searchQuery ?? "");
  const isSearching = normalizedQuery.length > 0;

  // 各定義済みカテゴリのマップを初期化
  const categoryMap = new Map<string, FAQContent[]>();
  for (const cat of FAQ_CATEGORIES) {
    categoryMap.set(cat.key, []);
  }
  const otherItems: FAQContent[] = [];

  for (const faq of faqs) {
    if (isSearching && !matchFaq(faq, normalizedQuery)) {
      continue;
    }

    const rawKey = extractCategoryKey(faq.category);
    const matchedCategory = FAQ_CATEGORIES.find(
      (cat) => cat.key.toLowerCase() === rawKey.toLowerCase(),
    );

    if (matchedCategory) {
      categoryMap.get(matchedCategory.key)?.push(faq);
    } else {
      otherItems.push(faq);
    }
  }

  const result: GroupedFaqCategory[] = [];

  // 固定8カテゴリを順番通りに追加
  for (const cat of FAQ_CATEGORIES) {
    const items = categoryMap.get(cat.key) ?? [];
    // 検索時は該当件数が0件のカテゴリは除外する
    if (!isSearching || items.length > 0) {
      result.push({
        key: cat.key,
        label: cat.label,
        items,
      });
    }
  }

  // 「その他」カテゴリに対象項目がある場合に追加
  if (otherItems.length > 0) {
    result.push({
      key: OTHER_CATEGORY_KEY,
      label: OTHER_CATEGORY_LABEL,
      items: otherItems,
    });
  }

  return result;
}

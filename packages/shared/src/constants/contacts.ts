export const CONTACT_CATEGORIES = [
  "一般的なお問い合わせ",
  "機能の要望・提案",
  "不具合・障害の報告",
  "セキュリティに関するご報告",
  "その他",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

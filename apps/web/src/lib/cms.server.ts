import { createClient } from "microcms-js-sdk";
import { env } from "@/env/server";

// microCMSの共通レスポンス型
export type MicroCMSBase = {
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  revisedAt: string;
};

// FAQのカテゴリ型定義（microCMSのセレクト/参照フィールドまたは文字列）
export type FAQCategoryField =
  | {
      id?: string;
      name: string;
    }
  | string;

// FAQの型定義
export type FAQContent = {
  id: string;
  slug: string;
  question: string;
  answer: string; // リッチテキスト（HTML文字列）
  category: FAQCategoryField;
} & MicroCMSBase;

// 利用規約・プライバシーポリシー（オブジェクト形式）の型定義
export type LegalContent = {
  terms: string;
  privacy: string;
  published_at: string;
} & MicroCMSBase;

// お知らせ（News / Info）の型定義
export type NewsContent = {
  id: string;
  slug: string;
  title: string;
  content: string; // リッチテキスト（HTML文字列）
  published_at?: string; // microCMSカスタム日時フィールド
  thumbnail?: {
    url: string;
    width: number;
    height: number;
  };
} & MicroCMSBase;

export type InfoContent = NewsContent;

// サーバーサイドでのみ初期化されるクライアント
export const microCmsClient = createClient({
  serviceDomain: env.MICROCMS_SERVICE_DOMAIN,
  apiKey: env.MICROCMS_API_KEY,
});

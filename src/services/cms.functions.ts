import { createServerFn } from "@tanstack/react-start";
import {
  type FAQContent,
  type LegalContent,
  microCmsClient,
} from "@/lib/cms.server";

/**
 * FAQ一覧を取得するサーバー関数
 */
export const fetchFaqsServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const response = await microCmsClient.getList<FAQContent>({
        endpoint: "faq",
        queries: { limit: 100, orders: "createdAt" },
      });
      return response.contents;
    } catch (error) {
      console.error("Failed to fetch FAQs from microCMS:", error);
      throw new Error("FAQの取得に失敗しました");
    }
  },
);

/**
 * 利用規約・プライバシーポリシーを取得するサーバー関数
 */
export const fetchLegalServer = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const response = await microCmsClient.getObject<LegalContent>({
        endpoint: "legal",
      });
      return response;
    } catch (error) {
      console.error("Failed to fetch Legal contents from microCMS:", error);
      throw new Error("リーガル情報の取得に失敗しました");
    }
  },
);

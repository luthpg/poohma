import { createServerFn } from "@tanstack/react-start";
import {
	type FAQContent,
	type LegalContent,
	microCmsClient,
	type NewsContent,
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

/**
 * お知らせ一覧のパラメータ（limit, offset）を検証・正規化する
 * limit: 1〜50 の整数（デフォルト 20）
 * offset: 0 以上の整数（デフォルト 0）
 */
export const normalizeNewsListParams = (d?: {
	limit?: number;
	offset?: number;
}): { limit: number; offset: number } => {
	const rawLimit = d?.limit;
	const rawOffset = d?.offset;

	const limit =
		rawLimit != null && Number.isFinite(rawLimit)
			? Math.min(Math.max(1, Math.floor(rawLimit)), 50)
			: 20;

	const offset =
		rawOffset != null && Number.isFinite(rawOffset)
			? Math.max(0, Math.floor(rawOffset))
			: 0;

	return { limit, offset };
};

/**
 * お知らせ一覧を取得するサーバー関数
 */
export const fetchNewsListServer = createServerFn({ method: "GET" })
	.validator(normalizeNewsListParams)
	.handler(async ({ data }) => {
		try {
			const response = await microCmsClient.getList<NewsContent>({
				endpoint: "info",
				queries: {
					limit: data?.limit ?? 20,
					offset: data?.offset ?? 0,
					orders: "-publishedAt,-createdAt",
				},
			});
			return response;
		} catch (error) {
			console.error("Failed to fetch news list from microCMS:", error);
			throw new Error("お知らせ一覧の取得に失敗しました");
		}
	});

/**
 * microCMSのcontentIdが有効な単一パスセグメントであるかを検証する
 * パストラバーサルを防ぐため、/, \, %, ., .. などの文字を含む場合は無効とする
 */
export const isValidContentId = (id: unknown): id is string => {
	if (typeof id !== "string" || !id.trim()) {
		return false;
	}
	// /, \, %, . を含む文字列（.. を含むパストラバーサル等）を拒否
	if (/[/\\%.\p{Cc}\p{Zl}\p{Zp}]/u.test(id)) {
		return false;
	}
	return true;
};

/**
 * お知らせ詳細を取得するサーバー関数
 */
export const fetchNewsDetailServer = createServerFn({ method: "GET" })
	.validator((id: string) => {
		if (!isValidContentId(id)) {
			throw new Error("無効なコンテンツIDです");
		}
		return id;
	})
	.handler(async ({ data: id }) => {
		try {
			const response = await microCmsClient.getListDetail<NewsContent>({
				endpoint: "info",
				contentId: id,
			});
			return response;
		} catch (error) {
			console.error(
				`Failed to fetch news detail (${id}) from microCMS:`,
				error,
			);
			throw new Error("お知らせ詳細の取得に失敗しました");
		}
	});

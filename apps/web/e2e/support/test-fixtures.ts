import { type BrowserContext, expect, test as baseTest } from "@playwright/test";

/**
 * 自社ドメイン（baseURL）宛てのリクエストにのみ保護バイパスヘッダーを付与する。
 * Google Identity Toolkit などの外部サービスへカスタムヘッダーが漏洩して
 * CORS preflight（OPTIONS）でブロックされるのを防ぐ。
 */
export async function setupProtectionBypass(
	context: BrowserContext,
	baseURL?: string,
) {
	const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
	const cfId = process.env.CF_ACCESS_CLIENT_ID;
	const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;

	if (!bypassSecret && (!cfId || !cfSecret)) {
		return;
	}

	const targetOrigin = baseURL ? new URL(baseURL).origin : "";

	await context.route("**/*", async (route) => {
		const request = route.request();
		const requestUrl = request.url();

		// 自社ドメイン宛てのリクエストのみバイパスヘッダーを追加
		if (targetOrigin && new URL(requestUrl).origin === targetOrigin) {
			const headers = {
				...request.headers(),
				...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {}),
				...(cfId && cfSecret
					? {
							"CF-Access-Client-Id": cfId,
							"CF-Access-Client-Secret": cfSecret,
						}
					: {}),
			};
			await route.continue({ headers });
		} else {
			await route.continue();
		}
	});
}

export const test = baseTest.extend({
	page: async ({ page, context, baseURL }, use) => {
		await setupProtectionBypass(context, baseURL);
		await use(page);
	},
});

export { expect };

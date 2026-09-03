import { expect, test } from "@playwright/test";

test.describe("認証済みルートのアクセス検証", () => {
	test("ログイン済み状態でアクセスでき、認証済み画面（/dashboard または /family）が表示される", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		// 家族所属時は /dashboard、未所属時は /family へルーティングされる
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 15000 });
		await expect(page).toHaveURL(/.*(\/dashboard|\/family)/);
		await expect(page.locator("body")).toBeVisible();
	});
});

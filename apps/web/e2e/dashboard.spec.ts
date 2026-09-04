import { expect, test } from "./support/test-fixtures";

test.describe("認証済みルートのアクセス検証", () => {
	test("ログイン済み状態でアクセスでき、認証済みUI（ダッシュボードまたは家族管理）が完全に描画される", async ({
		page,
	}) => {
		await page.goto("/dashboard");

		// 家族所属時は /dashboard、未所属時は /family へルーティングされる
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
		await expect(page).toHaveURL(/.*(\/dashboard|\/family)/);

		// コンポーネントが描画され、見出しまたはメインコンテンツが表示されること
		const mainContent = page.locator("main, h1, h2").first();
		await expect(mainContent).toBeVisible({ timeout: 15000 });
	});

	test("ログイン済み状態で /login にアクセスした際、認証済み画面へ自動リダイレクトされる", async ({
		page,
	}) => {
		await page.goto("/login");

		// 認証済みガードにより /dashboard または /family へリダイレクトされること
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
		await expect(page).toHaveURL(/.*(\/dashboard|\/family)/);
	});
});


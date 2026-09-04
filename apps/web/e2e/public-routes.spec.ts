import { expect, test } from "./support/test-fixtures";

test.describe("未認証公開ルートの検証", () => {
	test("LP（トップページ）が正常に表示され、メイン要素とログインリンクが存在する", async ({
		page,
	}) => {
		await page.goto("/");
		await expect(page).toHaveURL("/");

		// メイン見出し（h1）が表示されること
		const heading = page.locator("h1");
		await expect(heading).toBeVisible({ timeout: 15000 });
		await expect(heading).toContainText("パスワード");

		// ログインへの導線ボタンが存在すること
		const loginButton = page
			.locator("a[href='/login'], button:has-text('使ってみる')")
			.first();
		await expect(loginButton).toBeVisible();
	});

	test("利用規約ページが正常に表示される", async ({ page }) => {
		await page.goto("/terms-of-service");
		await expect(page).toHaveURL(/\/terms-of-service/);
		await expect(
			page.locator("h1, h2").filter({ hasText: "利用規約" }),
		).toBeVisible({ timeout: 15000 });
	});

	test("プライバシーポリシーページが正常に表示される", async ({ page }) => {
		await page.goto("/privacy-policy");
		await expect(page).toHaveURL(/\/privacy-policy/);
		await expect(
			page.locator("h1:has-text('プライバシーポリシー')"),
		).toBeVisible({ timeout: 15000 });
	});

	test("未認証状態で /dashboard にアクセスした際、/login へリダイレクトされる", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		// 未認証ガードにより /login へリダイレクトされることを検証
		await expect(page).toHaveURL(/.*\/login/, { timeout: 20000 });
		await expect(
			page.locator("button:has-text('Googleでログイン'), h1:has-text('PoohMa')").first(),
		).toBeVisible({ timeout: 15000 });
	});

	test("未認証状態で /family にアクセスした際、/login へリダイレクトされる", async ({
		page,
	}) => {
		await page.goto("/family");
		await expect(page).toHaveURL(/.*\/login/, { timeout: 20000 });
	});
});

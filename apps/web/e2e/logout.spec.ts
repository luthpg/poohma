import { expect, test } from "./support/test-fixtures";

test.describe("ログアウトフローの検証", () => {
	test("ログアウトを実行するとセッションが破棄され、未認証状態になる", async ({
		page,
	}) => {
		// 1. 認証済み画面（/dashboard または /family）へアクセス
		await page.goto("/family");
		await expect(page).toHaveURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });

		// 2. ログアウトボタンを待機してクリック
		const logoutButton = page
			.locator("button:has-text('ログアウト')")
			.first();
		await expect(logoutButton).toBeVisible({ timeout: 15000 });
		await logoutButton.click();

		// ダイアログが出た場合（UserMenu等の場合）は確認ボタンをクリック
		const confirmDialogButton = page
			.locator("[role='alertdialog'] button:has-text('ログアウト')")
			.first();
		if (await confirmDialogButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await confirmDialogButton.click();
		}

		// 3. ログアウト完了後、トップページ（/）またはログイン画面（/login）へ遷移することを待機
		await page.waitForURL(
			(url) => url.pathname === "/" || url.pathname === "/login",
			{ timeout: 20000 },
		);

		// 4. セッションが破棄されたことを確認するため、再度 /family へ直接アクセス
		await page.goto("/family");
		// 認証ガードにより /login へリダイレクトされることを確認
		await page.waitForURL((url) => url.pathname === "/login", {
			timeout: 20000,
		});
		await expect(page).toHaveURL(/.*\/login/);
	});
});

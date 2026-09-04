import { expect, test } from "./support/test-fixtures";

test.describe("ログアウトフローの検証", () => {
	test("ログアウトを実行するとセッションが破棄され、未認証状態になる", async ({
		page,
	}) => {
		test.setTimeout(60_000);

		// 1. 認証済み画面（/dashboard または /family）へアクセス
		await page.goto("/family");
		await expect(page).toHaveURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });

		// 2. ログアウト操作を実行（画面直下ボタン、またはUserMenuアバターからのドロップダウン）
		const directLogout = page.locator("button:has-text('ログアウト')").first();
		const hasDirectLogout = await directLogout
			.isVisible({ timeout: 3000 })
			.catch(() => false);

		if (hasDirectLogout) {
			await directLogout.click();
		} else {
			// 家族所属時など画面上に直接ボタンがない場合は AppHeader の UserMenu を開く
			const userMenuTrigger = page
				.locator('[data-testid="user-menu-trigger"]')
				.filter({ visible: true })
				.first();
			await userMenuTrigger.waitFor({ state: "visible", timeout: 15000 });
			await userMenuTrigger.click();

			const menuLogout = page
				.locator(
					'[role="menuitem"]:has-text("ログアウト"), button:has-text("ログアウト")',
				)
				.first();
			await menuLogout.waitFor({ state: "visible", timeout: 5000 });
			await menuLogout.click();
		}

		// ダイアログが出た場合（UserMenu等の場合）は確認ボタンをクリック
		const confirmDialogButton = page
			.locator("[role='alertdialog'] button:has-text('ログアウト')")
			.first();
		if (await confirmDialogButton.isVisible({ timeout: 3000 }).catch(() => false)) {
			await confirmDialogButton.click();
		}

		// 3. ログアウト完了後、トップページ（/）またはログイン画面（/login）へ遷移することを待機
		await page.waitForURL(
			(url) => url.pathname === "/" || url.pathname === "/login",
			{ timeout: 20000 },
		);
		await page.waitForLoadState("domcontentloaded");

		// 4. セッションが破棄されたことを確認するため、再度 /family へ直接アクセス
		await page.goto("/family", { waitUntil: "domcontentloaded" });
		// 認証ガードにより /login へリダイレクトされることを確認
		await page.waitForURL((url) => url.pathname === "/login", {
			timeout: 20000,
		});
		await expect(page).toHaveURL(/.*\/login/);
	});
});

import { expect, test } from "./support/test-fixtures";

test.describe("設定画面のアクセスと表示検証", () => {
	test("ログイン済みアカウントで /settings にアクセスした際、設定画面または関連UIが正常に描画される", async ({
		page,
	}) => {
		await page.goto("/settings");

		// /settings またはリダイレクト先（/family 等）のURLへ到達すること
		await expect(page).toHaveURL(/.*(\/settings|\/family)/, { timeout: 20000 });

		// 設定画面の主要UI（見出し、フォーム、または入力項目）が表示されること
		const contentElement = page
			.locator("h1, h2, form, input#display-name-input, main")
			.first();
		await expect(contentElement).toBeVisible({ timeout: 30000 });
	});
});

import { expect, test } from "./support/test-fixtures";

test.describe("設定画面のアクセスと表示検証", () => {
	test("ログイン済みアカウントで /settings にアクセスした際、設定画面または関連UIが正常に描画される", async ({
		page,
	}) => {
		page.on("console", (msg) => {
			console.log(`[Browser Console ${msg.type()}] ${msg.text()}`);
		});

		await page.goto("/settings");
		console.log("[Settings Test] Current URL after goto:", page.url());

		// URLの安定化を待機
		await page.waitForTimeout(2000);
		console.log("[Settings Test] Current URL after 2s:", page.url());

		// /settings またはリダイレクト先（/family 等）のURLへ到達すること
		await expect(page).toHaveURL(/.*(\/settings|\/family)/, { timeout: 20000 });

		// 設定画面の主要UI（見出し、フォーム、または入力項目）が表示されること
		const contentElement = page
			.locator("h1, h2, form, input#display-name-input, main, [role='main']")
			.first();
		
		try {
			await expect(contentElement).toBeVisible({ timeout: 20000 });
		} catch (error) {
			console.log("[Settings Test] Final URL on failure:", page.url());
			console.log("[Settings Test] Body text:", await page.locator("body").innerText().catch(() => "N/A"));
			throw error;
		}
	});
});

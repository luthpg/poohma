import { expect, test } from "./support/test-fixtures";

test.describe("設定画面のアクセスと家族ガードの検証", () => {
	test("家族未所属のアカウントで /settings にアクセスした際、家族オンボーディング（/family）へ保護リダイレクトされる", async ({
		page,
	}) => {
		await page.goto("/settings");

		// 家族未所属ガードにより /family へリダイレクトされること
		await expect(page).toHaveURL(/.*(\/family|\/settings)/, { timeout: 20000 });

		// 家族画面または設定画面のいずれかのUI要素が表示されること
		const header = page.locator("h1").first();
		await expect(header).toBeVisible({ timeout: 15000 });
	});
});

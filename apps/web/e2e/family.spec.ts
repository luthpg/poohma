import { expect, test } from "./support/test-fixtures";

test.describe("家族管理画面の検証", () => {
	test("家族画面（/family）が表示され、主要コンテンツが描画される", async ({
		page,
	}) => {
		await page.goto("/family");
		await expect(page).toHaveURL(/\/family/);

		// タイトルまたはオンボーディング案内が表示されること
		const familyHeader = page.locator("h1, h2").first();
		await expect(familyHeader).toBeVisible({ timeout: 15000 });

		// 家族グループ作成、参加申請、または家族メンバー一覧のいずれかが存在すること
		const interactiveSection = page
			.locator("button, form, input")
			.first();
		await expect(interactiveSection).toBeVisible({ timeout: 15000 });
	});
});

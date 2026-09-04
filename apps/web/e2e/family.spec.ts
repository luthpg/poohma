import { expect, test } from "./support/test-fixtures";

test.describe("家族管理画面の検証", () => {
	test("家族画面（/family）が表示され、主要コンテンツが描画される", async ({
		page,
	}) => {
		await page.goto("/family");
		await expect(page).toHaveURL(/\/family/);

		// 家族管理の主要見出しが描画されること
		const familyHeading = page.getByRole("heading", { name: "家族管理" }).first();
		await expect(familyHeading).toBeVisible({ timeout: 15000 });

		// 家族管理セクション、新規グループ作成入力、または参加申請導線のいずれかが描画されること
		const familyManagerSection = page.locator('[data-testid="family-manager-section"]');
		const createFamilyInput = page.locator("input#family-name-input");
		const joinRequestSection = page.getByRole("button", { name: /申請|参加|招待/ });

		await expect(
			familyManagerSection.or(createFamilyInput).or(joinRequestSection).first(),
		).toBeVisible({ timeout: 15000 });
	});
});

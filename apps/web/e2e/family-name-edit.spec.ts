import { ensureOnboardingCompleted } from "./support/ensure-onboarding";
import { expect, test } from "./support/test-fixtures";

test.describe("家族グループ名の変更機能 (Issue #177)", () => {
  test("ファミリー管理者が家族管理画面から家族グループ名を変更・キャンセルできること", async ({
    page,
  }) => {
    // 1. /family へアクセス
    await page.goto("/family");
    await page.waitForURL(/.*\/family/, { timeout: 20000 });
    await ensureOnboardingCompleted(page);

    // 家族未所属の場合は家族グループを作成
    const familyCreateInput = page.locator("input#family-name-input");
    const isUnassigned = await familyCreateInput
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (isUnassigned) {
      const passcode =
        process.env.E2E_FAMILY_PASSCODE || "PoohMa#Secure2026!Pass";
      await familyCreateInput.fill("E2Eテスト家族");
      await page.locator("input#family-passcode-input").fill(passcode);
      await page.locator("input#family-passcode-confirm-input").fill(passcode);
      await page
        .locator('button[type="submit"]')
        .filter({ hasText: "作成する" })
        .click();
      await expect(
        page.locator('[data-testid="family-manager-section"]'),
      ).toBeVisible({ timeout: 25000 });
    }

    // 2. 家族管理セクションと現在の家族名を確認
    const familySection = page.locator(
      '[data-testid="family-manager-section"]',
    );
    await expect(familySection).toBeVisible({ timeout: 15000 });

    const nameHeading = page.locator('[data-testid="family-name-heading"]');
    await expect(nameHeading).toBeVisible({ timeout: 10000 });
    const initialName = (await nameHeading.textContent())?.trim() || "";
    expect(initialName.length).toBeGreaterThan(0);

    // 3. 「名前を変更」ボタンをクリックして編集モードに入る
    const editBtn = page.locator('[data-testid="edit-family-name-btn"]');
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    const nameInput = page.locator('[data-testid="family-name-edit-input"]');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await expect(nameInput).toHaveValue(initialName);

    // 4. キャンセル操作の検証
    await nameInput.fill("キャンセルされる名前");
    const cancelBtn = page.locator('[data-testid="cancel-family-name-btn"]');
    await cancelBtn.click();

    // 編集モードが閉じ、元の名前が表示されていること
    await expect(nameInput).not.toBeVisible();
    await expect(nameHeading).toBeVisible();
    await expect(nameHeading).toHaveText(initialName);

    // 5. 名前変更の保存操作の検証
    await editBtn.click();
    await expect(nameInput).toBeVisible({ timeout: 5000 });

    const newFamilyName = `更新家族_${Date.now().toString().slice(-4)}`;
    await nameInput.fill(newFamilyName);

    const saveBtn = page.locator('[data-testid="save-family-name-btn"]');
    await saveBtn.click();

    // 成功トーストと新しい名前の表示を確認
    await expect(page.locator("text=家族名を変更しました").first()).toBeVisible(
      { timeout: 10000 },
    );
    await expect(nameHeading).toHaveText(newFamilyName, { timeout: 10000 });

    // 6. ページをリロードしても新しい家族名が維持されていること（永続化の検証）
    await page.reload();
    await page.waitForURL(/.*\/family/, { timeout: 15000 });
    await ensureOnboardingCompleted(page);
    await expect(nameHeading).toHaveText(newFamilyName, { timeout: 10000 });

    // 7. クリーンアップ：元の名前に戻しておく
    await editBtn.click();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill(initialName);
    await saveBtn.click();
    await expect(page.locator("text=家族名を変更しました").first()).toBeVisible(
      { timeout: 10000 },
    );
    await expect(nameHeading).toHaveText(initialName, { timeout: 10000 });
  });
});

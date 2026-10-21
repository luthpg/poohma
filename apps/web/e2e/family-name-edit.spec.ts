import { ensureFamilyAssigned, expect, test } from "./support/test-fixtures";

test.describe("家族グループ名の変更機能 (Issue #177)", () => {
  test("ファミリー管理者が家族管理画面から家族グループ名を変更・キャンセルできること", async ({
    page,
  }) => {
    // 1. /family へアクセスし、家族所属状態を状態待機で確定（未所属なら即座に作成）
    await ensureFamilyAssigned(page, "E2Eテスト家族");

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

    try {
      await saveBtn.click();

      // 成功トーストと新しい名前の表示を確認
      await expect(
        page.locator("text=家族名を変更しました").first(),
      ).toBeVisible({ timeout: 10000 });
      await expect(nameHeading).toHaveText(newFamilyName, { timeout: 10000 });

      // 6. ページをリロードしても新しい家族名が維持されていること（永続化の検証）
      await page.reload();
      await page.waitForURL(/.*\/family/, { timeout: 15000 });
      await expect(nameHeading).toHaveText(newFamilyName, { timeout: 10000 });
    } finally {
      // 7. クリーンアップ：元の名前に戻しておく
      if (await editBtn.isVisible()) {
        await editBtn.click();
        if (await nameInput.isVisible()) {
          await nameInput.fill(initialName);
          await saveBtn.click();
          await expect(
            page.locator("text=家族名を変更しました").first(),
          ).toBeVisible({ timeout: 10000 });
          await expect(nameHeading).toHaveText(initialName, { timeout: 10000 });
        }
      }
    }
  });
});

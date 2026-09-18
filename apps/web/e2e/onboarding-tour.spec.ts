import type { Page } from "@playwright/test";
import { ensureOnboardingCompleted } from "./support/ensure-onboarding";
import { expect, test } from "./support/test-fixtures";

/**
 * テスト専用の独立したサブアカウントを作成し、他テストとの状態干渉を防止
 */
async function createTestAccount(
  page: Page,
  accountName: string,
): Promise<void> {
  await page.goto("/family");
  await expect(page).toHaveURL(/.*\/family/, { timeout: 20000 });

  // 既存のモーダルがあればスキップ
  await ensureOnboardingCompleted(page);

  // ① ユーザーメニューまたはアカウントスイッチャーをクリック
  const userMenuTrigger = page
    .locator('[data-testid="user-menu-trigger"]')
    .filter({ visible: true })
    .first();
  const unassignedSwitcher = page
    .locator('button:has-text("家族未所属")')
    .first();

  await expect(userMenuTrigger.or(unassignedSwitcher).first()).toBeVisible({
    timeout: 20000,
  });

  if (await userMenuTrigger.isVisible()) {
    await userMenuTrigger.click();
    const accountSubTrigger = page
      .locator('[data-slot="dropdown-menu-sub-trigger"]')
      .or(page.locator('button:has-text("切替")'))
      .first();
    await expect(accountSubTrigger).toBeVisible({ timeout: 5000 });
    await accountSubTrigger.click();
  } else {
    await expect(unassignedSwitcher).toBeVisible({ timeout: 15000 });
    await unassignedSwitcher.click();
  }

  // ② サブメニュー内の「新しいアカウントを作成」をクリック
  const createBtn = page
    .locator(
      '[role="menuitem"]:has-text("新しいアカウントを作成"), button:has-text("新しいアカウントを作成")',
    )
    .filter({ visible: true })
    .first();
  await expect(createBtn).toBeVisible({ timeout: 5000 });
  await createBtn.click();

  // ③ アカウント作成ダイアログへの入力と送信
  const nameInput = page.locator("input#create-account-name-input").first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(accountName);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

/**
 * 家族グループを作成
 */
async function createTestFamily(
  page: Page,
  familyName: string,
  passcode: string,
): Promise<void> {
  const familyCreateInput = page.locator("input#family-name-input");
  const familyManagerSection = page.locator(
    '[data-testid="family-manager-section"]',
  );
  await expect(familyCreateInput).toBeVisible({ timeout: 25000 });
  await familyCreateInput.fill(familyName);
  await page.locator("input#family-passcode-input").fill(passcode);
  await page.locator("input#family-passcode-confirm-input").fill(passcode);

  const submitCreateBtn = page
    .locator('button[type="submit"]')
    .filter({ hasText: "作成する" });
  await submitCreateBtn.click();

  await expect(familyManagerSection).toBeVisible({ timeout: 25000 });
}

test.describe("オンボーディングツアーの画面間遷移検証", () => {
  test("サンプルデータ投入からダッシュボードツアー（前半）、詳細画面ツアー、ダッシュボードツアー（後半）を経て完了できること", async ({
    page,
  }) => {
    const passcode =
      process.env.E2E_FAMILY_PASSCODE || "PoohMa#Secure2026!Pass";

    // 1. 他テストと干渉しない独立したアカウント・家族を準備
    await createTestAccount(page, "ツアー検証ユーザー");
    await createTestFamily(page, "ツアー検証家族", passcode);

    // 2. 家族作成直後にヘッダーロゴにダッシュボード誘導ツアーが表示されることを検証！
    const tourPopover = page.locator(".driver-popover, .poohma-tour-popover");
    await expect(tourPopover).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=家族グループができました！")).toBeVisible({
      timeout: 5000,
    });
    // サブボタン「このまま家族設定を見る」が活性状態で表示されていること
    const stayBtn = page.locator(
      ".driver-popover-prev-btn:has-text('このまま家族設定を見る')",
    );
    await expect(stayBtn).toBeVisible({ timeout: 5000 });
    await expect(stayBtn).toBeEnabled();

    // 「ダッシュボードへ移動する」をクリックしてダッシュボードへ進む
    const toDashboardBtn = page.locator(".driver-popover-done-btn");
    await expect(toDashboardBtn).toBeVisible({ timeout: 5000 });
    await toDashboardBtn.click();

    // 3. /dashboard へ到達（新規家族なので初回オンボーディングが確実に発動）
    await page.waitForURL(/.*\/dashboard.*onboarding=modal.*/, {
      timeout: 15000,
    });

    // 3. オンボーディングモーダルの「サンプルデータで体験してみる」をクリック
    const startTourBtn = page.getByRole("button", {
      name: "サンプルデータで体験してみる",
    });
    await expect(startTourBtn).toBeVisible({ timeout: 10000 });
    await startTourBtn.click();

    // パスコードロック解除モーダルが表示されたらパスコードを入力
    const passcodeInput = page.locator('input[placeholder="パスコード"]');
    const isUnlockModalVisible = await passcodeInput
      .waitFor({ state: "visible", timeout: 4000 })
      .then(() => true)
      .catch(() => false);

    if (isUnlockModalVisible) {
      await passcodeInput.fill(passcode);
      await page
        .locator('button[type="submit"]')
        .filter({ hasText: "ロック解除" })
        .click();
    }

    // 4. ダッシュボードツアー（前半）のポップオーバーが表示されることを待機
    await expect(tourPopover).toBeVisible({ timeout: 15000 });

    // 前半 Step 1（スライド）：「次へ」をクリック
    const part1NextBtn = page.locator(".driver-popover-next-btn");
    await expect(part1NextBtn).toBeVisible({ timeout: 5000 });
    await part1NextBtn.click();

    // 前半 Step 2（スポットライト）：「詳細画面へ」ボタンをクリック
    const toDetailBtn = page
      .locator(".driver-popover-done-btn, .driver-popover-next-btn")
      .first();
    await expect(toDetailBtn).toBeVisible({ timeout: 5000 });
    await toDetailBtn.click();

    // 5. 詳細画面に到達していることを確認
    await page.waitForURL(/.*\/records\/.*/, { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/records\/.*onboarding=detail.*/);

    // 6. 詳細画面でツアー（スライド・スポットライト）が起動していることを検証！
    await expect(tourPopover).toBeVisible({ timeout: 10000 });

    // 詳細 Step 1（スライド）：「次へ」をクリック
    const detailNextBtn1 = page.locator(".driver-popover-next-btn");
    await expect(detailNextBtn1).toBeVisible({ timeout: 5000 });
    await detailNextBtn1.click();

    // 詳細 Step 2（スポットライト: ヒント表示ボタン「ためしにカギを開けてみましょう！」）が表示されていること
    await expect(tourPopover).toBeVisible({ timeout: 5000 });
    const hintRevealBtn = page.locator('[data-tour="hint-reveal-btn"]').first();
    await expect(hintRevealBtn).toBeVisible({ timeout: 5000 });

    // ★重要: 「🔒 クリックして表示」ボタンを押した瞬間にツアーモーダルが自動的に閉じること！
    await hintRevealBtn.click();
    await expect(tourPopover).toBeHidden({ timeout: 5000 });

    // 復号されたヒント（テキスト）が画面に表示されること
    const hintText = page
      .locator("text=柴犬の名前")
      .or(page.locator("text=本体底面ラベルシール"))
      .first();
    await expect(hintText).toBeVisible({ timeout: 10000 });

    // 復号完了後、少し余韻を置いて帰還ツアー Step 1（「カギが開いてヒントが現れました！」）が自動再開すること！
    await expect(tourPopover).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("text=カギが開いてヒントが現れました！"),
    ).toBeVisible({
      timeout: 5000,
    });

    // 帰還編 Step 1：「次へ進む」をクリック
    const returnNextBtn = page.locator(".driver-popover-next-btn");
    await expect(returnNextBtn).toBeVisible({ timeout: 5000 });
    await returnNextBtn.click();

    // 帰還編 Step 2（戻るボタン案内）：「ダッシュボードへ戻る」ボタンをクリック
    const backToDashboardBtn = page
      .locator(".driver-popover-done-btn, .driver-popover-next-btn")
      .first();
    await expect(backToDashboardBtn).toBeVisible({ timeout: 5000 });
    await backToDashboardBtn.click();

    // 7. ダッシュボードへ戻り、後半ツアー（?onboarding=part2）が起動することを確認
    await page.waitForURL(/.*\/dashboard.*onboarding=part2.*/, {
      timeout: 15000,
    });
    await expect(tourPopover).toBeVisible({ timeout: 10000 });

    // 後半 Step 1（スライド）：「次へ」をクリック
    const part2NextBtn = page.locator(".driver-popover-next-btn");
    await expect(part2NextBtn).toBeVisible({ timeout: 5000 });
    await part2NextBtn.click();

    // 後半 Step 2（スポットライト: user-menu お守りシート案内）：「次へ」をクリック
    await expect(tourPopover).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=お守りシートの発行場所")).toBeVisible({
      timeout: 5000,
    });
    const userMenuNextBtn = page.locator(".driver-popover-next-btn");
    await expect(userMenuNextBtn).toBeVisible({ timeout: 5000 });
    await userMenuNextBtn.click();

    // 後半 Step 3（スポットライト: add-record 新規登録案内）：「ツアーを完了する」をクリック
    await expect(tourPopover).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=さあ、使ってみましょう！")).toBeVisible({
      timeout: 5000,
    });
    const completeBtn = page
      .locator(".driver-popover-done-btn, .driver-popover-next-btn")
      .first();
    await expect(completeBtn).toBeVisible({ timeout: 5000 });
    await completeBtn.click();

    // 8. ツアーが終了し、ポップオーバーが消えることを確認
    await expect(tourPopover).toBeHidden({ timeout: 10000 });

    // ダッシュボードURLから onboarding クエリが除去されていること
    await expect(page).toHaveURL(/.*\/dashboard(?!\?.*onboarding).*/);

    // 9. 完了直後にポップオーバーが再表示されないことを待機して検証（再表示バグの回帰防止）
    await page.waitForTimeout(2000);
    await expect(tourPopover).toBeHidden();

    // 10. ページをリロードしてもツアーが再起動しないこと
    await page.reload();
    await page.waitForURL(/.*\/dashboard/, { timeout: 10000 });
    await expect(tourPopover).toBeHidden();
  });

  test("家族作成後に「このまま家族設定を見る」をクリックすると活性状態のボタンでツアーが閉じ、/family にとどまること", async ({
    page,
  }) => {
    const passcode =
      process.env.E2E_FAMILY_PASSCODE || "PoohMa#Secure2026!Pass";

    await createTestAccount(page, "家族設定残留検証ユーザー");
    await createTestFamily(page, "家族設定残留検証家族", passcode);

    const tourPopover = page.locator(".driver-popover, .poohma-tour-popover");
    await expect(tourPopover).toBeVisible({ timeout: 10000 });

    const stayBtn = page.locator(
      ".driver-popover-prev-btn:has-text('このまま家族設定を見る')",
    );
    await expect(stayBtn).toBeVisible({ timeout: 5000 });
    await expect(stayBtn).toBeEnabled();

    // クリックするとツアーが閉じ、/familyにとどまる
    await stayBtn.click();
    await expect(tourPopover).toBeHidden({ timeout: 5000 });
    await expect(page).toHaveURL(/.*\/family.*/);
    await expect(page.locator("h1:has-text('家族管理')")).toBeVisible();
  });
});

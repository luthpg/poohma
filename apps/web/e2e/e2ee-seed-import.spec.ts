import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { ensureOnboardingCompleted } from "./support/ensure-onboarding";
import {
  cleanupTestAccount,
  createTestAccount,
  createTestFamily,
  expect,
  test,
} from "./support/test-fixtures";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const SEED_CSV_PATH = path.join(
  dirname,
  "fixtures/seed_value_user1_20260904.csv",
);

const BULK_VISIBILITY_CSV_CONTENT = [
  "Title,URL,Memo,OwnerType,Admins,Tags,Label1,LoginID1,PasswordHint1",
  "一括検証サービスA,,メモA,user,,,メイン,user_a@example.com,ヒントA",
  "一括検証サービスB,,メモB,user,,,メイン,user_b@example.com,ヒントB",
  "一括検証サービスC,,メモC,user,,,メイン,user_c@example.com,ヒントC",
].join("\n");

// =============================================================================
// Helper Functions (責務ごとに分離されたE2EE・データ操作ヘルパー)
// =============================================================================

/**
 * 画面上のレコード一覧からレコードID配列を抽出
 */
async function getRecordIds(page: Page): Promise<string[]> {
  return page
    .locator('a[href^="/records/"]')
    .evaluateAll((links) => [
      ...new Set(
        links
          .map((link) => link.getAttribute("href")?.split("/").pop())
          .filter((id): id is string => Boolean(id)),
      ),
    ]);
}

type CsvInputSource =
  | string
  | {
      name: string;
      mimeType: string;
      buffer: Buffer;
    };

/**
 * CSVファイルをアップロードし、クライアント側E2EE暗号化とConvexへの一括保存を実行
 */
async function importCsvSeed(
  page: Page,
  familyName: string,
  csvSource: CsvInputSource,
  passcode: string,
  options?: { verifyFamilyNameInMenu?: boolean },
): Promise<string[]> {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

  // オンボーディングモーダルが表示された場合はスキップして消えるまで待機
  await ensureOnboardingCompleted(page);

  if (options?.verifyFamilyNameInMenu !== false) {
    // ① ユーザーメニューを開いて家族名を確認
    const userMenuTrigger = page
      .locator('[data-testid="user-menu-trigger"]')
      .filter({ visible: true })
      .first();
    await expect(userMenuTrigger).toBeVisible({ timeout: 25000 });
    await userMenuTrigger.click();

    // 家族グループ名が表示されることを確認
    await expect(
      page.getByText(familyName, { exact: true }).first(),
    ).toBeVisible({
      timeout: 20000,
    });

    // 確認が終わったらメニューを閉じる
    await page.keyboard.press("Escape");
  }

  const recordIdsBeforeImport = new Set(await getRecordIds(page));

  // ② /settings/bulk 画面へ移動して一括インポートを実行
  await page.goto("/settings/bulk");
  await expect(page).toHaveURL(/.*\/settings\/bulk/, { timeout: 20000 });

  const fileInput = page.locator('[data-testid="csv-bulk-file-input"]');
  await fileInput.waitFor({ state: "attached", timeout: 30000 });
  await fileInput.setInputFiles(csvSource);

  const unlockInput = page.locator('input[placeholder="パスコード"]');
  const previewContainer = page.locator(
    '[data-testid="csv-import-preview-container"]',
  );

  // アンロックプロンプトまたは差分プレビューのいずれかが表示されるまで状態待機（15秒空振り待ちを防止）
  await expect(unlockInput.or(previewContainer).first()).toBeVisible({
    timeout: 30000,
  });

  if (await unlockInput.isVisible()) {
    await unlockInput.fill(passcode);
    const unlockBtn = page.locator('button:has-text("ロック解除")');
    if (await unlockBtn.isVisible()) {
      await unlockBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }
  }

  // 差分プレビューコンテナの表示待機
  await expect(previewContainer).toBeVisible({ timeout: 30000 });

  // 「反映する」ボタンをクリック
  const applyBtn = page.locator('[data-testid="apply-import-diff-button"]');
  await expect(applyBtn).toBeEnabled({ timeout: 15000 });
  await applyBtn.click();

  // クライアント側暗号化と保存完了を待機（トーストまたは完了画面）
  const successIndicator = page
    .locator(
      "text=/(インポートが完了しました|インポート完了|データを反映しました)/",
    )
    .first();
  await expect(successIndicator).toBeVisible({ timeout: 120000 });

  // ダッシュボードへ戻り、レコード一覧の反映を待機
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

  // レコード一覧の更新をポーリング待機して、新しく追加されたレコードIDを返す
  let newlyImportedIds: string[] = [];
  await expect
    .poll(
      async () => {
        const currentIds = await getRecordIds(page);
        newlyImportedIds = currentIds.filter(
          (id) => !recordIdsBeforeImport.has(id),
        );
        return newlyImportedIds.length;
      },
      {
        message: "CSVインポート後のレコード反映待機",
        timeout: 15000,
        intervals: [300, 700, 1500],
      },
    )
    .toBeGreaterThan(0);

  return newlyImportedIds;
}

/**
 * レコード詳細画面に遷移し、E2EE暗号化された秘密情報（ヒント）が正常に復号されることを検証
 */
async function verifyRecordDecryption(
  page: Page,
  recordTitle: string,
  expectedHint: string,
  passcode: string,
): Promise<void> {
  // インポートされたレコードカードを探索して詳細へ遷移
  const recordCard = page.locator(`text="${recordTitle}"`).first();
  await expect(recordCard).toBeVisible({ timeout: 25000 });
  await recordCard.click();
  await expect(page).toHaveURL(/.*\/records\/.+/, { timeout: 15000 });

  // ヒント表示ボタン（🔒 クリックして表示）をクリック
  const revealBtn = page
    .locator('button:has-text("🔒 クリックして表示")')
    .first();
  await revealBtn.waitFor({ state: "visible", timeout: 20000 });
  await revealBtn.click();

  const modalUnlockInput = page.locator('input[placeholder="パスコード"]');
  const decryptedHint = page.locator(`text="${expectedHint}"`);

  // アンロックモーダルまたは復号済みヒントのいずれかが表示されるのを状態待機
  await expect(modalUnlockInput.or(decryptedHint).first()).toBeVisible({
    timeout: 15000,
  });

  if (await modalUnlockInput.isVisible()) {
    await modalUnlockInput.fill(passcode);
    const unlockBtn = page.locator('button:has-text("ロック解除")');
    if (await unlockBtn.isVisible()) {
      await unlockBtn.click();
    } else {
      await page.keyboard.press("Enter");
    }
  }

  // 暗号化されていたパスワードヒントが平文に復号されて表示されていることを検証
  await expect(decryptedHint).toBeVisible({ timeout: 15000 });
}

/**
 * 一括公開設定変更の確認ステップおよび共有・解除フローを検証
 */
async function verifyBulkVisibilityFlow(
  page: Page,
  recordIds: string[],
): Promise<void> {
  if (!page.url().includes("/dashboard")) {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });
  }

  // テスト対象レコード（最初の3件）
  const targetIds = recordIds.slice(0, 3);
  expect(targetIds.length).toBeGreaterThan(0);

  // --- 1. 一括操作モード起動とレコード選択 ---
  const bulkOpButton = page.locator('button:has-text("一括操作")').first();
  await expect(bulkOpButton).toBeVisible({ timeout: 15000 });
  await bulkOpButton.click();

  for (const recordId of targetIds) {
    const recordLink = page.locator(`a[href="/records/${recordId}"]`).first();
    await expect(recordLink).toBeVisible({ timeout: 5000 });
    await recordLink.click();
  }
  await expect(page.getByText(`${targetIds.length} 件選択中`)).toBeVisible();

  // --- 2. 公開設定モーダル起動 ---
  const visibilityTriggerBtn = page
    .locator('button:has-text("公開設定")')
    .first();
  await expect(visibilityTriggerBtn).toBeVisible({ timeout: 5000 });
  await visibilityTriggerBtn.click();

  const modal = page.locator('[data-testid="bulk-visibility-modal"]');
  await expect(modal).toBeVisible({ timeout: 5000 });
  await expect(modal.getByText("選択したレコードの共有設定")).toBeVisible();

  // --- 3. 「家族に共有」を選択して確認画面の表示検証 ---
  const shareOption = modal.locator('[data-testid="select-share-option"]');
  await expect(shareOption).toBeVisible({ timeout: 5000 });
  await shareOption.click();

  // 確認画面の要素（タイトル、変更方向、件数）を確認
  await expect(modal.getByText("家族共有への一括変更確認")).toBeVisible();
  await expect(modal.getByText("自分のみ（個人用）")).toBeVisible();
  await expect(modal.getByText("家族共有", { exact: true })).toBeVisible();
  await expect(
    modal.getByText(`${targetIds.length} 件`, { exact: true }),
  ).toBeVisible();

  // --- 4. 「戻る」ボタンの検証（キャンセル・復帰動作） ---
  const backBtn = modal.locator('[data-testid="back-to-select-button"]');
  await expect(backBtn).toBeVisible({ timeout: 5000 });
  await backBtn.click();
  await expect(modal.getByText("選択したレコードの共有設定")).toBeVisible();

  // --- 5. 再度「家族に共有」➔ 確定実行 ---
  await modal.locator('[data-testid="select-share-option"]').click();
  const confirmShareBtn = modal.locator('[data-testid="confirm-share-button"]');
  await expect(confirmShareBtn).toBeVisible({ timeout: 5000 });
  await confirmShareBtn.click();

  // 成功トーストとモーダル閉鎖の確認
  const shareSuccessToast = page.locator(
    "text=/\\d+\\s*件のレコードを家族と共有しました/",
  );
  await expect(shareSuccessToast).toBeVisible({ timeout: 20000 });
  await expect(modal).toBeHidden({ timeout: 5000 });

  // --- 6. 続けて「共有解除（自分のみ）」の確認フローを検証 ---
  // 選択モードが解除されているため再度起動
  await expect(bulkOpButton).toBeVisible({ timeout: 15000 });
  await bulkOpButton.click();

  for (const recordId of targetIds) {
    const recordLink = page.locator(`a[href="/records/${recordId}"]`).first();
    await expect(recordLink).toBeVisible({ timeout: 5000 });
    await recordLink.click();
  }
  await expect(page.getByText(`${targetIds.length} 件選択中`)).toBeVisible();

  await visibilityTriggerBtn.click();
  await expect(modal).toBeVisible({ timeout: 5000 });

  // 「自分のみ」を選択
  const unshareOption = modal.locator('[data-testid="select-unshare-option"]');
  await expect(unshareOption).toBeVisible({ timeout: 5000 });
  await unshareOption.click();

  // 確認画面（タイトル、変更方向、件数）を確認
  await expect(
    modal.getByText("共有解除（個人用）への一括変更確認"),
  ).toBeVisible();
  await expect(modal.getByText("家族共有", { exact: true })).toBeVisible();
  await expect(modal.getByText("自分のみ（個人用）")).toBeVisible();
  await expect(
    modal.getByText(`${targetIds.length} 件`, { exact: true }),
  ).toBeVisible();

  // 確定ボタンをクリック
  const confirmUnshareBtn = modal.locator(
    '[data-testid="confirm-unshare-button"]',
  );
  await expect(confirmUnshareBtn).toBeVisible({ timeout: 5000 });
  await confirmUnshareBtn.click();

  // 成功トーストとモーダル閉鎖の確認
  const unshareSuccessToast = page.locator(
    "text=/\\d+\\s*件のレコードの共有を解除しました/",
  );
  await expect(unshareSuccessToast).toBeVisible({ timeout: 20000 });
  await expect(modal).toBeHidden({ timeout: 5000 });
}

/**
 * 一括操作モードを起動し、インポートしたレコードを選択して安全に一括削除
 */
async function bulkDeleteRecords(
  page: Page,
  recordIds: string[],
): Promise<void> {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

  // 一括操作モードを起動
  const bulkOpButton = page.locator('button:has-text("一括操作")').first();
  await expect(bulkOpButton).toBeVisible({ timeout: 15000 });
  await bulkOpButton.click();

  // インポートした全レコードを選択
  for (const recordId of recordIds) {
    const recordLink = page.locator(`a[href="/records/${recordId}"]`).first();
    await expect(recordLink).toBeVisible({ timeout: 5000 });
    await recordLink.click();
  }
  await expect(page.getByText(`${recordIds.length} 件選択中`)).toBeVisible();

  // フローティングバーの「削除」ボタンをクリック
  const deleteTriggerBtn = page
    .locator('button:has-text("削除")')
    .filter({ hasText: /^削除$/ })
    .first();
  await expect(deleteTriggerBtn).toBeVisible({ timeout: 5000 });
  await deleteTriggerBtn.click();

  // 削除確認モーダルの「削除する」ボタンをクリック
  const confirmDeleteBtn = page.locator('button:has-text("削除する")').first();
  await expect(confirmDeleteBtn).toBeVisible({ timeout: 5000 });
  await confirmDeleteBtn.click();

  // 削除成功トーストを確認
  const deleteSuccessToast = page.locator(
    "text=/\\d+\\s*件のレコードを削除しました/",
  );
  await expect(deleteSuccessToast).toBeVisible({ timeout: 20000 });

  // 一覧から削除されたことを確認
  for (const recordId of recordIds) {
    await expect(page.locator(`a[href="/records/${recordId}"]`)).toHaveCount(0);
  }
}

// =============================================================================
// Test Suites (E2EE暗号化ジャーニーと一括共有フローの独立並列検証)
// =============================================================================

test.describe("E2EE主要フローとCSVインポートSeed検証", () => {
  test("家族グループ作成、CSV暗号化インポート、詳細でのヒント復号、および安全な一括削除クリーンアップ", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const runId = `seed-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    const accountName = `E2E ${runId}`;
    const familyName = `PoohMa E2E ${runId}`;

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("[Browser Console Error]", msg.text());
      }
    });
    page.on("pageerror", (err) => {
      console.error("[Browser Uncaught Error]", err);
    });

    const passcode = process.env.E2E_FAMILY_PASSCODE;
    if (!passcode) {
      throw new Error(
        "環境変数 E2E_FAMILY_PASSCODE が設定されていません。E2EEテストを実行するにはパスコードの設定が必須です。",
      );
    }

    let accountCreated = false;
    let importedRecordIds: string[] = [];

    try {
      await test.step("Step 1: 実行専用アカウントと家族グループの作成 (/family)", async () => {
        await createTestAccount(page, accountName);
        accountCreated = true;
        await createTestFamily(page, familyName, passcode);
      });

      await test.step("Step 2: CSVインポートによる暗号化Seed投入 (/dashboard)", async () => {
        importedRecordIds = await importCsvSeed(
          page,
          familyName,
          SEED_CSV_PATH,
          passcode,
        );
      });

      await test.step("Step 3: レコード詳細でのE2EE復号検証 (/records/$id)", async () => {
        await verifyRecordDecryption(
          page,
          "アップルストア",
          "アップルストアのサブ用ヒント (Sub_53!)",
          passcode,
        );
      });

      await test.step("Step 4: 一括操作モードによるインポートレコード削除 (/dashboard)", async () => {
        await bulkDeleteRecords(page, importedRecordIds);
      });
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      if (accountCreated) {
        await test.step("Step 5: テスト専用アカウントおよび家族の削除 (/settings)", async () => {
          await cleanupTestAccount(page, accountName);
        });
      }
    }
  });

  test("一括操作モードによる公開設定変更の確認ステップ・家族共有と共有解除の切り替え検証", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    const runId = `vis-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    const accountName = `E2E ${runId}`;
    const familyName = `PoohMa E2E ${runId}`;

    const passcode = process.env.E2E_FAMILY_PASSCODE;
    if (!passcode) {
      throw new Error(
        "環境変数 E2E_FAMILY_PASSCODE が設定されていません。E2EEテストを実行するにはパスコードの設定が必須です。",
      );
    }

    let accountCreated = false;
    let recordIds: string[] = [];

    try {
      await test.step("Step 1: 専用サブアカウント・家族と検証用レコード3件の準備", async () => {
        await createTestAccount(page, accountName);
        accountCreated = true;
        await createTestFamily(page, familyName, passcode);
        recordIds = await importCsvSeed(
          page,
          familyName,
          {
            name: "bulk-visibility-seed.csv",
            mimeType: "text/csv",
            buffer: Buffer.from(BULK_VISIBILITY_CSV_CONTENT, "utf-8"),
          },
          passcode,
          { verifyFamilyNameInMenu: false },
        );
      });

      await test.step("Step 2: 一括操作モードによる公開設定変更（家族共有・確認・戻る・共有解除）検証", async () => {
        await verifyBulkVisibilityFlow(page, recordIds);
      });
    } finally {
      if (accountCreated) {
        await test.step("Step 3: テスト専用アカウントおよび家族の削除 (/settings)", async () => {
          await cleanupTestAccount(page, accountName);
        });
      }
    }
  });
});

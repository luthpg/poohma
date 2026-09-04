import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/test-fixtures";

const dirname =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const SEED_CSV_PATH = path.join(
	dirname,
	"fixtures/seed_value_user1_20260904.csv",
);

// =============================================================================
// Helper Functions (責務ごとに分離されたE2EE・データ操作ヘルパー)
// =============================================================================

/**
 * 画面上のレコード一覧からレコードID配列を抽出
 */
async function getRecordIds(page: Page): Promise<string[]> {
	return page.locator('a[href^="/records/"]').evaluateAll((links) => [
		...new Set(
			links
				.map((link) => link.getAttribute("href")?.split("/").pop())
				.filter((id): id is string => Boolean(id)),
		),
	]);
}

/**
 * 実行専用のサブアカウントを作成し、アクティブアカウントとして設定
 */
async function createTestAccount(page: Page, accountName: string): Promise<void> {
	await page.goto("/family");
	await expect(page).toHaveURL(/.*\/family/, { timeout: 20000 });

	const accountSwitcher = page
		.locator('[data-slot="dropdown-menu-trigger"]')
		.first();
	await expect(accountSwitcher).toBeVisible({ timeout: 25000 });
	await accountSwitcher.click();
	await page.getByText("新しいアカウントを作成", { exact: true }).click();
	await page.locator("input#account-name").fill(accountName);
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "作成する", exact: true })
		.click();
}

/**
 * 家族グループを作成し、Master Key / KEK を生成してグループ管理画面が表示されることを確認
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

	// 家族作成後、家族管理セクションが表示されるまで待機して完了を確認
	await expect(familyManagerSection).toBeVisible({ timeout: 25000 });
}

/**
 * CSVファイルをアップロードし、クライアント側E2EE暗号化とConvexへの一括保存を実行
 */
async function importCsvSeed(
	page: Page,
	familyName: string,
	csvPath: string,
	passcode: string,
): Promise<string[]> {
	await page.goto("/dashboard");
	await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

	// 家族グループ情報がロードされ、ヘッダーに反映されるまで待機
	await expect(page.getByText(familyName, { exact: true }).first()).toBeVisible({
		timeout: 20000,
	});
	const recordIdsBeforeImport = new Set(await getRecordIds(page));

	// CSVファイル入力要素（hidden要素のためattachedを待機）
	const fileInput = page.locator('[data-testid="csv-file-input"]');
	await fileInput.waitFor({ state: "attached", timeout: 30000 });
	await fileInput.setInputFiles(csvPath);

	// アンロックプロンプトが表示された場合はパスコードを入力して解除
	const unlockInput = page.locator('input[placeholder="パスコード"]');
	try {
		await unlockInput.waitFor({ state: "visible", timeout: 15000 });
		await unlockInput.fill(passcode);
		const unlockBtn = page.locator('button:has-text("ロック解除")');
		if (await unlockBtn.isVisible()) {
			await unlockBtn.click();
		} else {
			await page.keyboard.press("Enter");
		}
	} catch {
		// プロンプトが表示されなかった（既にアンロック状態）場合はスキップ
	}

	// クライアント側（Web Crypto API）暗号化とConvex保存の完了トーストを待機（最大120秒）
	const successToast = page.locator("text=/\\d+件のデータをインポートしました/");
	await expect(successToast).toBeVisible({ timeout: 120000 });

	// レコード一覧の更新を待機して、新しく追加されたレコードIDを返す
	await page.waitForTimeout(2000);
	const newlyImportedIds = (await getRecordIds(page)).filter(
		(id) => !recordIdsBeforeImport.has(id),
	);
	expect(newlyImportedIds.length).toBeGreaterThan(0);
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
	await expect(recordCard).toBeVisible({ timeout: 20000 });
	await recordCard.click();
	await expect(page).toHaveURL(/.*\/records\/.+/, { timeout: 15000 });

	// ヒント表示ボタン（🔒 クリックして表示）をクリック
	const revealBtn = page
		.locator('button:has-text("🔒 クリックして表示")')
		.first();
	await revealBtn.waitFor({ state: "visible", timeout: 20000 });
	await revealBtn.click();

	// 必要に応じてアンロックモーダルに対応
	const modalUnlockInput = page.locator('input[placeholder="パスコード"]');
	try {
		await modalUnlockInput.waitFor({ state: "visible", timeout: 3000 });
		await modalUnlockInput.fill(passcode);
		const unlockBtn = page.locator('button:has-text("ロック解除")');
		if (await unlockBtn.isVisible()) {
			await unlockBtn.click();
		} else {
			await page.keyboard.press("Enter");
		}
	} catch {
		// アンロックモーダルが表示されなかった場合はスキップ
	}

	// 暗号化されていたパスワードヒントが平文に復号されて表示されていることを検証
	const decryptedHint = page.locator(`text="${expectedHint}"`);
	await expect(decryptedHint).toBeVisible({ timeout: 15000 });
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
	const confirmDeleteBtn = page
		.locator('button:has-text("削除する")')
		.first();
	await expect(confirmDeleteBtn).toBeVisible({ timeout: 5000 });
	await confirmDeleteBtn.click();

	// 削除成功トーストを確認
	const deleteSuccessToast = page.locator(
		"text=/\\d+\\s*件のレコードを削除しました/",
	);
	await expect(deleteSuccessToast).toBeVisible({ timeout: 20000 });

	// 一覧から削除されたことを確認
	for (const recordId of recordIds) {
		await expect(
			page.locator(`a[href="/records/${recordId}"]`),
		).toHaveCount(0);
	}
}

/**
 * テスト専用アカウントおよび所属家族を削除してクリーンアップ
 */
async function cleanupTestAccount(
	page: Page,
	accountName: string,
): Promise<void> {
	try {
		await page.goto("/settings");
		await page.waitForLoadState("domcontentloaded");

		// 現在のアカウントが作成したテスト専用アカウントでない場合は切り替える
		const switcher = page.locator('[data-slot="dropdown-menu-trigger"]').first();
		if (await switcher.isVisible({ timeout: 5000 }).catch(() => false)) {
			const currentText = await switcher.innerText().catch(() => "");
			if (!currentText.includes(accountName)) {
				await switcher.click();
				const targetItem = page
					.locator('[role="menuitem"]')
					.filter({ hasText: accountName })
					.first();
				if (await targetItem.isVisible({ timeout: 5000 }).catch(() => false)) {
					await targetItem.click();
					await page.waitForLoadState("domcontentloaded");
					await page.waitForTimeout(1000);
				}
			}
		}

		// アカウント削除ボタンが表示されるまで待機（Convexアカウント一覧のロード待ち）
		const deleteAccountButton = page
			.getByRole("button", { name: /のみ削除/ })
			.first();
		const isVisible = await deleteAccountButton
			.waitFor({ state: "visible", timeout: 25000 })
			.then(() => true)
			.catch(() => false);

		if (isVisible) {
			await deleteAccountButton.click();
			const confirmBtn = page
				.getByRole("alertdialog")
				.getByRole("button", { name: "削除する", exact: true });
			await confirmBtn.waitFor({ state: "visible", timeout: 5000 });
			await confirmBtn.click();
			await expect(
				page.getByText("アカウントを削除しました").first(),
			).toBeVisible({
				timeout: 15000,
			});
		} else {
			console.warn(
				`[Cleanup Warning] アカウント削除ボタンが見つかりませんでした (accountName: ${accountName}, currentURL: ${page.url()})`,
			);
		}
	} catch (cleanupError) {
		console.warn(
			`[Cleanup Error] テスト専用アカウント（${accountName}）の削除処理でエラーが発生しました (currentURL: ${page.url()}):`,
			cleanupError,
		);
	}
}

// =============================================================================
// Test Suites (E2EE暗号化ジャーニーの段階的検証)
// =============================================================================

test.describe("E2EE主要フローとCSVインポートSeed検証", () => {
	// 家族作成→CSVインポート→E2EE復号→一括削除を一貫で実行する統合ジャーニーテスト。
	// CI・ローカル問わず35件のOGPフェッチ・暗号化処理等で時間がかかるため
	// テストタイムアウトを180秒に設定。
	test("家族グループ作成、CSV暗号化インポート、詳細でのヒント復号、および安全な一括削除クリーンアップ", async (
		{ page },
		testInfo,
	) => {
		test.setTimeout(180_000);
		const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
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

		// 家族パスコード環境変数の検証（デフォルト値なし。未設定なら即座にテストを落とす）
		const passcode = process.env.E2E_FAMILY_PASSCODE;
		if (!passcode) {
			throw new Error(
				"環境変数 E2E_FAMILY_PASSCODE が設定されていません。E2EEテストを実行するにはパスコードの設定が必須です。",
			);
		}

		let accountCreated = false;
		let importedRecordIds: string[] = [];

		try {
			// =====================================================================
			// Step 1: E2EE関連データのセットアップ (アカウント作成・家族作成・KEK生成)
			// =====================================================================
			await test.step("Step 1: 実行専用アカウントと家族グループの作成 (/family)", async () => {
				await createTestAccount(page, accountName);
				accountCreated = true;
				await createTestFamily(page, familyName, passcode);
			});

			// =====================================================================
			// Step 2: CSVインポートとクライアント暗号化 (Web Crypto API による暗号化保存)
			// =====================================================================
			await test.step("Step 2: CSVインポートによる暗号化Seed投入 (/dashboard)", async () => {
				importedRecordIds = await importCsvSeed(
					page,
					familyName,
					SEED_CSV_PATH,
					passcode,
				);
			});

			// =====================================================================
			// Step 3: レコード詳細でのパスコードアンロックとヒント復号検証
			// =====================================================================
			await test.step("Step 3: レコード詳細でのE2EE復号検証 (/records/$id)", async () => {
				await verifyRecordDecryption(
					page,
					"アップルストア",
					"アップルストアのサブ用ヒント (Sub_53!)",
					passcode,
				);
			});

			// =====================================================================
			// Step 4: 一括操作モードによるインポートレコード削除
			// =====================================================================
			await test.step("Step 4: 一括操作モードによるインポートレコード削除 (/dashboard)", async () => {
				await bulkDeleteRecords(page, importedRecordIds);
			});
		} finally {
			// =====================================================================
			// Step 5: クリーンアップ (テスト成否にかかわらず実行専用アカウントを削除)
			// =====================================================================
			if (accountCreated) {
				await test.step("Step 5: テスト専用アカウントおよび家族の削除 (/settings)", async () => {
					await cleanupTestAccount(page, accountName);
				});
			}
		}
	});
});

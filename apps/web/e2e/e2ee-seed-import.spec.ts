import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./support/test-fixtures";

const dirname =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const SEED_CSV_PATH = path.join(
	dirname,
	"fixtures/seed_value_user1_20260904.csv",
);

test.describe("E2EE主要フローとCSVインポートSeed検証", () => {
	// 家族作成→CSVインポート→E2EE復号→一括削除を一貫で実行する複合テスト。
	// CI上のステージング環境ではネットワーク遅延・暗号化処理等で時間がかかるため
	// テストタイムアウトを120秒に設定。
	test("家族グループ作成、CSV暗号化インポート、詳細でのヒント復号、および安全な一括削除クリーンアップ", async ({
		page,
	}) => {
		test.setTimeout(120_000);

		// 家族パスコード環境変数の検証（デフォルト値なし。未設定なら即座にテストを落とす）
		const passcode = process.env.E2E_FAMILY_PASSCODE;
		if (!passcode) {
			throw new Error(
				"環境変数 E2E_FAMILY_PASSCODE が設定されていません。E2EEテストを実行するにはパスコードの設定が必須です。",
			);
		}

		// ==========================================
		// Phase 1: 家族グループ作成とMaster Key生成 (/family)
		// ==========================================
		await page.goto("/family");
		await expect(page).toHaveURL(/.*\/family/, { timeout: 20000 });

		// 家族グループが未作成（作成フォームが表示されている）かどうかを判定
		const familyNameInput = page.locator("input#family-name-input");
		const hasCreateForm = await familyNameInput
			.isVisible({ timeout: 5000 })
			.catch(() => false);

		if (hasCreateForm) {
			// 家族グループ作成（Master Key 生成 & wrap）
			await familyNameInput.fill("PoohMa E2E Family");
			await page.locator("input#family-passcode-input").fill(passcode);
			await page.locator("input#family-passcode-confirm-input").fill(passcode);

			const submitCreateBtn = page
				.locator('button[type="submit"]')
				.filter({ hasText: "作成する" });
			await submitCreateBtn.click();

			// 作成成功トーストまたは画面更新（招待コード領域または家族名表示）を待機
			await expect(
				page.locator("text=家族グループを作成しました。"),
			).toBeVisible({ timeout: 15000 });
		}

		// ==========================================
		// Phase 2: CSVインポートによる暗号化Seed投入 (/dashboard)
		// ==========================================
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

		// ダッシュボードのコンテンツがレンダリングされるまで待機
		// UserMenu内のfile inputはページ完全描画後にDOMに追加される
		await page
			.locator("main, header, [role='main']")
			.first()
			.waitFor({ state: "visible", timeout: 15000 });

		// CSVファイル入力要素（data-testidで安定的に取得）
		const fileInput = page.locator('[data-testid="csv-file-input"]');

		// 要素がDOMにアタッチされるまで待機（hidden要素のためvisibleではなくattachedを使う）
		await fileInput.waitFor({ state: "attached", timeout: 15000 });
		await fileInput.setInputFiles(SEED_CSV_PATH);

		// アンロックプロンプトが表示された場合はパスコードを入力して解除
		const unlockInput = page.locator('input[placeholder="パスコード"]');
		const isPromptVisible = await unlockInput
			.isVisible({ timeout: 4000 })
			.catch(() => false);
		if (isPromptVisible) {
			await unlockInput.fill(passcode);
			await page.keyboard.press("Enter");
		}

		// クライアント側（Web Crypto API）暗号化とConvexへの一括保存完了トーストを待機（最大60秒）
		const successToast = page.locator("text=/\\d+件のデータをインポートしました/");
		await expect(successToast).toBeVisible({ timeout: 60000 });

		// レコード一覧の更新を待機
		await page.waitForTimeout(2000);

		// ==========================================
		// Phase 3: レコード詳細でのE2EE復号検証 (/records/$id)
		// ==========================================
		// インポートされた「アップルストア」のレコードカードを探索
		const appleStoreCard = page
			.locator('text="アップルストア"')
			.first();
		await expect(appleStoreCard).toBeVisible({ timeout: 20000 });

		// レコード詳細画面へ遷移
		await appleStoreCard.click();
		await expect(page).toHaveURL(/.*\/records\/.+/, { timeout: 15000 });

		// ヒント表示ボタン（🔒 クリックして表示）が存在するか確認
		const revealBtn = page
			.locator('button:has-text("🔒 クリックして表示")')
			.first();
		const hasRevealBtn = await revealBtn
			.isVisible({ timeout: 5000 })
			.catch(() => false);

		if (hasRevealBtn) {
			await revealBtn.click();

			// 必要に応じてアンロックモーダルに対応
			const modalUnlockInput = page.locator('input[placeholder="パスコード"]');
			const isModalVisible = await modalUnlockInput
				.isVisible({ timeout: 3000 })
				.catch(() => false);
			if (isModalVisible) {
				await modalUnlockInput.fill(passcode);
				await page.keyboard.press("Enter");
			}
		}

		// 暗号化されていたパスワードヒントが平文に復号されて表示されていることを検証
		const decryptedHint = page.locator(
			'text="アップルストアのサブ用ヒント (Sub_53!)"',
		);
		await expect(decryptedHint).toBeVisible({ timeout: 15000 });

		// ==========================================
		// Phase 4: テストデータの安全なクリーンアップ (/dashboard)
		// ==========================================
		// 他家族のデータを壊さず、テストユーザーのレコードのみを一括削除
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

		// 一括操作モードを起動
		const bulkOpButton = page
			.locator('button:has-text("一括操作")')
			.first();
		await expect(bulkOpButton).toBeVisible({ timeout: 15000 });
		await bulkOpButton.click();

		// 「すべて選択」チェックボックスをクリック
		const selectAllLabel = page.locator('label:has-text("すべて選択")');
		await expect(selectAllLabel).toBeVisible({ timeout: 5000 });
		await selectAllLabel.click();

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

		// レコードが 0 件になったことを確認（初期空状態メッセージが表示される）
		await expect(
			page.locator("text=まだ登録されたサービスはありません。"),
		).toBeVisible({ timeout: 15000 });
	});
});

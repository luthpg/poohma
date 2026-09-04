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
	// CI・ローカル問わず35件のOGPフェッチ・暗号化処理等で時間がかかるため
	// テストタイムアウトを180秒に設定。
	test("家族グループ作成、CSV暗号化インポート、詳細でのヒント復号、および安全な一括削除クリーンアップ", async ({
		page,
	}) => {
		test.setTimeout(180_000);

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

		// ==========================================
		// Phase 1: 家族グループ作成とMaster Key生成 (/family)
		// ==========================================
		await page.goto("/family");
		await expect(page).toHaveURL(/.*\/family/, { timeout: 20000 });

		// 家族グループ作成フォームまたは既存家族管理セクションのいずれかが表示されるまで確実に待機
		// （ページ読み込み中のスケルトン/ローディング完了を待つ）
		const familyCreateInput = page.locator("input#family-name-input");
		const familyManagerSection = page.locator(
			'[data-testid="family-manager-section"]',
		);

		await expect(
			familyCreateInput.or(familyManagerSection),
		).toBeVisible({ timeout: 25000 });

		// 家族未作成（作成フォームが表示されている）の場合は家族を作成
		if (await familyCreateInput.isVisible()) {
			await familyCreateInput.fill("PoohMa E2E Family");
			await page.locator("input#family-passcode-input").fill(passcode);
			await page.locator("input#family-passcode-confirm-input").fill(passcode);

			const submitCreateBtn = page
				.locator('button[type="submit"]')
				.filter({ hasText: "作成する" });
			await submitCreateBtn.click();

			// 家族作成後、家族管理セクションが表示されるまで待機してグループ作成完了を確定
			await expect(familyManagerSection).toBeVisible({ timeout: 20000 });
		}

		// ==========================================
		// Phase 2: CSVインポートによる暗号化Seed投入 (/dashboard)
		// ==========================================
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 20000 });

		// 家族グループ情報がロードされ、ヘッダーに反映されるまで待機（アカウント同期の完了を保証）
		await expect(page.locator("text=PoohMa E2E Family")).toBeVisible({
			timeout: 20000,
		});

		// CSVファイル入力要素（data-testidで安定的に取得）
		const fileInput = page.locator('[data-testid="csv-file-input"]');

		// 要素がDOMにアタッチされるまで待機（hidden要素のためvisibleではなくattachedを使う）
		// UserMenu内のfile inputはページ完全描画後にDOMに追加されるため十分なタイムアウトを設定
		await fileInput.waitFor({ state: "attached", timeout: 30000 });
		await fileInput.setInputFiles(SEED_CSV_PATH);

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

		// クライアント側（Web Crypto API）暗号化とConvexへの一括保存完了トーストを待機（最大120秒）
		const successToast = page.locator("text=/\\d+件のデータをインポートしました/");
		await expect(successToast).toBeVisible({ timeout: 120000 });

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

		// ヒント表示ボタン（🔒 クリックして表示）が表示されるまで待機してクリック
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

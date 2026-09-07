import type { Page } from "@playwright/test";

/**
 * E2Eテスト用ヘルパー:
 * オンボーディングモーダルが表示されている場合、確実にスキップして
 * モーダルが画面から完全に消えるまで待機する。
 */
export async function ensureOnboardingCompleted(page: Page): Promise<void> {
	const modalTitle = page.locator("text=PoohMaへようこそ！");
	const skipButton = page.getByRole("button", {
		name: "スキップして空のまま始める",
	});
	const closeButton = page.getByRole("button", { name: "スキップ" }); // 右上バツボタン

	// 開いているメニューやドロップダウンがあれば Escape で閉じておく
	await page.keyboard.press("Escape").catch(() => {});

	try {
		// モーダルのタイトルまたはスキップボタンが表示されるか待機
		const isModalVisible = await modalTitle
			.waitFor({ state: "visible", timeout: 7000 })
			.then(() => true)
			.catch(() => false);

		if (isModalVisible) {
			// スキップボタンをクリック（もし押せなければ右上のバツボタンをフォールバック）
			if (await skipButton.isVisible()) {
				await skipButton.click({ force: true });
			} else if (await closeButton.isVisible()) {
				await closeButton.click({ force: true });
			}

			// Convex Mutation の完了とモーダルの消失を確実に待機（最大15秒）
			await modalTitle.waitFor({ state: "hidden", timeout: 15000 });
			// モーダル背景のバックロップアニメーション完了待ち
			await page.waitForTimeout(500);
		}
	} catch (err) {
		console.warn("[ensureOnboardingCompleted] モーダル消去待機中に警告:", err);
		// 万が一残っていた場合は Escape で閉じるのを試みる
		await page.keyboard.press("Escape").catch(() => {});
	}
}

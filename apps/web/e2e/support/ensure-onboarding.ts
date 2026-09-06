import type { Page } from "@playwright/test";

/**
 * E2Eテスト用ヘルパー:
 * オンボーディングモーダルが表示されている場合、または表示された場合に
 * 「スキップして空のまま始める」をクリックしてオンボーディング完了（onboardingVersion: 1）状態にする。
 * すでに完了済みでモーダルが出ない場合はタイムアウトを待たずに素早く通過する。
 */
export async function ensureOnboardingCompleted(page: Page): Promise<void> {
	try {
		const skipButton = page.getByRole("button", {
			name: "スキップして空のまま始める",
		});
		// モーダルが表示されているか、あるいはフェッチ完了で表示されるまで短時間待機
		const isVisible = await skipButton
			.waitFor({ state: "visible", timeout: 2500 })
			.then(() => true)
			.catch(() => false);

		if (isVisible) {
			await skipButton.click({ force: true });
			await skipButton.waitFor({ state: "hidden", timeout: 5000 });
		}
	} catch {
		// モーダルが表示されていない（既にオンボーディング完了済み）場合は素早く通過
	}
}

import type { Page } from "@playwright/test";

// Page インスタンスに完了キャッシュフラグを保持
const completedPages = new WeakSet<Page>();

/**
 * E2Eテスト用ヘルパー:
 * オンボーディングモーダルが表示されている場合、確実にスキップして
 * モーダルが画面から完全に消えるまで待機する。
 */
export async function ensureOnboardingCompleted(page: Page): Promise<void> {
  if (completedPages.has(page)) {
    return;
  }

  const modalTitle = page.locator("text=PoohMaへようこそ！");
  const isModalVisible = await modalTitle
    .waitFor({ state: "visible", timeout: 1200 })
    .then(() => true)
    .catch(() => false);

  if (isModalVisible) {
    const skipButton = page.getByRole("button", {
      name: "スキップして空のまま始める",
    });
    const closeButton = page.getByRole("button", { name: "スキップ" });

    if (await skipButton.isVisible()) {
      await skipButton.click({ force: true });
    } else if (await closeButton.isVisible()) {
      await closeButton.click({ force: true });
    }
    await modalTitle.waitFor({ state: "hidden", timeout: 5000 });
  }

  completedPages.add(page);
}

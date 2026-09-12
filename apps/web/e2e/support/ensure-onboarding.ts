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
  const closeButton = page.getByRole("button", { name: "スキップ" });

  try {
    await modalTitle.waitFor({ state: "visible", timeout: 4000 });
    if (await skipButton.isVisible()) {
      await skipButton.click({ force: true });
    } else if (await closeButton.isVisible()) {
      await closeButton.click({ force: true });
    }
    await modalTitle.waitFor({ state: "hidden", timeout: 8000 });
  } catch {
    // すでにスキップ済みでモーダルが表示されなかった場合はスルー
  }
}

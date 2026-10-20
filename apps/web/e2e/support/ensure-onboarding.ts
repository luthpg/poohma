import { errors, type Page } from "@playwright/test";

/**
 * E2Eテスト用ヘルパー:
 * ダッシュボード上でオンボーディングモーダルが表示されている場合、確実にスキップして
 * モーダルが画面から完全に消えるまで待機する。
 *
 * - `/dashboard` 以外のルートでは OnboardingModal は描画されないため即時 return する。
 * - `/dashboard` ではレコード取得完了（`[data-testid="record-count"]` 描画）またはモーダル表示を
 *   状態待機し、不要な 4 秒タイムアウトの空振り待ちを発生させない。
 */
export async function ensureOnboardingCompleted(page: Page): Promise<void> {
  if (!page.url().includes("/dashboard")) {
    return;
  }

  const modalTitle = page.locator("text=PoohMaへようこそ！");
  const recordCount = page.locator('[data-testid="record-count"]');
  const skipButton = page.getByRole("button", {
    name: "スキップして空のまま始める",
  });
  const closeButton = page.getByRole("button", { name: "スキップ" });

  // 1. レコード読み込み完了（record-count 表示）またはモーダル表示のいずれかを待機
  try {
    await modalTitle
      .or(recordCount)
      .first()
      .waitFor({ state: "visible", timeout: 10000 });
  } catch (error) {
    if (error instanceof errors.TimeoutError) {
      return;
    }
    throw error;
  }

  // 2. record-count が先に描画された場合でも、同一レンダーサイクル直後の useEffect で
  //    モーダルが開くケース（新規家族初回訪問・?onboarding=modal）を短時間待機で捕捉
  if (!(await modalTitle.isVisible())) {
    const waitMs = page.url().includes("onboarding=modal") ? 4000 : 400;
    try {
      await modalTitle.waitFor({ state: "visible", timeout: waitMs });
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return;
      }
      throw error;
    }
  }

  if (await skipButton.isVisible()) {
    await skipButton.click({ force: true });
  } else if (await closeButton.isVisible()) {
    await closeButton.click({ force: true });
  }
  await modalTitle.waitFor({ state: "hidden", timeout: 8000 });
}

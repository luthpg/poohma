import { ensureOnboardingCompleted } from "./support/ensure-onboarding";
import { expect, test } from "./support/test-fixtures";

test.describe("認証済みルートのアクセス検証", () => {
  test("ログイン済み状態でアクセスでき、認証済みUI（ダッシュボードまたは家族管理）が完全に描画される", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // 家族所属時は /dashboard、未所属時は /family へルーティングされる
    await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
    await expect(page).toHaveURL(/.*(\/dashboard|\/family)/);

    // オンボーディングモーダルが表示された場合はスキップして完了済みにする
    await ensureOnboardingCompleted(page);

    // コンポーネントが描画され、メインコンテンツまたはヘッダーが表示されること
    const mainContent = page
      .locator(
        "main, h1, header, input[placeholder*='検索'], [data-testid='family-manager-section']",
      )
      .first();
    await expect(mainContent).toBeVisible({ timeout: 15000 });
  });

  test("ログイン済み状態で /login にアクセスした際、認証済み画面へ自動リダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/login");

    // 認証済みガードにより /dashboard または /family へリダイレクトされること
    await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
    await expect(page).toHaveURL(/.*(\/dashboard|\/family)/);
  });

  test("画面遷移（/dashboard ⇄ 他画面）を繰り返しても React child エラーが発生せず正常に描画され続けること", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 1. まず /family にアクセスして家族所属状態を確認・準備
    await page.goto("/family");
    await page.waitForURL(/.*\/family/, { timeout: 20000 });
    await ensureOnboardingCompleted(page);

    // 家族未所属の場合は家族グループを作成
    const familyCreateInput = page.locator("input#family-name-input");
    const isUnassigned = await familyCreateInput
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (isUnassigned) {
      const passcode =
        process.env.E2E_FAMILY_PASSCODE || "PoohMa#Secure2026!Pass";
      await familyCreateInput.fill("E2Eテスト家族");
      await page.locator("input#family-passcode-input").fill(passcode);
      await page.locator("input#family-passcode-confirm-input").fill(passcode);
      await page
        .locator('button[type="submit"]')
        .filter({ hasText: "作成する" })
        .click();
      await expect(
        page.locator('[data-testid="family-manager-section"]'),
      ).toBeVisible({ timeout: 25000 });
    }

    // 2. /dashboard へアクセスして初期表示を確認
    await page.goto("/dashboard");
    await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
    await ensureOnboardingCompleted(page);

    // ダッシュボードと他画面の間でソフト遷移（SPAナビゲーション）および直接ナビゲーションを複数回往復
    const routesToVisit = ["/family", "/settings", "/family", "/settings"];

    for (const targetRoute of routesToVisit) {
      // 1. 他画面へ移動
      await page.goto(targetRoute);
      await page.waitForURL(new RegExp(`.*${targetRoute}`), { timeout: 15000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 10000 });

      if (targetRoute === "/family") {
        const familyElement = page
          .getByRole("heading", { name: "家族管理" })
          .or(page.locator('[data-testid="family-manager-section"]'))
          .first();
        await expect(familyElement).toBeVisible({ timeout: 10000 });
      } else if (targetRoute === "/settings") {
        const settingsElement = page.locator("input#display-name-input");
        await expect(settingsElement).toBeVisible({ timeout: 10000 });
      }

      // 2. ヘッダーのロゴリンクをクリックして /dashboard へ SPA ソフト遷移
      const logoLink = page.locator('header a[href="/dashboard"]').first();
      await expect(logoLink).toBeVisible({ timeout: 10000 });
      await logoLink.click();

      await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });

      // ダッシュボードの主要コンテンツ（検索バーまたはレコード一覧または空状態）が正常描画されていること
      const dashboardElement = page
        .locator(
          "input[placeholder*='検索'], [data-testid='record-count'], [data-tour='tag-cloud']",
        )
        .first();
      await expect(dashboardElement).toBeVisible({ timeout: 10000 });
    }

    // Minified React error #31 や Objects are not valid as a React child が発生していないことを保証
    const allErrors = [...pageErrors, ...consoleErrors];
    const reactChildErrors = allErrors.filter(
      (e) =>
        e.includes("Objects are not valid as a React child") ||
        e.includes("Minified React error #31"),
    );
    expect(reactChildErrors).toHaveLength(0);
  });

  test("アカウント登録フォーム（/records/new）で、ログインID・パスワードヒント・ラベルが縦配置で正しく描画・操作できること", async ({
    page,
  }) => {
    await page.goto("/records/new");
    await page.waitForURL(/.*\/records\/new/, { timeout: 20000 });
    await ensureOnboardingCompleted(page);

    // アンロックプロンプトが表示された場合はパスコードを入力して解除
    const unlockInput = page.locator('input[placeholder="パスコード"]');
    try {
      if (await unlockInput.isVisible({ timeout: 5000 })) {
        const passcode =
          process.env.E2E_FAMILY_PASSCODE || "PoohMa#Secure2026!Pass";
        await unlockInput.fill(passcode);
        const unlockBtn = page.locator('button:has-text("ロック解除")');
        if (await unlockBtn.isVisible()) {
          await unlockBtn.click();
        } else {
          await page.keyboard.press("Enter");
        }
        await expect(unlockInput).not.toBeVisible({ timeout: 10000 });
      }
    } catch {
      // 既にアンロック済みの場合はスキップ
    }

    // 1. 主要項目の入力欄が表示され、補助ラベル欄はデフォルトで折りたたまれていること
    const loginIdInput = page.locator("input#login-id-input-0");
    const hintInput = page.locator("input#pw-hint-input-0");
    const labelInput = page.locator("input#label-input-0");

    await expect(loginIdInput).toBeVisible({ timeout: 10000 });
    await expect(hintInput).toBeVisible({ timeout: 10000 });
    await expect(labelInput).not.toBeVisible();

    // 2. パスワードヒント欄に placeholder がなく、説明文が常時表示されていること
    await expect(hintInput).not.toHaveAttribute("placeholder");
    const hintDescription = page.locator("#pw-hint-description-0");
    await expect(hintDescription).toBeVisible();
    await expect(hintDescription).toContainText(
      "パスワードを思い出すための手がかりを書いてください",
    );

    // 3. 入力操作ができること（ラベル欄はトグルボタンで開いて入力）
    await loginIdInput.fill("test-user@example.com");
    await hintInput.fill("秘密のヒントメモ");

    const labelToggleBtn = page.locator('button:has-text("ラベルを設定")');
    await expect(labelToggleBtn).toBeVisible();
    await labelToggleBtn.click();
    await expect(labelInput).toBeVisible({ timeout: 5000 });
    await labelInput.fill("メインアカウント");

    await expect(loginIdInput).toHaveValue("test-user@example.com");
    await expect(hintInput).toHaveValue("秘密のヒントメモ");
    await expect(labelInput).toHaveValue("メインアカウント");

    // 4. アカウント追加と削除ができること
    const addButton = page.locator('button:has-text("+ 追加する")');
    await addButton.click();

    const secondLoginId = page.locator("input#login-id-input-1");
    await expect(secondLoginId).toBeVisible({ timeout: 10000 });

    const deleteButton = page
      .locator('button[aria-label="このアカウント情報を削除"]')
      .last();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    await expect(secondLoginId).not.toBeVisible();
  });
});

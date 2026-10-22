import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Browser,
  type BrowserContext,
  test as baseTest,
  expect,
  type Page,
  type PlaywrightTestOptions,
} from "@playwright/test";
import { ensureOnboardingCompleted } from "./ensure-onboarding";
import {
  ensureTestUserCustomToken,
  getWorkerIdentity,
  type WorkerIdentity,
} from "./ensure-test-user";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = path.resolve(dirname, "../.gen/firebase-bridge.iife.js");

/**
 * 自社ドメイン（baseURL）宛てのリクエストにのみ保護バイパスヘッダーを付与する。
 * Google Identity Toolkit などの外部サービスへカスタムヘッダーが漏洩して
 * CORS preflight（OPTIONS）でブロックされるのを防ぐ。
 */
export async function setupProtectionBypass(
  context: BrowserContext,
  baseURL?: string,
) {
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const cfId = process.env.CF_ACCESS_CLIENT_ID;
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET;

  if (!bypassSecret && (!cfId || !cfSecret)) {
    return;
  }

  const targetOrigin = baseURL ? new URL(baseURL).origin : "";

  await context.route("**/*", async (route) => {
    const request = route.request();
    const requestUrl = request.url();

    // 自社ドメイン宛てのリクエストのみバイパスヘッダーを追加
    if (targetOrigin && new URL(requestUrl).origin === targetOrigin) {
      const headers = {
        ...request.headers(),
        ...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {}),
        ...(cfId && cfSecret
          ? {
              "CF-Access-Client-Id": cfId,
              "CF-Access-Client-Secret": cfSecret,
            }
          : {}),
      };
      await route.continue({ headers });
    } else {
      await route.continue();
    }
  });
}

/**
 * 指定された WorkerIdentity のカスタムトークンを用いてブラウザでサインインし、
 * Cookie と IndexedDB を含む storageState を保存する。
 */
export async function authenticateIdentityInPage(
  page: Page,
  context: BrowserContext,
  baseURL: string | undefined,
  identity: WorkerIdentity,
): Promise<void> {
  await setupProtectionBypass(context, baseURL);

  const authDir = path.dirname(identity.storageStatePath);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const customToken = await ensureTestUserCustomToken({
    uid: identity.uid,
    email: identity.email,
    displayName: identity.displayName,
  });
  const bridgeSource = fs.readFileSync(BRIDGE_PATH, "utf-8");

  await page.goto("/login");

  await page.evaluate(
    async ({ source, config, token }) => {
      new Function(source)();
      await window.__e2eSignIn(config, token);
    },
    {
      source: bridgeSource,
      config: {
        apiKey: process.env.VITE_FIREBASE_API_KEY || "",
        projectId: process.env.VITE_FIREBASE_PROJECT_ID || "",
      },
      token: customToken,
    },
  );

  try {
    await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 15000 });
  } catch {
    await page.reload();
    await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
  }

  await page
    .locator(
      "main, header:not([data-tsd-surface]):not([aria-label*='Devtools']), [role='main']",
    )
    .first()
    .waitFor({ state: "visible", timeout: 15000 });

  await ensureOnboardingCompleted(page);

  await context.storageState({
    path: identity.storageStatePath,
    indexedDB: true,
  });
}

async function ensureWorkerStorageState(
  browser: Browser,
  baseURL: string | undefined,
  identity: WorkerIdentity,
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh && fs.existsSync(identity.storageStatePath)) {
    return identity.storageStatePath;
  }

  const baseHostname = baseURL ? new URL(baseURL).hostname : "localhost";
  const ignoreHTTPSErrors = ["localhost", "127.0.0.1", "[::1]"].includes(
    baseHostname,
  );

  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors,
  });
  const page = await context.newPage();
  try {
    await authenticateIdentityInPage(page, context, baseURL, identity);
  } finally {
    await context.close();
  }
  return identity.storageStatePath;
}

/**
 * 現在のアカウントが家族に所属していることを保証する（未所属なら即座に家族を作成）。
 * 家族所属済みの場合に5秒タイムアウト待ちが発生しないよう、複合ロケータで状態待機する。
 */
export async function ensureFamilyAssigned(
  page: Page,
  familyName = "E2Eテスト家族",
  passcode = process.env.E2E_FAMILY_PASSCODE || "PoohMa#Secure2026!Pass",
): Promise<void> {
  await page.goto("/family");
  await page.waitForURL(/.*\/family/, { timeout: 20000 });

  const familyCreateInput = page.locator("input#family-name-input");
  const familyManagerSection = page.locator(
    '[data-testid="family-manager-section"]',
  );

  await expect(familyCreateInput.or(familyManagerSection).first()).toBeVisible({
    timeout: 20000,
  });

  if (await familyCreateInput.isVisible()) {
    await familyCreateInput.fill(familyName);
    await page.locator("input#family-passcode-input").fill(passcode);
    await page.locator("input#family-passcode-confirm-input").fill(passcode);
    await page
      .locator('button[type="submit"]')
      .filter({ hasText: "作成する" })
      .click();
    await expect(familyManagerSection).toBeVisible({ timeout: 25000 });
  }
}

/**
 * テスト専用の独立したサブアカウントを作成し、アクティブアカウントとして設定する。
 */
export async function createTestAccount(
  page: Page,
  accountName: string,
): Promise<void> {
  await page.goto("/family");
  await expect(page).toHaveURL(/.*\/family/, { timeout: 20000 });

  const userMenuTrigger = page
    .locator('[data-testid="user-menu-trigger"]')
    .filter({ visible: true })
    .first();
  const unassignedSwitcher = page
    .locator('button:has-text("家族未所属")')
    .first();

  await expect(userMenuTrigger.or(unassignedSwitcher).first()).toBeVisible({
    timeout: 20000,
  });

  if (await userMenuTrigger.isVisible()) {
    await userMenuTrigger.click();
    const accountSubTrigger = page
      .locator('[data-slot="dropdown-menu-sub-trigger"]')
      .or(page.locator('button:has-text("切替")'))
      .first();
    await expect(accountSubTrigger).toBeVisible({ timeout: 5000 });
    await accountSubTrigger.click();
  } else {
    await expect(unassignedSwitcher).toBeVisible({ timeout: 15000 });
    await unassignedSwitcher.click();
  }

  const createBtn = page
    .locator(
      '[role="menuitem"]:has-text("新しいアカウントを作成"), button:has-text("新しいアカウントを作成")',
    )
    .filter({ visible: true })
    .first();
  await expect(createBtn).toBeVisible({ timeout: 5000 });
  await createBtn.click();

  const nameInput = page.locator("input#create-account-name-input").first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(accountName);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "作成する", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 10000 });
}

/**
 * 家族グループを作成し、Master Key / KEK を生成して家族管理セクションの表示まで待機する。
 */
export async function createTestFamily(
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

  await expect(familyManagerSection).toBeVisible({ timeout: 25000 });
}

/**
 * テスト専用サブアカウントおよび所属家族を /settings から削除してクリーンアップする。
 */
export async function cleanupTestAccount(
  page: Page,
  accountName: string,
): Promise<void> {
  await page.goto("/settings");
  await page.waitForLoadState("domcontentloaded");

  const currentDisplayNameInput = page.locator("input#display-name-input");
  await expect(currentDisplayNameInput).toBeVisible({ timeout: 10000 });

  const currentName = await currentDisplayNameInput.inputValue();

  if (currentName !== accountName) {
    const userMenuTrigger = page
      .locator('[data-testid="user-menu-trigger"]')
      .first();
    await expect(userMenuTrigger).toBeVisible({ timeout: 5000 });
    await userMenuTrigger.click();
    const accountSubTrigger = page
      .locator('[data-slot="dropdown-menu-sub-trigger"]')
      .or(page.locator('button:has-text("切替")'))
      .first();
    await expect(accountSubTrigger).toBeVisible({ timeout: 5000 });
    await accountSubTrigger.click();

    const targetItem = page
      .locator('[role="menuitem"], [role="button"]')
      .filter({ hasText: accountName })
      .first();

    await expect(targetItem).toBeVisible({ timeout: 5000 });
    await targetItem.click();

    await expect(currentDisplayNameInput).toHaveValue(accountName, {
      timeout: 10000,
    });
  }

  const deleteBtn = page.getByRole("button", {
    name: new RegExp(`このアカウント（${accountName}）のみ削除`),
  });
  await expect(deleteBtn).toBeVisible({ timeout: 5000 });
  await deleteBtn.click();
  const confirmInput = page.locator("input#confirm-delete-subaccount");
  await expect(confirmInput).toBeVisible({ timeout: 5000 });
  await confirmInput.fill("削除する");

  const confirmBtn = page
    .getByRole("alertdialog")
    .getByRole("button", { name: "理解した上で削除する", exact: true });
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  await confirmBtn.click();

  await expect(page.getByText("アカウントを削除しました").first()).toBeVisible({
    timeout: 15000,
  });
}

export const test = baseTest.extend<
  PlaywrightTestOptions,
  { workerStorageState: PlaywrightTestOptions["storageState"] }
>({
  storageState: ({ workerStorageState }, use) => use(workerStorageState),
  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const projectName = workerInfo.project.name;
      if (
        projectName === "public" ||
        projectName === "setup" ||
        projectName === "teardown"
      ) {
        await use({ cookies: [], origins: [] });
        return;
      }

      const role = projectName === "logout" ? "logout" : "worker";
      const identity = getWorkerIdentity(workerInfo.parallelIndex, role);
      const baseURL = workerInfo.project.use.baseURL;

      // logout はトークン失効を伴うため常に新鮮なセッションを準備し、
      // 通常ワーカーは同一ラン内の既存 storageState（W0 の e2e-user.json 等）を再利用する
      const statePath = await ensureWorkerStorageState(
        browser,
        baseURL,
        identity,
        role === "logout",
      );
      await use(statePath);
    },
    { scope: "worker" },
  ],
  page: async ({ page, context, baseURL }, use) => {
    await setupProtectionBypass(context, baseURL);
    await use(page);
  },
});

export { expect };

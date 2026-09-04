import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";
import { ensureTestUserCustomToken } from "./support/ensure-test-user";

import { setupProtectionBypass } from "./support/test-fixtures";

const dirname =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = path.join(dirname, ".auth/e2e-user.json");
const BRIDGE_PATH = path.join(dirname, ".gen/firebase-bridge.iife.js");

setup("authenticate as e2e test user", async ({ page, context, baseURL }) => {
	// 自社ドメイン限定で保護バイパスヘッダーを設定（Google等の外部APIには付与しない）
	await setupProtectionBypass(context, baseURL);

	// .auth ディレクトリの作成を保証
	const authDir = path.dirname(STORAGE_STATE);
	if (!fs.existsSync(authDir)) {
		fs.mkdirSync(authDir, { recursive: true });
	}

	const customToken = await ensureTestUserCustomToken();
	const bridgeSource = fs.readFileSync(BRIDGE_PATH, "utf-8");

	page.on("console", (msg) => {
		if (msg.type() === "error") {
			console.error("[Browser Console Error]", msg.text());
		}
	});

	await page.goto("/login");

	// CDP / evaluate 経由で独立ブリッジを実行して IndexedDB に認証状態を注入
	await page.evaluate(
		async ({ source, config, token }) => {
			// biome-ignore lint/security/noGlobalEval: E2Eブリッジの読み込み専用
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

	// サインイン後、onAuthStateChanged の完了により /dashboard または /family へ自動遷移するのを待つ
	try {
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 15000 });
	} catch {
		// 初回アクセス等で遅延した場合はリロードして再試行
		await page.reload();
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
	}

	// 画面のレンダリング完了を待機（main または header が表示されるまで）
	await page
		.locator("main, header, [role='main']")
		.first()
		.waitFor({ state: "visible", timeout: 15000 })
		.catch(() => {
			// 要素の探索がタイムアウトした場合でも続行
		});

	// Cookie と IndexedDB の双方を含めて storageState として保存
	await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
});

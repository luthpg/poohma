import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";
import { ensureTestUserCustomToken } from "./support/ensure-test-user";

const dirname =
	import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE = path.join(dirname, ".auth/e2e-user.json");
const BRIDGE_PATH = path.join(dirname, ".gen/firebase-bridge.iife.js");

setup("authenticate as e2e test user", async ({ page }) => {
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
	// 始まらない場合はリロードしてアプリ側の初期化を起動
	try {
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 10000 });
	} catch {
		await page.reload();
		await page.waitForURL(/.*(\/dashboard|\/family)/, { timeout: 20000 });
	}

	// Cookie と IndexedDB の双方を含めて storageState として保存
	await page.context().storageState({ path: STORAGE_STATE, indexedDB: true });
});

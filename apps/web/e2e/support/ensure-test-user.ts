import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const E2E_TEST_UID = process.env.E2E_TEST_UID ?? "e2e-test-user";
const E2E_TEST_EMAIL =
	process.env.E2E_TEST_EMAIL ?? "e2e-tests@poohma-staging.internal";

let app: admin.app.App | null = null;

function getAdminApp(): admin.app.App {
	if (app) return app;

	// 1. 環境変数からの直接 JSON（CI / Vercel用）
	const serviceAccountJson =
		process.env.FIREBASE_SERVICE_ACCOUNT ||
		process.env.E2E_FIREBASE_SERVICE_ACCOUNT;
	if (serviceAccountJson) {
		const serviceAccount = JSON.parse(serviceAccountJson);
		if (serviceAccount.private_key) {
			serviceAccount.private_key = serviceAccount.private_key.replace(
				/\\n/g,
				"\n",
			);
		}
		app = admin.initializeApp(
			{ credential: admin.credential.cert(serviceAccount) },
			"e2e-admin",
		);
		return app;
	}

	// 2. クレデンシャルファイルパスからの読み込み（ローカル開発用）
	const credentialsPath = process.env.FIREBASE_ADMINSDK_CREDENTIALS;
	if (credentialsPath) {
		const fullPath = path.resolve(credentialsPath);
		if (fs.existsSync(fullPath)) {
			const fileContent = fs.readFileSync(fullPath, "utf-8");
			const serviceAccount = JSON.parse(fileContent);
			app = admin.initializeApp(
				{ credential: admin.credential.cert(serviceAccount) },
				"e2e-admin",
			);
			return app;
		}
	}

	throw new Error(
		"Firebase Admin credentials not found. To run E2E tests locally, set FIREBASE_SERVICE_ACCOUNT (JSON string) or FIREBASE_ADMINSDK_CREDENTIALS (file path) in your .env or .env.local file.",
	);
}

export async function ensureTestUserCustomToken(): Promise<string> {
	const auth = getAdminApp().auth();
	try {
		await auth.getUser(E2E_TEST_UID);
	} catch {
		await auth.createUser({
			uid: E2E_TEST_UID,
			email: E2E_TEST_EMAIL,
			emailVerified: true,
			displayName: "E2E Test User",
		});
	}
	return auth.createCustomToken(E2E_TEST_UID);
}

export { E2E_TEST_UID, E2E_TEST_EMAIL };

import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

declare global {
	interface Window {
		__e2eSignIn: (
			config: { apiKey: string; projectId: string },
			customToken: string,
		) => Promise<void>;
	}
}

window.__e2eSignIn = async (config, customToken) => {
	// アプリ本体と同じデフォルトアプリ（[DEFAULT]）を取得または初期化
	const app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
	const auth = getAuth(app);
	await signInWithCustomToken(auth, customToken);
};

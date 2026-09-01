import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, GoogleAuthProvider, getAuth } from "firebase/auth";
import { env } from "@/env/client";

const isBrowser = typeof window !== "undefined";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isBrowser) {
	const firebaseConfig = {
		apiKey: env.VITE_FIREBASE_API_KEY,
		authDomain: window.location.host,
		projectId: env.VITE_FIREBASE_PROJECT_ID,
	};

	app = getApps()?.length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
	auth = getAuth(app);
	googleProvider = new GoogleAuthProvider();
	googleProvider.setCustomParameters({
		prompt: "select_account",
	});
}

export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * 現在の Firebase ユーザーを再認証し、Google Drive スコープ（drive.file）を持つ
 * 一時 Access Token を取得
 */
export async function getGoogleDriveAccessToken(): Promise<string | null> {
	if (!auth) {
		console.error("Firebase auth is not initialized");
		return null;
	}

	const currentUser = auth.currentUser;
	if (!currentUser) {
		console.error("Firebase user is not signed in");
		return null;
	}

	const { reauthenticateWithPopup } = await import("firebase/auth");
	const provider = new GoogleAuthProvider();
	provider.addScope(GOOGLE_DRIVE_SCOPE);
	provider.setCustomParameters({
		prompt: "consent",
	});

	try {
		const result = await reauthenticateWithPopup(currentUser, provider);
		const credential = GoogleAuthProvider.credentialFromResult(result);
		return credential?.accessToken ?? null;
	} catch (error) {
		const err = error as { code?: string; message?: string };
		if (
			err?.code === "auth/popup-closed-by-user" ||
			err?.code === "auth/cancelled-popup-request"
		) {
			return null;
		}
		console.error("Failed to acquire Google Drive access token:", error);
		throw error;
	}
}

export { auth, googleProvider };

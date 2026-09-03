import {
	type User as FirebaseUser,
	onIdTokenChanged,
	signInWithCustomToken,
} from "firebase/auth";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	getCustomTokenFromSession,
	refreshSessionCookie,
} from "@/services/auth.functions";
import { auth } from "@/utils/firebase";
import { isPwaFirstLaunch, markPwaAsInitialized } from "@/utils/pwa";

/**
 * ログアウト後のセッション復元誤爆を防ぎ、クロス多タブでログアウト状態を同期するためのフラグキー。
 * ログアウト処理側で localStorage にこのキーをセットし、復元ロジック側でフラグが立っていればスキップする。
 */
export const LOGOUT_FLAG_KEY = "poohma_logout";

let lastSessionSyncTime = 0;
const SESSION_SYNC_INTERVAL_MS = 1000 * 60 * 60; // 1時間ごとにセッションCookieをローリング延長

/** テスト用または明示的ログアウト時のセッション同期間隔リセット */
export function resetSessionSyncTime() {
	lastSessionSyncTime = 0;
}

async function syncSessionCookieInBackground(user: FirebaseUser) {
	const now = Date.now();
	if (now - lastSessionSyncTime < SESSION_SYNC_INTERVAL_MS) {
		return;
	}
	lastSessionSyncTime = now;
	try {
		const idToken = await user.getIdToken();
		await refreshSessionCookie({ data: { idToken } });
	} catch (e) {
		lastSessionSyncTime = 0;
		console.warn("Background session cookie sync failed:", e);
	}
}

export function useConvexFirebaseAuth() {
	const [isLoading, setIsLoading] = useState(true);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const recoveryPromiseRef = useRef<Promise<boolean> | null>(null);

	const recoverSession = useCallback(
		async (firebaseAuth: NonNullable<typeof auth>): Promise<boolean> => {
			if (recoveryPromiseRef.current) {
				return recoveryPromiseRef.current;
			}

			const promise = (async () => {
				try {
					const result = await getCustomTokenFromSession();
					if (!result?.customToken) {
						return false;
					}
					try {
						if (localStorage.getItem(LOGOUT_FLAG_KEY)) {
							return false;
						}
					} catch {
						// ignore storage errors
					}
					await signInWithCustomToken(firebaseAuth, result.customToken);
					return true;
				} catch (error) {
					console.error("Silent re-auth failed:", error);
					return false;
				} finally {
					recoveryPromiseRef.current = null;
				}
			})();

			recoveryPromiseRef.current = promise;
			return promise;
		},
		[],
	);

	useEffect(() => {
		if (!auth) {
			setIsLoading(false);
			return;
		}
		const firebaseAuth = auth;
		let isCleanedUp = false;

		const unsubscribe = onIdTokenChanged(
			firebaseAuth,
			async (user: FirebaseUser | null) => {
				if (user) {
					// ログイン状態になったらログアウトフラグをクリア
					try {
						localStorage.removeItem(LOGOUT_FLAG_KEY);
					} catch {
						// ignore storage errors
					}
					setIsAuthenticated(true);
					setIsLoading(false);
					// バックグラウンドで session Cookie をローリング延長
					syncSessionCookieInBackground(user);
					return;
				}

				// ログアウト状態中はセッション復元をスキップ（他タブでのログアウトも検知）
				let isLoggedOut = false;
				try {
					isLoggedOut = !!localStorage.getItem(LOGOUT_FLAG_KEY);
				} catch {
					// ignore storage errors
				}

				if (isLoggedOut) {
					setIsAuthenticated(false);
					setIsLoading(false);
					return;
				}

				const recovered = await recoverSession(firebaseAuth);
				if (isCleanedUp) return;

				if (!recovered) {
					// 再認証に失敗した場合のみ未認証を確定する
					setIsAuthenticated(false);
				}
				setIsLoading(false);
			},
		);

		// 他タブでのログアウトを即時検知
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === LOGOUT_FLAG_KEY && e.newValue) {
				setIsAuthenticated(false);
			}
		};
		window.addEventListener("storage", handleStorageChange);

		return () => {
			isCleanedUp = true;
			unsubscribe();
			window.removeEventListener("storage", handleStorageChange);
		};
	}, [recoverSession]);

	return useMemo(
		() => ({
			isLoading,
			isAuthenticated,
			fetchAccessToken: async ({
				forceRefreshToken,
			}: {
				forceRefreshToken: boolean;
			}) => {
				if (!auth?.currentUser) {
					return null;
				}
				try {
					const isFirstPwaLaunch = isPwaFirstLaunch();
					const token = await auth.currentUser.getIdToken(
						isFirstPwaLaunch || forceRefreshToken,
					);
					// トークン取得成功後にのみPWA初回起動フラグを保存
					if (isFirstPwaLaunch) {
						markPwaAsInitialized();
					}
					return token;
				} catch (error) {
					console.error("Failed to fetch access token:", error);
					return null;
				}
			},
		}),
		[isLoading, isAuthenticated],
	);
}

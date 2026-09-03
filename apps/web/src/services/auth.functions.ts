import { createServerFn } from "@tanstack/react-start";
import {
	deleteCookie,
	getCookie,
	setCookie,
	setResponseHeader,
} from "@tanstack/react-start/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import type { Account } from "@/components/AccountProvider";
import { env } from "@/env/client";
import { env as serverEnv } from "@/env/server";
import {
	adminAuth,
	getSessionCookie,
	revokeRefreshTokens,
	verifySessionCookie,
} from "@/services/firebase-admin.server";
import { getRequestContext } from "@/utils/request-context.server";

/**
 * 14日間の秒数とミリ秒数
 */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 14;
const SESSION_EXPIRES_IN_MS = SESSION_EXPIRES_IN_SECONDS * 1000;
const DEVICE_ID_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365; // 1年間
const isProduction = process.env.NODE_ENV === "production";

/**
 * リクエストごとに生成する
 * (ConvexHttpClientはstateful(setAuth/setAdminAuthで状態を持つ)。
 * 公式ドキュメントも "avoid sharing it between requests in a server" と明記しているため)
 */
function createConvexClient() {
	return new ConvexHttpClient(env.VITE_CONVEX_URL as string);
}

/**
 * 認証ユーザーの同期とセッションクッキーの発行
 * @param idToken FirebaseのIDトークン
 * @returns アカウントID (Id<"users">)
 */
export const syncUser = createServerFn({ method: "POST" })
	.validator((data: { idToken: string }) => data)
	.handler(async ({ data: { idToken } }) => {
		try {
			const decodedToken = await adminAuth().verifyIdToken(idToken);
			const { email, name, picture } = decodedToken;
			if (!email) throw new Error("Email is required");

			const convexClient = createConvexClient();
			convexClient.setAuth(idToken);
			const accountId = await convexClient.mutation(api.users.syncUser, {
				displayName: name,
				photoURL: picture,
			});

			// デバイス識別用クッキーの取得または新規発行
			let deviceId = getCookie("poohma_device_id");

			if (!deviceId) {
				deviceId = crypto.randomUUID();
				setCookie("poohma_device_id", deviceId, {
					httpOnly: true,
					secure: isProduction,
					sameSite: "lax",
					path: "/",
					maxAge: DEVICE_ID_EXPIRES_IN_SECONDS,
				});
			}

			// ログイン履歴の記録と新端末検知通知
			try {
				const context = await getRequestContext();
				await convexClient.mutation(api.users.recordLogin, {
					deviceId,
					accountId,
					...context,
				});
			} catch (logErr) {
				console.warn("Failed to record login event:", logErr);
			}

			// セッションクッキーの作成 (expiresIn はミリ秒)
			const sessionCookie = await getSessionCookie(
				idToken,
				SESSION_EXPIRES_IN_MS,
			);

			// クッキーの設定 (maxAge は秒)
			setCookie("session", sessionCookie, {
				httpOnly: true,
				secure: isProduction,
				sameSite: "lax",
				path: "/",
				maxAge: SESSION_EXPIRES_IN_SECONDS,
			});

			return accountId;
		} catch (error) {
			console.error("syncUser failed:", error);
			throw error;
		}
	});

/**
 * セッションCookieのローリング延長処理
 * DB更新や新端末ログイン検知（recordLogin）をスキップし、Cookieの再発行・延長のみを軽量に行う
 */
export const refreshSessionCookie = createServerFn({ method: "POST" })
	.validator((data: { idToken: string }) => data)
	.handler(async ({ data: { idToken } }) => {
		try {
			// IDトークンの署名・有効性を検証
			await adminAuth().verifyIdToken(idToken);

			// セッションクッキーの作成 (expiresIn はミリ秒)
			const sessionCookie = await getSessionCookie(
				idToken,
				SESSION_EXPIRES_IN_MS,
			);

			// クッキーの設定 (maxAge は秒)
			setCookie("session", sessionCookie, {
				httpOnly: true,
				secure: isProduction,
				sameSite: "lax",
				path: "/",
				maxAge: SESSION_EXPIRES_IN_SECONDS,
			});

			return { success: true };
		} catch (error) {
			console.error("refreshSessionCookie failed:", error);
			throw error;
		}
	});

/**
 * ログアウト処理（サーバー側のセッション失効とクッキーの削除）
 */
export const logout = createServerFn({ method: "POST" }).handler(async () => {
	const sessionCookie = getCookie("session");
	if (sessionCookie) {
		try {
			// トークン失効状態にかかわらず uid を取得して Firebase 側のリフレッシュトークンを即時無効化
			const decodedToken = await adminAuth().verifySessionCookie(
				sessionCookie,
				false,
			);
			if (decodedToken?.uid) {
				await revokeRefreshTokens(decodedToken.uid);
			}
		} catch (e) {
			console.error("logout: failed to revoke session token", e);
		}
	}

	const isProduction = process.env.NODE_ENV === "production";

	deleteCookie("session", {
		path: "/",
		httpOnly: true,
		secure: isProduction,
		sameSite: "lax",
	});

	setCookie("session", "", {
		httpOnly: true,
		secure: isProduction,
		sameSite: "lax",
		path: "/",
		maxAge: 0,
	});
});

// .convex.cloud → .convex.site (httpAction用ドメイン)
function getConvexSiteUrl() {
	return (env.VITE_CONVEX_URL as string).replace(
		".convex.cloud",
		".convex.site",
	);
}

/**
 * 認証済みユーザーの取得
 * @returns 認証ユーザー情報 または null
 */
export const getAuthUser = createServerFn({ method: "GET" }).handler(
	async () => {
		const sessionCookie = getCookie("session");
		if (!sessionCookie) return null;
		try {
			const decodedToken = await verifySessionCookie(sessionCookie);
			const { uid } = decodedToken;

			const res = await fetch(`${getConvexSiteUrl()}/getUserByFirebaseUid`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-internal-secret": serverEnv.CONVEX_INTERNAL_SECRET,
				},
				body: JSON.stringify({ userId: uid }),
				signal: AbortSignal.timeout(5000),
			});
			if (res.status === 422) return null;
			if (!res.ok) throw new Error("Failed to fetch user");
			return (await res.json()) as Account | null;
		} catch (error) {
			console.error("getAuthUser: Auth verification failed:", error);
			return null;
		}
	},
);

/**
 * セッションクッキーからカスタムトークンを生成する（iOS PWA復元用）
 */
export const getCustomTokenFromSession = createServerFn({
	method: "GET",
}).handler(async () => {
	setResponseHeader("Cache-Control", "no-store");

	const sessionCookie = getCookie("session");
	if (!sessionCookie) return null;
	try {
		const { uid } = await verifySessionCookie(sessionCookie);
		const customToken = await adminAuth().createCustomToken(uid);
		return { customToken };
	} catch (error) {
		console.error("getCustomTokenFromSession failed:", error);
		return null;
	}
});

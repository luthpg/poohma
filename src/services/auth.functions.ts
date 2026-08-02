import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import { env } from "@/env/client";
import { env as serverEnv } from "@/env/server";
import {
  adminAuth,
  getSessionCookie,
  verifySessionCookie,
} from "@/services/firebase-admin.server";

/**
 * 14日間の秒数とミリ秒数
 */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 14;
const SESSION_EXPIRES_IN_MS = SESSION_EXPIRES_IN_SECONDS * 1000;

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
 * @returns 認証ユーザーID
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
      const userId = await convexClient.mutation(api.users.syncUser, {
        displayName: name,
        photoURL: picture,
      });

      // セッションクッキーの作成 (expiresIn はミリ秒)
      const sessionCookie = await getSessionCookie(
        idToken,
        SESSION_EXPIRES_IN_MS,
      );

      // クッキーの設定 (maxAge は秒)
      const isProduction = process.env.NODE_ENV === "production";

      setCookie("session", sessionCookie, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_EXPIRES_IN_SECONDS,
      });

      return userId;
    } catch (error) {
      console.error("syncUser failed:", error);
      throw error;
    }
  });

/**
 * ログアウト処理（クッキーの削除）
 */
export const logout = createServerFn({ method: "POST" }).handler(async () => {
  setCookie("session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0, // 即時無効化
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
      return await res.json();
    } catch (error) {
      console.error("getAuthUser: Auth verification failed:", error);
      return null;
    }
  },
);

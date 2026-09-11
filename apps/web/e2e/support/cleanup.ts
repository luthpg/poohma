import type { Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { ensureTestUserCustomToken } from "./ensure-test-user";

/**
 * Node.js 側から Firebase REST API を叩き、Custom Token を ID Token に交換
 */
async function getFirebaseIdToken(): Promise<string> {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_FIREBASE_API_KEY が設定されていません");
  }

  const customToken = await ensureTestUserCustomToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    },
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `Failed to exchange custom token: ${res.status} ${errorText}`,
    );
  }

  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

/**
 * E2Eテストユーザー（e2e-test-user）に紐づくすべての PoohMa アカウント、
 * 所属ファミリー、レコード、招待、参加申請を Convex から完全パージする
 */
export async function purgeAllTestData(page?: Page): Promise<number> {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL が設定されていません");
  }

  // 1. ブラウザページが利用可能な場合はブラウザのログインセッション経由を優先
  if (page && !page.isClosed()) {
    try {
      const result = await page.evaluate(async (url) => {
        // Firebase Auth からトークン取得
        const { getApps } = await import("firebase/app");
        const { getAuth } = await import("firebase/auth");
        const apps = getApps();
        if (apps.length === 0) return null;
        const auth = getAuth(apps[0]);
        const user = auth.currentUser;
        if (!user) return null;

        const token = await user.getIdToken(true);
        const res = await fetch(`${url}/api/mutation`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            path: "users:deleteAllAccounts",
            args: {},
            format: "json",
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Mutation failed: ${res.status} ${err}`);
        }

        const json = (await res.json()) as {
          status: string;
          value?: { success: boolean; deletedCount: number };
          errorMessage?: string;
        };
        if (json.status !== "success") {
          throw new Error(json.errorMessage || "deleteAllAccounts failed");
        }
        return json.value?.deletedCount ?? 0;
      }, convexUrl);

      if (result !== null) {
        return result;
      }
    } catch {
      // ブラウザ側での実行に失敗した場合は Node.js 側のフォールバックを実行
    }
  }

  // 2. Node.js 側の ConvexHttpClient 経由で確実に完全パージ
  const idToken = await getFirebaseIdToken();
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(idToken);
  const result = await client.mutation(api.users.deleteAllAccounts, {});
  return result.deletedCount;
}

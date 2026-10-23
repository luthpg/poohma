import type { Page } from "@playwright/test";
import { api } from "@poohma/backend/api";
import { ConvexHttpClient } from "convex/browser";
import {
  clearRecordedActiveUids,
  deleteE2EFirebaseUserIfDynamic,
  ensureTestUserCustomToken,
  getRecordedActiveUids,
  listStaleE2ETestUids,
} from "./ensure-test-user";

/**
 * Node.js 側から Firebase REST API を叩き、指定 UID の Custom Token を ID Token に交換
 */
export async function getFirebaseIdTokenForUid(uid?: string): Promise<string> {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_FIREBASE_API_KEY が設定されていません");
  }

  const customToken = await ensureTestUserCustomToken(
    uid ? { uid } : undefined,
  );
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

async function purgeConvexDataForUid(
  convexUrl: string,
  uid: string,
): Promise<number | null> {
  try {
    const idToken = await getFirebaseIdTokenForUid(uid);
    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(idToken);
    const result = await client.mutation(api.users.deleteAllAccounts, {});
    return result.deletedCount;
  } catch {
    return null;
  }
}

/**
 * E2Eテストユーザー（全Worker UID・Logout専用UID・残留テストUID）に紐づくすべての
 * PoohMa アカウント、所属ファミリー、レコード、招待、参加申請を Convex から完全パージし、
 * 動的生成された Firebase Auth テストユーザーも回収する。
 */
export async function purgeAllTestData(
  page?: Page,
  explicitUids?: string[],
): Promise<number> {
  const convexUrl = process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL が設定されていません");
  }
  const isLocal =
    convexUrl.startsWith("http://127.0.0.1:") ||
    convexUrl.startsWith("http://localhost:");
  if (!convexUrl.startsWith("https://") && !isLocal) {
    throw new Error(
      "VITE_CONVEX_URL は HTTPS プロトコルまたはローカルアドレスである必要があります",
    );
  }

  let totalDeleted = 0;

  // 1. ブラウザページが渡された場合はそのセッションのアカウントを即時パージ
  if (page && !page.isClosed()) {
    try {
      const result = await page.evaluate(async (url) => {
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

        if (!res.ok) return null;

        const json = (await res.json()) as {
          status: string;
          value?: { success: boolean; deletedCount: number };
        };
        if (json.status !== "success") return null;
        return json.value?.deletedCount ?? 0;
      }, convexUrl);

      if (result !== null) {
        totalDeleted += result;
      }
    } catch {
      // フォールバックへ継続
    }
  }

  // 2. 対象 UID 一覧の確定（明示指定がなければ今回のアクティブUID + 残留E2Eユーザー）
  const targetUids = explicitUids
    ? [...new Set(explicitUids)]
    : [
        ...new Set([
          ...getRecordedActiveUids(),
          ...(await listStaleE2ETestUids()),
        ]),
      ];

  const deletedCounts = await Promise.all(
    targetUids.map(async (uid) => {
      const deleted = await purgeConvexDataForUid(convexUrl, uid);
      if (deleted === null) {
        return 0;
      }
      await deleteE2EFirebaseUserIfDynamic(uid);
      return deleted;
    }),
  );
  totalDeleted += deletedCounts.reduce((sum, count) => sum + count, 0);

  if (!explicitUids) {
    clearRecordedActiveUids();
  }

  return totalDeleted;
}

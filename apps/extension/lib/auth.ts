import type { api } from "@poohma/backend/api";
import type { FunctionReturnType } from "convex/server";

type RedeemSyncTokenResult = FunctionReturnType<
  typeof api.extensionAuth.redeemSyncToken
>;

export type ExtensionUser = {
  _id: string;
  userId: RedeemSyncTokenResult["user"]["userId"];
  email: RedeemSyncTokenResult["user"]["email"];
  displayName?: RedeemSyncTokenResult["user"]["displayName"];
  photoURL?: RedeemSyncTokenResult["user"]["photoURL"];
  familyId?: string;
  familyRole?: RedeemSyncTokenResult["user"]["familyRole"];
  family?: ExtensionFamily | null;
};

export type ExtensionFamily = Omit<
  NonNullable<RedeemSyncTokenResult["family"]>,
  "_id"
> & {
  _id: string;
};

export interface AuthStorageData {
  user: ExtensionUser | null;
  accounts: ExtensionUser[];
  activeAccountId: string | null;
  family: ExtensionFamily | null;
  pendingSyncNonce: string | null;
  customToken: string | null;
  idToken: string | null;
  refreshToken: string | null;
}

/**
 * ローカルストレージから認証データを取得する
 */
export async function getAuthStorage(): Promise<AuthStorageData> {
  const result = await chrome.storage.local.get([
    "user",
    "accounts",
    "activeAccountId",
    "family",
    "pendingSyncNonce",
    "customToken",
    "idToken",
    "refreshToken",
  ]);
  const user = (result.user as ExtensionUser) ?? null;
  const rawAccounts = result.accounts as ExtensionUser[] | undefined;
  const accounts =
    Array.isArray(rawAccounts) && rawAccounts.length > 0
      ? rawAccounts
      : user
        ? [user]
        : [];
  const activeAccountId =
    (result.activeAccountId as string | undefined) || user?._id || null;

  return {
    user,
    accounts,
    activeAccountId,
    family: result.family ?? null,
    pendingSyncNonce: result.pendingSyncNonce ?? null,
    customToken: result.customToken ?? null,
    idToken: result.idToken ?? null,
    refreshToken: result.refreshToken ?? null,
  };
}

/**
 * 認証セッションを保存する
 */
export async function setAuthSession(
  user: ExtensionUser,
  family: ExtensionFamily | null,
  customToken?: string | null,
  idToken?: string | null,
  refreshToken?: string | null,
  accounts?: ExtensionUser[],
): Promise<void> {
  const resolvedAccounts = accounts && accounts.length > 0 ? accounts : [user];
  await chrome.storage.local.set({
    user,
    accounts: resolvedAccounts,
    activeAccountId: user._id,
    family,
    pendingSyncNonce: null,
    customToken: customToken ?? null,
    idToken: idToken ?? null,
    refreshToken: refreshToken ?? null,
  });
}

/**
 * アクティブなサブアカウントを切り替える
 */
export async function switchActiveAccount(accountId: string): Promise<void> {
  const storage = await getAuthStorage();
  if (!storage.user) return;
  const targetUser = storage.accounts.find((a) => a._id === accountId);
  if (!targetUser) return;

  // レースコンディション対策: 書き戻し直前に最新ストレージを確認（ログアウト等との競合防止）
  const latest = await getAuthStorage();
  if (!latest.user) return;

  await chrome.storage.local.set({
    user: targetUser,
    activeAccountId: accountId,
    family: targetUser.family ?? null,
  });

  // アカウント・家族切り替え時はメモリ上の旧家族マスターキーを安全に破棄
  try {
    chrome.runtime?.sendMessage?.({ type: "VAULT_LOCK" })?.catch?.(() => {});
  } catch {
    // 拡張機能コンテキスト外やテスト環境等のエラーを安全に無視
  }
}

/**
 * 認証セッションを破棄（ログアウト）する
 */
export async function clearAuthSession(): Promise<void> {
  await chrome.storage.local.remove([
    "user",
    "accounts",
    "activeAccountId",
    "family",
    "pendingSyncNonce",
    "customToken",
    "idToken",
    "refreshToken",
  ]);
}

/**
 * Custom Token を使用して Firebase REST API から恒久的な refreshToken と最新 idToken を取得
 */
export async function exchangeCustomToken(
  customToken: string,
  apiKey: string,
): Promise<{ idToken: string; refreshToken: string; userId?: string } | null> {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    let userId: string | undefined;
    try {
      const segment = String(data.idToken ?? "").split(".")[1] ?? "";
      const payload = JSON.parse(
        atob(segment.replace(/-/g, "+").replace(/_/g, "/")),
      );
      userId = payload.user_id ?? payload.sub;
    } catch {
      userId = undefined;
    }
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      userId: userId || data.localId,
    };
  } catch {
    return null;
  }
}

/**
 * Refresh Token を使用して Firebase REST API から最新の idToken を再取得（自動リフレッシュ）
 */
export async function refreshIdToken(
  refreshToken: string,
  apiKey: string,
): Promise<{ idToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
      },
    );
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
    };
  } catch {
    return null;
  }
}

/**
 * JWT (ID Token) の期限切れ判定（Base64Url デコード）
 * @param token 検証対象の JWT 文字列
 * @param skewSeconds 猶予秒数（デフォルト 60 秒前には期限切れとみなす）
 */
export function isTokenExpired(
  token: string | null | undefined,
  skewSeconds = 60,
): boolean {
  if (!token) return true;
  try {
    const parts = token.split(".");
    const payloadSegment = parts[1];
    if (!payloadSegment) return true;
    const payload = JSON.parse(
      atob(payloadSegment.replace(/-/g, "+").replace(/_/g, "/")),
    );
    const now = Math.floor(Date.now() / 1000);
    return typeof payload.exp !== "number" || payload.exp <= now + skewSeconds;
  } catch {
    return true;
  }
}

let inflightIdTokenPromise: Promise<string | null> | null = null;

/**
 * 有効な ID トークンを取得する（期限切れの場合は refreshToken で自動更新して保存）
 */
export async function getValidIdToken(apiKey: string): Promise<string | null> {
  if (inflightIdTokenPromise) {
    return inflightIdTokenPromise;
  }

  inflightIdTokenPromise = (async () => {
    try {
      const storage = await getAuthStorage();
      if (!storage.idToken && !storage.refreshToken && !storage.customToken) {
        return null;
      }

      // まだ有効期限内であれば現在のトークンをそのまま返す
      if (storage.idToken && !isTokenExpired(storage.idToken)) {
        return storage.idToken;
      }

      console.log(
        "[PoohMa Auth] ID token expired or expiring soon, attempting refresh...",
      );

      // 1. refreshToken で更新を試みる
      if (storage.refreshToken) {
        const refreshed = await refreshIdToken(storage.refreshToken, apiKey);
        if (refreshed) {
          // レースコンディション対策: 書き戻し前にストレージ状態（ログアウトやアカウント切り替え）を検証
          const latest = await getAuthStorage();
          if (!latest.user || latest.refreshToken !== storage.refreshToken) {
            return latest.idToken ?? null;
          }

          await chrome.storage.local.set({
            idToken: refreshed.idToken,
            refreshToken: refreshed.refreshToken,
          });
          return refreshed.idToken;
        }
      }

      // 2. refreshToken がない / 失敗した場合、customToken での再取得を試みる（フォールバック）
      if (storage.customToken) {
        const exchanged = await exchangeCustomToken(
          storage.customToken,
          apiKey,
        );
        if (exchanged) {
          // レースコンディション対策: 書き戻し前にストレージ状態を検証
          const latest = await getAuthStorage();
          if (!latest.user || latest.customToken !== storage.customToken) {
            return latest.idToken ?? null;
          }

          await chrome.storage.local.set({
            idToken: exchanged.idToken,
            refreshToken: exchanged.refreshToken,
          });
          return exchanged.idToken;
        }
      }

      console.warn(
        "[PoohMa Auth] Failed to refresh ID token. Re-authentication required.",
      );
      return null;
    } finally {
      inflightIdTokenPromise = null;
    }
  })();

  return inflightIdTokenPromise;
}

/**
 * 同期待ち nonce を保存または消去する
 */
export async function setPendingSyncNonce(nonce: string | null): Promise<void> {
  if (nonce === null) {
    await chrome.storage.local.remove(["pendingSyncNonce"]);
  } else {
    await chrome.storage.local.set({ pendingSyncNonce: nonce });
  }
}

/**
 * 同期待ち nonce を消去する
 */
export async function clearPendingSyncNonce(): Promise<void> {
  await chrome.storage.local.remove(["pendingSyncNonce"]);
}

/**
 * Web から受け渡された一時トークン（customToken / idToken）を消費・消去する
 * @param clearIdToken Firebase サインイン成功時に true を渡し、idToken も一緒に消去する
 */
export async function consumeHandoffTokens(
  clearIdToken = false,
): Promise<void> {
  const keysToRemove = ["customToken"];
  if (clearIdToken) {
    keysToRemove.push("idToken");
  }
  await chrome.storage.local.remove(keysToRemove);
}

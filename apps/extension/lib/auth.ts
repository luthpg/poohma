export interface ExtensionUser {
  _id: string;
  userId: string; // Firebase UID
  displayName?: string;
  email: string;
  photoURL?: string;
  familyId?: string;
  familyRole?: "admin" | "member";
}

export interface ExtensionFamily {
  _id: string;
  name: string;
  masterKeyEncrypted: string;
  masterKeyIv: string;
  masterKeySalt: string;
  kdfIterations: number;
  cryptoVersion: number;
}

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
  const targetUser = storage.accounts.find((a) => a._id === accountId);
  if (!targetUser) return;
  await chrome.storage.local.set({
    user: targetUser,
    activeAccountId: accountId,
  });
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
): Promise<{ idToken: string; refreshToken: string } | null> {
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
      const errBody = await res.text().catch(() => "");
      console.warn(
        `[PoohMa Auth] exchangeCustomToken HTTP ${res.status}:`,
        errBody.slice(0, 150),
      );
      return null;
    }
    const data = await res.json();
    return {
      idToken: data.idToken,
      refreshToken: data.refreshToken,
    };
  } catch (err) {
    console.warn("[PoohMa Auth] exchangeCustomToken fetch failed:", err);
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
      const errBody = await res.text().catch(() => "");
      console.warn(
        `[PoohMa Auth] refreshIdToken HTTP ${res.status}:`,
        errBody.slice(0, 150),
      );
      return null;
    }
    const data = await res.json();
    return {
      idToken: data.id_token,
      refreshToken: data.refresh_token,
    };
  } catch (err) {
    console.warn("[PoohMa Auth] refreshIdToken fetch failed:", err);
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

/**
 * 有効な ID トークンを取得する（期限切れの場合は refreshToken で自動更新して保存）
 */
export async function getValidIdToken(apiKey: string): Promise<string | null> {
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
      console.log(
        "[PoohMa Auth] ID token refreshed successfully via refreshToken!",
      );
      await chrome.storage.local.set({
        idToken: refreshed.idToken,
        refreshToken: refreshed.refreshToken,
      });
      return refreshed.idToken;
    }
  }

  // 2. refreshToken がない / 失敗した場合、customToken での再取得を試みる（フォールバック）
  if (storage.customToken) {
    const exchanged = await exchangeCustomToken(storage.customToken, apiKey);
    if (exchanged) {
      console.log(
        "[PoohMa Auth] ID token refreshed successfully via customToken!",
      );
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
}

/**
 * 同期待ち nonce を保存する
 */
export async function setPendingSyncNonce(nonce: string): Promise<void> {
  await chrome.storage.local.set({ pendingSyncNonce: nonce });
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

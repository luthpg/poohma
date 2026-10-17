import { api } from "@poohma/backend/api";
import type { Id } from "@poohma/backend/dataModel";
import { ConvexClient } from "convex/browser";
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { env } from "@/env";
import {
  clearAuthSession,
  consumeHandoffTokens,
  getAuthStorage,
} from "@/lib/auth";
import {
  decryptPasswordHint,
  unlockMasterKeyWithPasscode,
} from "@/lib/passcode";

// 1. Firebase 初期化
console.log(
  "[PoohMa Offscreen] Offscreen Document main.ts starting initialization...",
);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig, "poohma-extension-offscreen");
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((_err) => {
  // 永続化エラーハンドリング
});

// 2. Convex Client 初期化
const convex = new ConvexClient(env.VITE_CONVEX_URL);
console.log(
  "[PoohMa Offscreen] ConvexClient initialized with URL:",
  env.VITE_CONVEX_URL,
);

/**
 * Convex Client へトークンフェッチャーを登録する。
 * Firebase セッションがあればその ID トークン（自動リフレッシュ可能）を使い、
 * 無い場合のみ Web から受け取った短命 ID トークンにフォールバックする。
 */
function registerConvexAuth() {
  convex.setAuth(async ({ forceRefreshToken }) => {
    const user = auth.currentUser;
    if (user) {
      try {
        return await user.getIdToken(forceRefreshToken);
      } catch (_err) {
        return null;
      }
    }
    const storage = await getAuthStorage().catch(() => null);
    return storage?.idToken ?? null;
  });
}

// 起動時に直ちに Convex トークンフェッチャーを登録（初回クエリの未認証防止）
registerConvexAuth();

/**
 * 拡張機能セッション（storage.user）に対応する Firebase セッションを確立する。
 * - Web から受け取った Custom Token があれば最優先でサインインし、使用後に破棄する
 * - 別ユーザーの Firebase セッションが残っていればサインアウトする（アカウント境界の保護）
 */
let pendingFirebaseAuth: Promise<boolean> | null = null;

function ensureFirebaseAuth(): Promise<boolean> {
  if (pendingFirebaseAuth) return pendingFirebaseAuth;

  pendingFirebaseAuth = (async () => {
    // IndexedDB のセッション復元ハング防止（最大 500ms 待機）
    await Promise.race([
      auth.authStateReady(),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);

    const { user, customToken } = await getAuthStorage();
    if (!user) return false;

    if (
      customToken &&
      (!auth.currentUser || auth.currentUser.uid !== user.userId)
    ) {
      try {
        console.log("[PoohMa Offscreen] Signing in with Custom Token...");
        await signInWithCustomToken(auth, customToken);
        console.log(
          "[PoohMa Offscreen] Signed in with Custom Token successfully!",
        );
      } catch (err) {
        console.warn(
          "[PoohMa Offscreen] Custom token signin failed, using idToken fallback:",
          err,
        );
      }
      await consumeHandoffTokens(auth.currentUser?.uid === user.userId);
    }

    if (auth.currentUser && auth.currentUser.uid !== user.userId) {
      await signOut(auth).catch(() => {});
    }
    return auth.currentUser?.uid === user.userId;
  })().finally(() => {
    pendingFirebaseAuth = null;
  });

  return pendingFirebaseAuth;
}

// Firebase ユーザーが変化したら Convex のトークンを取り直す
onAuthStateChanged(auth, () => {
  registerConvexAuth();
});

// Background が保存した受け渡しトークンを検知してセッションを確立する
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.customToken?.newValue || changes.idToken?.newValue) {
    ensureFirebaseAuth()
      .catch(() => false)
      .finally(() => registerConvexAuth());
  }
});

// 起動時（Offscreen 再生成時）に未消費の受け渡しトークンがあれば処理する
ensureFirebaseAuth().catch(() => {});

// 3. メモリ上での MasterKey 保持（オートロック付き）
let activeMasterKey: CryptoKey | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15分無操作オートロック

function resetAutoLockTimer() {
  if (autoLockTimer) {
    clearTimeout(autoLockTimer);
  }
  autoLockTimer = setTimeout(() => {
    activeMasterKey = null;
    chrome.runtime
      .sendMessage({ type: "VAULT_LOCK_STATE_CHANGED", isUnlocked: false })
      .catch(() => {});
  }, AUTO_LOCK_TIMEOUT_MS);
}

// 4. メッセージリスナー
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  console.log("[PoohMa Offscreen] onMessage received:", message.type);

  // 0. Offscreen 初期化・生存確認（Ping-Pong）
  if (message.type === "OFFSCREEN_PING") {
    sendResponse({ success: true, ready: true });
    return false;
  }

  // A. 認証状態の取得
  if (message.type === "AUTH_GET_STATE") {
    (async () => {
      const storage = await getAuthStorage();
      const isAuthenticated = !!storage.user;
      sendResponse({
        isAuthenticated,
        user: storage.user,
        family: storage.family,
      });
    })();
    return true;
  }

  // C. サインアウト（ログアウト）
  if (
    message.type === "AUTH_SIGN_OUT" ||
    message.type === "OFFSCREEN_SIGN_OUT"
  ) {
    (async () => {
      try {
        await signOut(auth);
      } catch (_e) {}
      await clearAuthSession();
      activeMasterKey = null;
      if (autoLockTimer) clearTimeout(autoLockTimer);

      chrome.runtime
        .sendMessage({
          type: "AUTH_STATE_CHANGED",
          isAuthenticated: false,
          user: null,
          family: null,
        })
        .catch(() => {});

      sendResponse({ success: true });
    })();
    return true;
  }

  // D. パスコード解除（MasterKey 展開）
  if (message.type === "VAULT_UNLOCK") {
    (async () => {
      try {
        const { passcode } = message;
        if (!passcode) {
          throw new Error("Passcode is required");
        }

        const storage = await getAuthStorage();
        if (!storage.family) {
          throw new Error("Family info not found");
        }

        // 共通関数で安全に PBKDF2 導出 ＆ extractable: false で展開
        const masterKey = await unlockMasterKeyWithPasscode(
          passcode,
          storage.family,
        );

        activeMasterKey = masterKey;
        resetAutoLockTimer();

        chrome.runtime
          .sendMessage({ type: "VAULT_LOCK_STATE_CHANGED", isUnlocked: true })
          .catch(() => {});

        sendResponse({ success: true, isUnlocked: true });
      } catch (_err) {
        activeMasterKey = null;
        sendResponse({
          success: false,
          isUnlocked: false,
          error: "パスコードが正しくありません",
        });
      }
    })();
    return true;
  }

  // E. パスコード手動ロック
  if (message.type === "VAULT_LOCK") {
    activeMasterKey = null;
    if (autoLockTimer) clearTimeout(autoLockTimer);
    chrome.runtime
      .sendMessage({ type: "VAULT_LOCK_STATE_CHANGED", isUnlocked: false })
      .catch(() => {});
    sendResponse({ success: true, isUnlocked: false });
    return false;
  }

  // F. ロック状態取得
  if (message.type === "VAULT_GET_STATUS") {
    sendResponse({ isUnlocked: activeMasterKey !== null });
    return false;
  }

  // G. パスワードヒント復号
  if (message.type === "VAULT_DECRYPT_HINT") {
    (async () => {
      try {
        if (!activeMasterKey) {
          throw new Error("Vault is locked");
        }
        resetAutoLockTimer();

        const {
          passwordHint,
          passwordHintIv,
          passwordHintDekEncrypted,
          passwordHintDekIv,
        } = message;

        if (
          !passwordHint ||
          !passwordHintIv ||
          !passwordHintDekEncrypted ||
          !passwordHintDekIv
        ) {
          throw new Error("Incomplete hint envelope");
        }

        // 共通関数で DEK を unwrap し、ヒントを復号
        const decryptedHint = await decryptPasswordHint(
          passwordHint,
          passwordHintIv,
          passwordHintDekEncrypted,
          passwordHintDekIv,
          activeMasterKey,
        );

        sendResponse({ success: true, hint: decryptedHint });
      } catch (_err) {
        sendResponse({ success: false, error: "ヒントの復号に失敗しました" });
      }
    })();
    return true;
  }

  // H. レコード一覧の取得（URL照合・検索・バックグラウンド自律連携用）
  if (message.type === "GET_ALL_RECORDS") {
    console.log("[PoohMa Offscreen] Handling GET_ALL_RECORDS message...");
    (async () => {
      try {
        const storage = await getAuthStorage();
        console.log(
          "[PoohMa Offscreen] GET_ALL_RECORDS storage user:",
          storage.user?._id,
        );
        if (!storage.user?._id) {
          console.warn(
            "[PoohMa Offscreen] No user in storage, returning empty records",
          );
          sendResponse({ success: false, records: [] });
          return;
        }

        // Convex の認証設定を即時最新化
        registerConvexAuth();

        // Firebase 認証の確立を試行（最大 800ms 待機し、完了を待たずにフォールバック可能にする）
        await Promise.race([
          ensureFirebaseAuth(),
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]).catch(() => {});

        console.log(
          "[PoohMa Offscreen] Querying Convex getRecords for accountId:",
          storage.user._id,
        );

        // accountId を明示的に渡してマルチアカウント境界エラーを防止し、暗号化ヒントも含めて取得
        const records = await convex.query(api.records.getRecords, {
          accountId: storage.user._id as Id<"users">,
          includeHints: true,
        });

        console.log(
          "[PoohMa Offscreen] Convex getRecords returned count:",
          records?.length ?? 0,
        );
        sendResponse({ success: true, records: records ?? [] });
      } catch (err) {
        console.error("[PoohMa Offscreen] GET_ALL_RECORDS error caught:", err);
        sendResponse({ success: false, records: [] });
      }
    })();
    return true;
  }

  // I. 家族暗号情報の取得
  if (message.type === "GET_FAMILY_CRYPTO_INFO") {
    (async () => {
      try {
        const storage = await getAuthStorage();
        if (storage.family) {
          sendResponse({ success: true, family: storage.family });
          return;
        }

        if (storage.user?._id) {
          await ensureFirebaseAuth();
          const accounts = await convex.query(api.users.getAccounts, {
            accountId: storage.user._id as Id<"users">,
          });

          const family = accounts?.[0]?.family;
          if (
            !family?.masterKeyEncrypted ||
            !family.masterKeyIv ||
            !family.masterKeySalt
          ) {
            sendResponse({ success: false, family: null });
            return;
          }

          const familyData = {
            _id: family.id,
            name: family.name,
            masterKeyEncrypted: family.masterKeyEncrypted,
            masterKeyIv: family.masterKeyIv,
            masterKeySalt: family.masterKeySalt,
            kdfIterations: family.kdfIterations,
            cryptoVersion: family.cryptoVersion ?? 1,
          };

          sendResponse({ success: true, family: familyData });
          return;
        }

        sendResponse({ success: false, family: null });
      } catch (_err) {
        sendResponse({ success: false, family: null });
      }
    })();
    return true;
  }

  return;
});

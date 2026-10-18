import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { env } from "@/env";
import {
  decryptPasswordHint,
  unlockMasterKeyWithPasscode,
} from "@/lib/passcode";

// 1. Firebase 初期化
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
};

const app = initializeApp(firebaseConfig, "poohma-extension-offscreen");
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// 2. メモリ上での MasterKey 保持
let activeMasterKey: CryptoKey | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

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

// 3. メッセージリスナー（chrome.storage は一切使用せず runtime メッセージのみで連携）
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  // 0. Offscreen 初期化・生存確認（Ping-Pong）
  if (message.type === "OFFSCREEN_PING") {
    sendResponse({ success: true, ready: true });
    return false;
  }

  // A. Firebase Custom Token 認証
  if (message.type === "OFFSCREEN_SIGN_IN_CUSTOM_TOKEN") {
    (async () => {
      try {
        const { customToken, userId } = message;
        if (!customToken) {
          sendResponse({ success: false, error: "Custom token required" });
          return;
        }

        await auth.authStateReady();
        if (auth.currentUser && auth.currentUser.uid !== userId) {
          await signOut(auth).catch(() => {});
        }

        const cred = await signInWithCustomToken(auth, customToken);
        const idToken = await cred.user.getIdToken();
        sendResponse({ success: true, idToken });
      } catch (_err) {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  // B. Firebase サインアウト
  if (
    message.type === "AUTH_SIGN_OUT" ||
    message.type === "OFFSCREEN_SIGN_OUT"
  ) {
    (async () => {
      try {
        await signOut(auth);
      } catch (_e) {}
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

  // C. パスコード解除（MasterKey 展開）
  if (message.type === "VAULT_UNLOCK") {
    (async () => {
      try {
        const { passcode, family } = message;
        if (!passcode || !family) {
          throw new Error("Passcode and family info required");
        }

        const masterKey = await unlockMasterKeyWithPasscode(passcode, family);
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

  // D. パスコードロック
  if (message.type === "VAULT_LOCK") {
    activeMasterKey = null;
    if (autoLockTimer) clearTimeout(autoLockTimer);
    chrome.runtime
      .sendMessage({ type: "VAULT_LOCK_STATE_CHANGED", isUnlocked: false })
      .catch(() => {});
    sendResponse({ success: true, isUnlocked: false });
    return false;
  }

  // E. ロック状態取得
  if (message.type === "VAULT_GET_STATUS") {
    sendResponse({ isUnlocked: activeMasterKey !== null });
    return false;
  }

  // F. パスワードヒント復号
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

  return false;
});

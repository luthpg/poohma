import {
  decryptPasswordHint,
  unlockMasterKeyWithPasscode,
} from "@/lib/passcode";

// 1. メモリ上での MasterKey 保持（暗号化ヒント復号ワーカー）
let activeMasterKey: CryptoKey | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5分オートロック（Webアプリと一致）

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

// 2. メッセージリスナー（Web Crypto 計算処理に特化）
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  // 0. Offscreen 初期化・生存確認（Ping-Pong）
  if (message.type === "OFFSCREEN_PING") {
    sendResponse({ success: true, ready: true });
    return false;
  }

  // A. 暗号鍵破棄（サインアウト時）
  if (
    message.type === "AUTH_SIGN_OUT" ||
    message.type === "OFFSCREEN_SIGN_OUT"
  ) {
    activeMasterKey = null;
    if (autoLockTimer) {
      clearTimeout(autoLockTimer);
      autoLockTimer = null;
    }
    sendResponse({ success: true });
    return false;
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

import { api } from "@poohma/backend/api";
import type { Id } from "@poohma/backend/dataModel";
import { matchRecordUrl } from "@poohma/shared/utils/url-matcher";
import { ConvexHttpClient } from "convex/browser";
import { env } from "@/env";
import {
  clearAuthSession,
  type ExtensionFamily,
  type ExtensionUser,
  exchangeCustomToken,
  getAuthStorage,
  getValidIdToken,
  setAuthSession,
  setPendingSyncNonce,
} from "@/lib/auth";
import type { MatchedRecord, ServiceRecordItem } from "@/lib/messaging";
import { isTrustedPoohmaOrigin } from "@/lib/url";

const OFFSCREEN_PATH = "offscreen.html";

let creatingOffscreen: Promise<void> | null = null;
const convex = new ConvexHttpClient(env.VITE_CONVEX_URL);

type CachedRecord = ServiceRecordItem;

interface CachedRecordsState {
  records: CachedRecord[];
  timestamp: number;
  accountId: string;
}

let recordsCache: CachedRecordsState | null = null;
const CACHE_TTL_MS = 60 * 1000; // 1分キャッシュ

interface PendingSaveInfo {
  origin: string;
  url: string;
  title: string;
  loginId: string;
  timestamp: number;
}
let pendingSave: PendingSaveInfo | null = null;

export async function getRecordsCached(force = false): Promise<CachedRecord[]> {
  const now = Date.now();
  const storage = await getAuthStorage();
  const currentUser = storage.user;
  if (!currentUser?._id) {
    return [];
  }

  if (
    !force &&
    recordsCache &&
    recordsCache.accountId === currentUser._id &&
    now - recordsCache.timestamp < CACHE_TTL_MS
  ) {
    return recordsCache.records;
  }

  const token = await getValidIdToken(env.VITE_FIREBASE_API_KEY);
  if (!token) {
    return [];
  }

  // 共有クライアントの認証状態汚染を防ぐため、認証付き専用クライアントでクエリを実行
  const authedConvex = new ConvexHttpClient(env.VITE_CONVEX_URL);
  authedConvex.setAuth(token);
  const records = await authedConvex.query(api.records.getRecords, {
    accountId: currentUser._id as Id<"users">,
    includeHints: true,
  });

  recordsCache = {
    records: records || [],
    timestamp: now,
    accountId: currentUser._id,
  };
  return recordsCache.records;
}

// Offscreen Document のシングルトン起動管理（排他制御・コンテキスト存在保証付き）
async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType],
      documentUrls: [offscreenUrl],
    });

    if (existingContexts.length > 0) {
      console.log("[PoohMa Background] Offscreen document already active");
      return;
    }
  } catch (_err) {
    // getContexts 非対応環境のフォールバック
  }

  if (creatingOffscreen) {
    console.log(
      "[PoohMa Background] Waiting for existing createDocument promise...",
    );
    await creatingOffscreen;
    return;
  }

  console.log(
    "[PoohMa Background] Creating offscreen document with URL:",
    offscreenUrl,
  );
  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: offscreenUrl,
      reasons: [
        "DOM_SCRAPING" as chrome.offscreen.Reason,
        "BLOBS" as chrome.offscreen.Reason,
      ],
      justification:
        "Firebase Auth persistent session and Convex real-time synchronization",
    })
    .then(async () => {
      console.log(
        "[PoohMa Background] Offscreen document created successfully!",
      );
      // スクリプト初期化の完了をわずかに待機（安全マージン）
      await new Promise((resolve) => setTimeout(resolve, 150));
    })
    .catch((err) => {
      if (err?.message?.includes("Only a single offscreen")) {
        console.log(
          "[PoohMa Background] Single offscreen already exists (caught error)",
        );
        return;
      }
      console.error(
        "[PoohMa Background] Failed to create offscreen document:",
        err,
      );
      throw err;
    });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

export default defineBackground(() => {
  // ストレージアクセスを TRUSTED_CONTEXTS に限定（Content Script からの直接アクセス防止）
  if (chrome.storage?.local?.setAccessLevel) {
    chrome.storage.local
      .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
      .catch(() => {});
  }

  // ツールバーアイコンクリック時に Side Panel を開く動作を有効化
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((_err) => {
        // 初期化時の非対応またはエラーを握る
      });
  }

  // 起動時に Offscreen Document を準備
  ensureOffscreenDocument().catch((_err) => {
    // 起動待機
  });

  // メッセージ中継・ハンドリング
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 1. Web 連携短命同期コード引き換え（Background で直接・確実に実行）
    if (message?.type === "AUTH_SYNC_TOKEN") {
      (async () => {
        try {
          const { nonce, code, customToken, idToken } = message;
          if (!nonce || !code) {
            sendResponse({ success: false, error: "Invalid parameters" });
            return;
          }

          // 送信元コンテキストの厳格な検証（自拡張機能の Content Script かつ正規パスのみ許可）
          const senderUrl = sender.tab?.url;
          if (!sender.id || sender.id !== chrome.runtime.id || !senderUrl) {
            sendResponse({ success: false, error: "Untrusted sender context" });
            return;
          }

          try {
            const parsed = new URL(senderUrl);
            if (
              !isTrustedPoohmaOrigin(parsed.origin) ||
              parsed.pathname !== "/auth/extension-sync"
            ) {
              sendResponse({ success: false, error: "Untrusted sender" });
              return;
            }
          } catch {
            sendResponse({ success: false, error: "Invalid sender url" });
            return;
          }

          // 拡張機能側が発行した pendingSyncNonce との一致検証（未設定または不一致時は拒否）
          const currentStorage = await getAuthStorage();
          if (
            !currentStorage.pendingSyncNonce ||
            currentStorage.pendingSyncNonce !== nonce.trim()
          ) {
            sendResponse({ success: false, error: "Nonce mismatch" });
            return;
          }

          // リプレイ・二重引き換え防止のため、引き換え前にストレージ上の nonce を即時消費
          await setPendingSyncNonce("");

          // Convex から短命コードを検証・消費してアカウント情報を取得（共有クライアントは常に未認証）
          const res = await convex.mutation(api.extensionAuth.redeemSyncToken, {
            nonce: nonce.trim(),
            code: code.trim(),
          });

          if (!res?.success || !res.user) {
            sendResponse({ success: false, error: "Redeem failed" });
            return;
          }

          const extensionUser: ExtensionUser = {
            _id: res.user._id,
            userId: res.user.userId,
            displayName: res.user.displayName,
            email: res.user.email,
            photoURL: res.user.photoURL,
            familyId: res.user.familyId,
            familyRole: res.user.familyRole,
          };

          const extensionFamily: ExtensionFamily | null = res.family
            ? {
                _id: res.family._id,
                name: res.family.name,
                masterKeyEncrypted: res.family.masterKeyEncrypted,
                masterKeyIv: res.family.masterKeyIv,
                masterKeySalt: res.family.masterKeySalt,
                kdfIterations: res.family.kdfIterations,
                cryptoVersion: res.family.cryptoVersion,
              }
            : null;

          let activeIdToken = idToken;
          let activeRefreshToken: string | null = null;

          if (customToken) {
            const tokenRes = await exchangeCustomToken(
              customToken,
              env.VITE_FIREBASE_API_KEY,
            );
            if (tokenRes) {
              activeIdToken = tokenRes.idToken;
              activeRefreshToken = tokenRes.refreshToken;
            }
          }

          const extensionAccounts: ExtensionUser[] =
            Array.isArray(res.accounts) && res.accounts.length > 0
              ? res.accounts.map((a) => ({
                  _id: a._id,
                  userId: a.userId,
                  displayName: a.displayName,
                  email: a.email,
                  photoURL: a.photoURL,
                  familyId: a.familyId,
                  familyRole: a.familyRole,
                }))
              : [extensionUser];

          if (
            message.theme &&
            (message.theme === "light" ||
              message.theme === "dark" ||
              message.theme === "system")
          ) {
            await chrome.storage.local.set({ theme: message.theme });
          }

          // ストレージにセッション保存（Side Panel が storage.onChanged で即座に検知）
          await setAuthSession(
            extensionUser,
            extensionFamily,
            customToken,
            activeIdToken,
            activeRefreshToken,
            extensionAccounts,
          );

          // 全体へ認証完了をブロードキャスト
          chrome.runtime
            .sendMessage({
              type: "AUTH_STATE_CHANGED",
              isAuthenticated: true,
              user: extensionUser,
              accounts: extensionAccounts,
              family: extensionFamily,
            })
            .catch(() => {});

          // Offscreen へ Custom Token を渡して Firebase セッションを確立
          if (customToken) {
            ensureOffscreenDocument()
              .then(() => {
                chrome.runtime
                  .sendMessage({
                    type: "OFFSCREEN_SIGN_IN_CUSTOM_TOKEN",
                    customToken,
                    userId: extensionUser.userId,
                  })
                  .catch(() => {});
              })
              .catch(() => {});
          }

          sendResponse({
            success: true,
            user: extensionUser,
            family: extensionFamily,
          });
        } catch (_err) {
          sendResponse({ success: false, error: "Sync failed" });
        }
      })();
      return true;
    }

    // 2. ログアウト処理（Background で確実にセッション破棄 ＋ Offscreen 破棄）
    if (message?.type === "AUTH_SIGN_OUT") {
      (async () => {
        try {
          convex.clearAuth();
          recordsCache = null;
          await clearAuthSession();
        } catch (_e) {}

        // Offscreen Document が存在すれば Firebase サインアウト・暗号鍵破棄を実行
        chrome.runtime
          .sendMessage({
            type: "OFFSCREEN_SIGN_OUT",
          })
          .catch(() => {});

        // 全体へログアウト完了通知
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

    // 3. Side Panel オープン要求
    if (message?.type === "OPEN_SIDEPANEL") {
      const windowId = message.windowId;
      const tabId = message.tabId || sender.tab?.id;
      if (chrome.sidePanel?.open) {
        const promise = windowId
          ? chrome.sidePanel.open({ windowId })
          : tabId
            ? chrome.sidePanel.open({ tabId })
            : chrome.windows.getCurrent().then((w) => {
                if (w?.id) return chrome.sidePanel.open({ windowId: w.id });
                throw new Error("No active window");
              });

        promise
          .then(() => sendResponse({ success: true }))
          .catch(() => sendResponse({ success: false }));
        return true;
      }
      sendResponse({ success: false });
      return false;
    }

    // 3.1 パスワードヒント閲覧監査ログ記録
    if (message?.type === "LOG_RECORD_HINT_VIEW" && message.recordId) {
      (async () => {
        try {
          const token = await getValidIdToken(env.VITE_FIREBASE_API_KEY);
          if (token) {
            convex.setAuth(token);
            await convex.mutation(api.records.logRecordHintView, {
              recordId: message.recordId as Id<"serviceRecords">,
            });
            convex.clearAuth();
          }
          sendResponse({ success: true });
        } catch {
          sendResponse({ success: false });
        }
      })();
      return true;
    }

    // 3. 現在のアクティブタブ情報取得
    if (message?.type === "GET_CURRENT_TAB_INFO") {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([activeTab]) => {
          sendResponse({
            tabId: activeTab?.id,
            url: activeTab?.url,
            title: activeTab?.title,
          });
        })
        .catch((_err) => {
          sendResponse({ tabId: undefined, url: undefined, title: undefined });
        });
      return true;
    }

    // 4. アクティブタブへのログインID入力中継
    if (message?.type === "FORWARD_FILL_LOGIN_ID") {
      const targetTabId = message.tabId;
      if (targetTabId) {
        chrome.tabs
          .sendMessage(targetTabId, {
            type: "CONTENT_FILL_LOGIN_ID",
            loginId: message.loginId,
          })
          .then((res) => {
            sendResponse(res ?? { success: false });
          })
          .catch((_err) => {
            sendResponse({ success: false });
          });
        return true;
      }
      sendResponse({ success: false });
      return false;
    }

    // 5. Offscreen Document の起動完了待機（Side Panel 等からの事前保証用）
    if (message?.type === "ENSURE_OFFSCREEN") {
      ensureOffscreenDocument()
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;
    }

    // 6. レコード一覧の取得（Background で直接 Convex から取得し、自律サジェスト・Sidepanel へ即時応答。期限切れ時は自動リフレッシュ）
    if (message?.type === "GET_ALL_RECORDS") {
      (async () => {
        try {
          const records = await getRecordsCached(true);
          console.log(
            "[PoohMa Background] getRecordsCached returned count:",
            records?.length ?? 0,
          );
          sendResponse({ success: true, records: records ?? [] });
        } catch (err) {
          console.error(
            "[PoohMa Background] GET_ALL_RECORDS error caught:",
            err,
          );
          sendResponse({ success: false, records: [] });
        }
      })();
      return true;
    }

    // 7. カレントページに一致するレコード候補の取得（Content Script のインラインサジェスト用）
    if (message?.type === "GET_MATCHED_RECORDS") {
      (async () => {
        try {
          const pageUrl = message.url;
          if (!pageUrl) {
            sendResponse({ success: true, matchedRecords: [] });
            return;
          }

          const records = await getRecordsCached();
          const matched: MatchedRecord[] = records
            .filter((r) => r.url && matchRecordUrl(pageUrl, r.url) !== "none")
            .map((r) => ({
              _id: r._id,
              title: r.title,
              url: r.url,
              credentials: (r.credentials || []).map((c) => ({
                _id: c._id,
                label: c.label,
                loginId: c.loginId ?? "",
                hasPasswordHint: !!c.passwordHint,
              })),
            }));

          sendResponse({ success: true, matchedRecords: matched });
        } catch (_err) {
          sendResponse({ success: false, matchedRecords: [] });
        }
      })();
      return true;
    }

    // 8. 新規レコード作成画面を Web で開く（未登録サイトでの自律保存サジェスト用）
    if (message?.type === "OPEN_NEW_RECORD") {
      const { url, title, loginId } = message;
      pendingSave = null;
      const targetUrl = new URL(`${env.VITE_SITE_URL}/records/new`);
      if (url) targetUrl.searchParams.set("url", url);
      if (title) targetUrl.searchParams.set("title", title);
      if (loginId) targetUrl.searchParams.set("loginId", loginId);

      chrome.tabs.create({ url: targetUrl.toString() });
      sendResponse({ success: true });
      return false;
    }

    // 8.1 ページ遷移をまたぐ保存サジェストの一時保持・取得・破棄
    if (message?.type === "SET_PENDING_SAVE") {
      const { url, title, loginId } = message;
      if (url) {
        try {
          const origin = new URL(url).origin;
          pendingSave = {
            origin,
            url,
            title: title || "",
            loginId: loginId || "",
            timestamp: Date.now(),
          };
          console.log(
            "[PoohMa Background] Stored pending save for origin:",
            origin,
          );
        } catch (_) {}
      }
      sendResponse({ success: true });
      return false;
    }

    if (message?.type === "GET_PENDING_SAVE") {
      const { url } = message;
      if (url && pendingSave) {
        try {
          const origin = new URL(url).origin;
          const isExpired = Date.now() - pendingSave.timestamp > 120000; // 2分有効
          if (pendingSave.origin === origin && !isExpired) {
            const data = { ...pendingSave };
            // 一度引き渡されたら消費（二重バナー表示防止）
            pendingSave = null;
            sendResponse({ success: true, pendingSave: data });
            return false;
          }
        } catch (_) {}
      }
      sendResponse({ success: false, pendingSave: null });
      return false;
    }

    if (message?.type === "CLEAR_PENDING_SAVE") {
      pendingSave = null;
      sendResponse({ success: true });
      return false;
    }

    // 7. Offscreen Document からのログ通知受信
    if (message?.type === "OFFSCREEN_LOG") {
      console.log("[PoohMa Background] [From Offscreen]:", message.text);
      sendResponse({ received: true });
      return false;
    }

    // 8. Offscreen Document を必要とする暗号・認証メッセージの起動保証
    const offscreenMessageTypes = [
      "AUTH_SIGN_OUT",
      "AUTH_GET_STATE",
      "VAULT_UNLOCK",
      "VAULT_LOCK",
      "VAULT_GET_STATUS",
      "VAULT_DECRYPT_HINT",
      "GET_FAMILY_CRYPTO_INFO",
    ];

    if (message?.type && offscreenMessageTypes.includes(message.type)) {
      ensureOffscreenDocument().catch(() => {});
      return;
    }

    // 9. Content Script からのフォーム検知通知（自律サジェスト・ID入力補助の基盤）
    if (message?.type === "CONTENT_FORM_DETECTED") {
      const tabUrl = sender.tab?.url;
      if (tabUrl) {
        ensureOffscreenDocument().catch(() => {});
      }
      sendResponse({ received: true });
      return false;
    }

    return;
  });
});

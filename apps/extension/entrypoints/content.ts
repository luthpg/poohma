import type { MatchedRecord } from "@/lib/messaging";
import { isTrustedPoohmaOrigin, normalizeUrl } from "@/lib/url";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    let activeInput: HTMLInputElement | null = null;
    let saveBannerContainer: HTMLDivElement | null = null;
    let bannerAutoCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let saveTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
    let matchedRecords: MatchedRecord[] = [];
    let hasCheckedRecords = false;
    const handledSyncCodes = new Set<string>();
    let isSyncing = false;

    // ドメインごとの保存提案 Dismiss 状態（セッション永続化）
    const hostname = window.location.hostname;
    const DISMISS_KEY = `poohma_save_dismissed_${hostname}`;
    let isSaveDismissed = false;

    // 同期ストレージ（sessionStorage）から即時反映（タブ内リロード・SPA遷移対応）
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "true") {
        isSaveDismissed = true;
      }
    } catch (_) {}

    // chrome.storage.session からも非同期同期（複数タブ間での共有）
    if (chrome.storage?.session) {
      chrome.storage.session
        .get([DISMISS_KEY])
        .then((items) => {
          if (items[DISMISS_KEY]) {
            isSaveDismissed = true;
          }
        })
        .catch(() => {});
    }

    function dismissSaveSuggestion() {
      isSaveDismissed = true;
      try {
        sessionStorage.setItem(DISMISS_KEY, "true");
      } catch (_) {}
      if (chrome.storage?.session) {
        chrome.storage.session.set({ [DISMISS_KEY]: true }).catch(() => {});
      }
    }

    // 1. Web アプリ（auth/extension-sync）からの連携メッセージ監視
    window.addEventListener("message", async (event) => {
      // 送信元オリジンの検証（自オリジン ＆ PoohMa 信頼ドメイン ＆ 連携パス）
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isTrustedPoohmaOrigin(event.origin)) {
        return;
      }
      if (window.location.pathname !== "/auth/extension-sync") {
        return;
      }

      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "POOHMA_AUTH_SYNC"
      ) {
        const { nonce, code, theme } = event.data;
        if (
          typeof nonce === "string" &&
          typeof code === "string" &&
          nonce &&
          code
        ) {
          const syncKey = `${nonce}:${code}`;
          if (handledSyncCodes.has(syncKey) || isSyncing) {
            return;
          }

          isSyncing = true;
          try {
            if (!chrome.runtime?.id) {
              return;
            }

            // トークンは一切触らず nonce と code のみを Background へ中継
            const res = await chrome.runtime.sendMessage({
              type: "AUTH_SYNC_TOKEN",
              nonce,
              code,
              theme,
            });

            if (res?.success) {
              handledSyncCodes.add(syncKey);
              // Web 側へ同期完了 ACK を送信（Web が完了画面を描画できるようにする）
              window.postMessage(
                { type: "POOHMA_AUTH_SYNC_ACK", nonce, success: true },
                window.location.origin,
              );
              // 同期成功後にこのページのレコードを再取得
              queryMatchedRecords(true);
            }
          } catch (_err: unknown) {
            // エラーオブジェクトはログ露出させずに握る（CWE-209保護）
          } finally {
            isSyncing = false;
          }
        }
      }
    });

    // 2. カレントページに一致するレコードの問い合わせ
    async function queryMatchedRecords(force = false) {
      if (hasCheckedRecords && !force) return;
      if (!chrome.runtime?.id) return;

      try {
        const res = await chrome.runtime.sendMessage({
          type: "GET_MATCHED_RECORDS",
          url: normalizeUrl(window.location.href),
        });

        if (res?.success && Array.isArray(res.matchedRecords)) {
          matchedRecords = res.matchedRecords;
          hasCheckedRecords = true;
        }
      } catch (_err) {
        // バックグラウンド未準備時は握る
      }
    }

    // 3. 安全な保存サジェストバナーの構築（innerHTML を使わず DOM API + textContent で XSS を完全排除）
    function showSaveSuggestionBanner(detectedLoginId: string) {
      if (isSaveDismissed) return;
      if (saveBannerContainer) return;
      if (!document.body) {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            showSaveSuggestionBanner(detectedLoginId);
          },
          { once: true },
        );
        return;
      }

      const banner = document.createElement("div");
      banner.id = "poohma-save-banner";
      banner.setAttribute("role", "alert");
      banner.style.position = "fixed";
      banner.style.bottom = "24px";
      banner.style.right = "24px";
      banner.style.zIndex = "2147483647";
      banner.style.backgroundColor = "#ffffff";
      banner.style.color = "#0f172a";
      banner.style.border = "1px solid #fed7aa";
      banner.style.borderRadius = "8px";
      banner.style.padding = "14px 16px";
      banner.style.boxShadow =
        "0 10px 25px -5px rgba(249, 115, 22, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";
      banner.style.maxWidth = "340px";
      banner.style.fontSize = "12px";
      banner.style.fontFamily =
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "flex-start";
      row.style.gap = "10px";
      row.style.position = "relative";

      // アイコン
      const iconWrap = document.createElement("div");
      iconWrap.style.width = "28px";
      iconWrap.style.height = "28px";
      iconWrap.style.borderRadius = "6px";
      iconWrap.style.backgroundColor = "#f97316";
      iconWrap.style.display = "flex";
      iconWrap.style.alignItems = "center";
      iconWrap.style.justifyContent = "center";
      iconWrap.style.flexShrink = "0";

      const iconSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      iconSvg.setAttribute("width", "16");
      iconSvg.setAttribute("height", "16");
      iconSvg.setAttribute("viewBox", "0 0 24 24");
      iconSvg.setAttribute("fill", "none");
      iconSvg.setAttribute("stroke", "#ffffff");
      iconSvg.setAttribute("stroke-width", "2.5");
      iconSvg.setAttribute("stroke-linecap", "round");
      iconSvg.setAttribute("stroke-linejoin", "round");
      const path1 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path1.setAttribute("d", "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
      const path2 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path2.setAttribute("d", "m9 12 2 2 4-4");
      iconSvg.appendChild(path1);
      iconSvg.appendChild(path2);
      iconWrap.appendChild(iconSvg);

      // 本文
      const contentWrap = document.createElement("div");
      contentWrap.style.flex = "1";
      contentWrap.style.paddingRight = "16px";

      const titleEl = document.createElement("div");
      titleEl.style.fontWeight = "600";
      titleEl.style.fontSize = "13px";
      titleEl.style.color = "#0f172a";
      titleEl.style.lineHeight = "1.3";
      titleEl.textContent = "PoohMa に登録しますか？";

      const descEl = document.createElement("div");
      descEl.style.fontSize = "11px";
      descEl.style.color = "#64748b";
      descEl.style.marginTop = "2px";
      descEl.textContent = detectedLoginId
        ? `${hostname} (${detectedLoginId})`
        : hostname;

      const actionsRow = document.createElement("div");
      actionsRow.style.display = "flex";
      actionsRow.style.alignItems = "center";
      actionsRow.style.gap = "8px";
      actionsRow.style.marginTop = "10px";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.style.all = "unset";
      saveBtn.style.background = "#f97316";
      saveBtn.style.color = "#ffffff";
      saveBtn.style.padding = "5px 12px";
      saveBtn.style.borderRadius = "6px";
      saveBtn.style.fontSize = "11px";
      saveBtn.style.fontWeight = "600";
      saveBtn.style.cursor = "pointer";
      saveBtn.textContent = "PoohMa に保存";

      const dismissBtn = document.createElement("button");
      dismissBtn.type = "button";
      dismissBtn.style.all = "unset";
      dismissBtn.style.color = "#64748b";
      dismissBtn.style.padding = "5px 8px";
      dismissBtn.style.fontSize = "11px";
      dismissBtn.style.cursor = "pointer";
      dismissBtn.textContent = "後で";

      actionsRow.appendChild(saveBtn);
      actionsRow.appendChild(dismissBtn);

      contentWrap.appendChild(titleEl);
      contentWrap.appendChild(descEl);
      contentWrap.appendChild(actionsRow);

      // 閉じるボタン
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.setAttribute("aria-label", "閉じる");
      closeBtn.style.all = "unset";
      closeBtn.style.position = "absolute";
      closeBtn.style.top = "-4px";
      closeBtn.style.right = "-4px";
      closeBtn.style.cursor = "pointer";
      closeBtn.style.color = "#94a3b8";
      closeBtn.style.padding = "4px";
      closeBtn.style.display = "flex";
      closeBtn.style.alignItems = "center";
      closeBtn.style.justifyContent = "center";

      const closeSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      closeSvg.setAttribute("width", "14");
      closeSvg.setAttribute("height", "14");
      closeSvg.setAttribute("viewBox", "0 0 24 24");
      closeSvg.setAttribute("fill", "none");
      closeSvg.setAttribute("stroke", "currentColor");
      closeSvg.setAttribute("stroke-width", "2");
      closeSvg.setAttribute("stroke-linecap", "round");
      closeSvg.setAttribute("stroke-linejoin", "round");
      const line1 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line1.setAttribute("x1", "18");
      line1.setAttribute("y1", "6");
      line1.setAttribute("x2", "6");
      line1.setAttribute("y2", "18");
      const line2 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line2.setAttribute("x1", "6");
      line2.setAttribute("y1", "6");
      line2.setAttribute("x2", "18");
      line2.setAttribute("y2", "18");
      closeSvg.appendChild(line1);
      closeSvg.appendChild(line2);
      closeBtn.appendChild(closeSvg);

      row.appendChild(iconWrap);
      row.appendChild(contentWrap);
      row.appendChild(closeBtn);
      banner.appendChild(row);

      document.body.appendChild(banner);
      saveBannerContainer = banner;

      saveBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissSaveSuggestion();
        chrome.runtime
          .sendMessage({
            type: "OPEN_NEW_RECORD",
            url: normalizeUrl(window.location.href),
            title: document.title,
            loginId: detectedLoginId,
          })
          .catch(() => {});
        hideSaveBanner();
      });

      const handleDismiss = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dismissSaveSuggestion();
        chrome.runtime
          .sendMessage({ type: "CLEAR_PENDING_SAVE" })
          .catch(() => {});
        hideSaveBanner();
      };

      dismissBtn.addEventListener("click", handleDismiss);
      closeBtn.addEventListener("click", handleDismiss);

      // 12秒後に自動で閉じる
      bannerAutoCloseTimer = setTimeout(() => {
        dismissSaveSuggestion();
        chrome.runtime
          .sendMessage({ type: "CLEAR_PENDING_SAVE" })
          .catch(() => {});
        hideSaveBanner();
      }, 12000);
    }

    function hideSaveBanner() {
      if (bannerAutoCloseTimer) {
        clearTimeout(bannerAutoCloseTimer);
        bannerAutoCloseTimer = null;
      }
      if (saveBannerContainer) {
        saveBannerContainer.remove();
        saveBannerContainer = null;
      }
    }

    // パスワード入力欄（またはパスワード表示切り替え等の疑いがある欄）か判定
    function isPasswordLikeInput(input: HTMLInputElement): boolean {
      if (input.type === "password") return true;
      const name = input.name.toLowerCase();
      const id = input.id.toLowerCase();
      const autocomplete = (input.autocomplete || "").toLowerCase();
      return (
        name.includes("password") ||
        name.includes("passwd") ||
        id.includes("password") ||
        id.includes("passwd") ||
        autocomplete.includes("password")
      );
    }

    // フォーム内から安全にログインIDを抽出する（パスワード欄は完全除外）
    function extractLoginIdFromForm(form: HTMLFormElement | null): string {
      if (!form) return "";

      const selectors = [
        'input[type="email"]',
        'input[autocomplete="username"]',
        'input[name*="user" i]',
        'input[id*="user" i]',
        'input[name*="login" i]',
        'input[type="text"]',
      ];

      for (const selector of selectors) {
        const inputs = form.querySelectorAll(selector);
        for (const el of inputs) {
          const input = el as HTMLInputElement;
          if (isPasswordLikeInput(input)) continue;
          const val = input.value?.trim();
          if (val && val.length > 0 && !val.includes("\n")) {
            return val;
          }
        }
      }
      return "";
    }

    // 保存サジェストのトリガー判定（常時入力監視を撤廃し、送信アクション時のみ実行）
    function checkAndTriggerSaveSuggestion(
      submittedForm?: HTMLFormElement | null,
    ) {
      if (window.self !== window.top) return;
      if (isSaveDismissed) return;
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === "true") {
          isSaveDismissed = true;
          return;
        }
      } catch (_) {}

      // パスワード入力欄が存在するフォームのみ対象（.value は一切読み取らない）
      const form =
        submittedForm || activeInput?.form || document.querySelector("form");
      const hasPasswordInput = form
        ? form.querySelector('input[type="password"]') !== null
        : document.querySelector('input[type="password"]') !== null;

      if (!hasPasswordInput) {
        return;
      }

      // 送信対象フォームから安全にログインIDを抽出
      const loginId = extractLoginIdFromForm(form);

      // 既登録サイトで、既存の ID と一致する場合はサジェストしない
      if (matchedRecords.length > 0 && loginId) {
        const isAlreadyRegistered = matchedRecords.some((r) =>
          r.credentials.some(
            (c) => c.loginId.toLowerCase() === loginId.toLowerCase(),
          ),
        );
        if (isAlreadyRegistered) {
          return;
        }
      }

      // Background に保留中保存（Pending Save）を登録
      chrome.runtime
        .sendMessage({
          type: "SET_PENDING_SAVE",
          url: normalizeUrl(window.location.href),
          title: document.title,
          loginId,
        })
        .catch(() => {});

      // 現在のページでもバナーを表示
      showSaveSuggestionBanner(loginId);
    }

    function scheduleSaveSuggestion(
      form?: HTMLFormElement | null,
      delay = 400,
    ) {
      if (isSaveDismissed) return;
      if (saveTriggerTimeout) {
        clearTimeout(saveTriggerTimeout);
      }
      saveTriggerTimeout = setTimeout(() => {
        saveTriggerTimeout = null;
        checkAndTriggerSaveSuggestion(form);
      }, delay);
    }

    // SPA クライアントサイドルーティング検知
    let lastObservedUrl = window.location.href;

    // ページロード・SPA遷移後にログインフォームの存在を検知して Background に通知（自動Popup・バッジ用）
    function checkLoginFormPresence() {
      setTimeout(() => {
        if (!chrome.runtime?.id) return;
        const hasPasswordInput =
          document.querySelector('input[type="password"]') !== null;
        if (hasPasswordInput) {
          chrome.runtime
            .sendMessage({
              type: "CONTENT_FORM_DETECTED",
              url: normalizeUrl(window.location.href),
            })
            .catch(() => {});
        }
      }, 800);
    }

    function handleSpaNavigation() {
      const currentUrl = window.location.href;
      if (currentUrl === lastObservedUrl) return;
      lastObservedUrl = currentUrl;

      queryMatchedRecords(true);
      checkLoginFormPresence();

      if (!isSaveDismissed) {
        try {
          if (sessionStorage.getItem(DISMISS_KEY) === "true") {
            isSaveDismissed = true;
            return;
          }
        } catch (_) {}

        chrome.runtime
          .sendMessage({
            type: "GET_PENDING_SAVE",
            url: normalizeUrl(window.location.href),
          })
          .then((res) => {
            if (res?.success && res.pendingSave) {
              showSaveSuggestionBanner(res.pendingSave.loginId);
            }
          })
          .catch(() => {});
      }
    }

    // 4. イベントリスナー登録
    function attachListeners() {
      queryMatchedRecords();
      checkLoginFormPresence();

      window.addEventListener("popstate", handleSpaNavigation);
      window.addEventListener("hashchange", handleSpaNavigation);
      setInterval(() => {
        if (window.location.href !== lastObservedUrl) {
          handleSpaNavigation();
        }
      }, 500);

      // ページ読み込み直後の保留中保存確認
      chrome.runtime
        .sendMessage({
          type: "GET_PENDING_SAVE",
          url: normalizeUrl(window.location.href),
        })
        .then((res) => {
          if (res?.success && res.pendingSave) {
            const { loginId } = res.pendingSave;
            if (!isSaveDismissed) {
              try {
                if (sessionStorage.getItem(DISMISS_KEY) === "true") {
                  isSaveDismissed = true;
                  return;
                }
              } catch (_) {}
              showSaveSuggestionBanner(loginId);
            }
          }
        })
        .catch(() => {});

      // フォーカス中の入力要素を追跡（入力補完先のフォールバック用）
      document.addEventListener("focusin", (e) => {
        const target = e.target as HTMLElement;
        if (target && target.tagName === "INPUT") {
          activeInput = target as HTMLInputElement;
        }
      });

      // フォーム送信（submit）時の保存サジェスト
      document.addEventListener("submit", (e) => {
        if (isSaveDismissed) return;
        const form = e.target as HTMLFormElement;
        if (form?.querySelector?.('input[type="password"]')) {
          scheduleSaveSuggestion(form, 300);
        }
      });

      // ログイン/登録系ボタンクリック時の保存サジェスト
      document.addEventListener("click", (e) => {
        if (isSaveDismissed) return;

        const target = e.target as HTMLElement;
        const btn = target.closest(
          'button, input[type="submit"], [role="button"]',
        );
        if (btn) {
          if (
            btn.id.startsWith("poohma-") ||
            btn.closest("#poohma-save-banner")
          ) {
            return;
          }

          if (btn.closest("header, nav")) {
            return;
          }

          const isSubmitType = (btn as HTMLInputElement).type === "submit";
          const btnText = (
            btn.textContent ||
            (btn as HTMLInputElement).value ||
            ""
          ).toLowerCase();
          const isActionText =
            /ログイン|サインイン|登録|アカウント作成|sign\s*in|log\s*in|sign\s*up|register|submit|continue|次へ|送信/i.test(
              btnText,
            );

          if (isSubmitType || isActionText) {
            const form = btn.closest("form") || activeInput?.form;
            scheduleSaveSuggestion(form, 400);
          }
        }
      });

      // パスワード欄での Enter キー押下時の保存サジェスト
      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !isSaveDismissed) {
          const target = e.target as HTMLElement;
          if (
            target &&
            target.tagName === "INPUT" &&
            (target as HTMLInputElement).type === "password"
          ) {
            const form = (target as HTMLInputElement).form;
            scheduleSaveSuggestion(form, 400);
          }
        }
      });
    }

    // 5. ログインID安全自動入力メッセージ受信
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "CONTENT_FILL_LOGIN_ID" && message.loginId) {
        // パスワード欄ではない有効な入力要素を厳格に探索
        const isEligibleInput = (el: HTMLInputElement | null) => {
          if (!el) return false;
          if (el.disabled || el.readOnly) return false;
          const type = (el.type || "text").toLowerCase();
          if (
            type === "password" ||
            type === "hidden" ||
            type === "checkbox" ||
            type === "radio"
          ) {
            return false;
          }
          return el.offsetParent !== null; // 可視状態チェック
        };

        let targetInput: HTMLInputElement | null = null;
        if (isEligibleInput(activeInput)) {
          targetInput = activeInput;
        } else {
          // ページ内の安全な ID 入力欄を探索
          const candidate = document.querySelector(
            'input[type="email"]:not([type="password"]), input[autocomplete="username"]:not([type="password"]), input[name*="user" i]:not([type="password"]), input[name*="login" i]:not([type="password"]):not([name*="pass" i]), input[type="text"]:not([type="password"])',
          ) as HTMLInputElement | null;
          if (isEligibleInput(candidate)) {
            targetInput = candidate;
          }
        }

        if (targetInput) {
          targetInput.focus();
          targetInput.value = message.loginId;
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
          targetInput.dispatchEvent(new Event("change", { bubbles: true }));

          // もし同じフォーム内にパスワード欄があればそちらへフォーカスを移す
          const form = targetInput.form;
          const passwordInput = (form?.querySelector(
            'input[type="password"]',
          ) ||
            document.querySelector(
              'input[type="password"]',
            )) as HTMLInputElement | null;
          if (passwordInput && passwordInput !== targetInput) {
            setTimeout(() => {
              passwordInput.focus();
            }, 50);
          }

          sendResponse({ success: true });
          return false;
        }

        sendResponse({
          success: false,
          reason: "No eligible text/email input element found",
        });
        return false;
      }
      return false;
    });

    attachListeners();
  },
});

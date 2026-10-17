interface MatchedCredential {
  _id: string;
  label?: string;
  loginId: string;
  hasPasswordHint: boolean;
}

interface MatchedRecord {
  _id: string;
  title: string;
  url?: string;
  credentials: MatchedCredential[];
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  main() {
    let activeInput: HTMLInputElement | null = null;
    let badgeContainer: HTMLDivElement | null = null;
    let popupContainer: HTMLDivElement | null = null;
    let saveBannerContainer: HTMLDivElement | null = null;
    let bannerAutoCloseTimer: ReturnType<typeof setTimeout> | null = null;
    let saveTriggerTimeout: ReturnType<typeof setTimeout> | null = null;
    let matchedRecords: MatchedRecord[] = [];
    let hasCheckedRecords = false;
    let lastEnteredLoginId = "";
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

    console.log(
      "[PoohMa Content] Content script initialized on:",
      window.location.href,
    );

    // 1. Web アプリ（auth/extension-sync）からの連携メッセージ監視
    window.addEventListener("message", async (event) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "POOHMA_AUTH_SYNC"
      ) {
        console.log("[PoohMa Content] Received POOHMA_AUTH_SYNC from web:", {
          nonce: event.data.nonce?.slice(0, 8),
          hasCode: !!event.data.code,
          hasIdToken: !!event.data.idToken,
          hasCustomToken: !!event.data.customToken,
        });

        const { nonce, code, customToken, idToken } = event.data;
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

            console.log(
              "[PoohMa Content] Forwarding AUTH_SYNC_TOKEN to Background...",
            );
            const res = await chrome.runtime.sendMessage({
              type: "AUTH_SYNC_TOKEN",
              nonce,
              code,
              customToken,
              idToken,
            });

            console.log("[PoohMa Content] Background response received:", res);
            if (res?.success) {
              handledSyncCodes.add(syncKey);
              // 同期成功後にこのページのレコードを再取得
              queryMatchedRecords(true);
            }
          } catch (err: unknown) {
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            if (errorMessage.includes("Extension context invalidated")) {
              console.warn(
                "[PoohMa Content] Extension was reloaded. Please refresh this page.",
              );
            } else {
              console.error(
                "[PoohMa Content] chrome.runtime.sendMessage failed:",
                errorMessage,
              );
            }
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
          url: window.location.href,
        });

        if (res?.success && Array.isArray(res.matchedRecords)) {
          matchedRecords = res.matchedRecords;
          hasCheckedRecords = true;
          console.log(
            "[PoohMa Content] Matched records found for current site:",
            matchedRecords.length,
          );
        }
      } catch (_err) {
        // バックグラウンド未準備時は握る
      }
    }

    // 3. PoohMa 入力支援バッジの作成（絵文字完全排除・Lucide準拠SVG）
    function createBadge() {
      if (badgeContainer) return badgeContainer;

      const container = document.createElement("div");
      container.id = "poohma-floating-badge";
      container.style.position = "absolute";
      container.style.zIndex = "2147483647";
      container.style.display = "none";
      container.style.cursor = "pointer";
      container.style.userSelect = "none";
      container.style.transition = "transform 0.15s ease, opacity 0.15s ease";
      container.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.15))";

      const button = document.createElement("button");
      button.type = "button";
      button.title = "PoohMaを開く";
      button.style.all = "unset";
      button.style.width = "24px";
      button.style.height = "24px";
      button.style.borderRadius = "50%";
      button.style.backgroundColor = "#f97316";
      button.style.display = "flex";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.style.cursor = "pointer";
      button.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)";

      // シールドアイコン SVG
      button.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      `;

      button.addEventListener("mouseenter", () => {
        button.style.transform = "scale(1.1)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.transform = "scale(1)";
      });

      // クリック時にサジェストポップオーバーまたは Side Panel を開く
      button.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (matchedRecords.length > 0 && activeInput) {
          showAutofillPopup(activeInput);
        } else {
          chrome.runtime
            .sendMessage({ type: "OPEN_SIDEPANEL" })
            .catch(() => {});
        }
      });

      container.appendChild(button);
      document.body.appendChild(container);
      badgeContainer = container;
      return container;
    }

    function positionBadge(input: HTMLInputElement) {
      const badge = createBadge();
      const rect = input.getBoundingClientRect();
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;

      badge.style.left = `${rect.right + scrollX - 32}px`;
      badge.style.top = `${rect.top + scrollY + (rect.height - 24) / 2}px`;
      badge.style.display = "block";
      badge.style.opacity = "1";
    }

    function hideBadge() {
      if (badgeContainer) {
        badgeContainer.style.display = "none";
      }
    }

    type FormKind = "signup" | "login" | "unknown";

    // フォームの種別（ログイン vs サインアップ/新規登録）を総合判定
    function detectFormKind(input: HTMLInputElement): FormKind {
      // 1. input 自身の autocomplete 属性
      const autocomplete = (
        input.getAttribute("autocomplete") || ""
      ).toLowerCase();
      if (autocomplete === "new-password") {
        return "signup";
      }
      if (autocomplete === "current-password") {
        return "login";
      }

      const form =
        input.form || input.closest("form") || input.closest('[role="form"]');

      // 2. フォーム内の他の要素やコンテキストから判定
      if (form) {
        if (form.querySelector('input[autocomplete="new-password"]')) {
          return "signup";
        }
        if (form.querySelector('input[autocomplete="current-password"]')) {
          return "login";
        }

        // パスワード入力欄が2つ以上存在（パスワード + 再確認）
        const passwordInputs = form.querySelectorAll('input[type="password"]');
        if (passwordInputs.length >= 2) {
          return "signup";
        }

        // パスワード確認フィールドの存在
        const hasConfirmField = form.querySelector(
          'input[name*="confirm" i], input[id*="confirm" i], input[name*="repeat" i], input[id*="repeat" i], input[name*="retype" i]',
        );
        if (hasConfirmField) {
          return "signup";
        }

        // フォームのアクションURLやID、クラス名
        const formAction = (form.getAttribute("action") || "").toLowerCase();
        const formId = (form.id || "").toLowerCase();
        const formClass = (form.className || "").toString().toLowerCase();
        if (
          /signup|sign-up|register|registration|join|create/i.test(
            formAction,
          ) ||
          /signup|sign-up|register|registration|join|create/i.test(formId) ||
          /signup|sign-up|register|registration|join|create/i.test(formClass)
        ) {
          return "signup";
        }
        if (
          /login|signin|sign-in|auth|session/i.test(formAction) ||
          /login|signin|sign-in|auth|session/i.test(formId) ||
          /login|signin|sign-in|auth|session/i.test(formClass)
        ) {
          return "login";
        }

        // フォーム内のボタンテキスト
        const buttons = form.querySelectorAll(
          'button, input[type="submit"], [role="button"]',
        );
        for (const btn of buttons) {
          const text = (
            btn.textContent ||
            (btn as HTMLInputElement).value ||
            ""
          ).toLowerCase();
          if (
            /新規登録|登録する|アカウント作成|無料登録|サインアップ|sign\s*up|register|join|create\s*account/i.test(
              text,
            )
          ) {
            return "signup";
          }
          if (/ログイン|サインイン|log\s*in|sign\s*in/i.test(text)) {
            return "login";
          }
        }
      }

      // 3. ページ全体の URL パス判定
      const urlPath = (
        window.location.pathname +
        window.location.search +
        window.location.hash
      ).toLowerCase();
      if (
        /signup|sign-up|register|registration|join|create.*account|get-started/i.test(
          urlPath,
        )
      ) {
        return "signup";
      }
      if (/login|signin|sign-in|session|auth/i.test(urlPath)) {
        return "login";
      }

      // 4. input 自身の属性（name, id, placeholder 等）
      const inputAttrs = [
        input.name,
        input.id,
        input.placeholder,
        input.getAttribute("aria-label"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (/signup|register|create|new/i.test(inputAttrs)) {
        return "signup";
      }

      return "unknown";
    }

    // 4. クイック入力サジェストポップオーバーの作成・表示
    function showAutofillPopup(input: HTMLInputElement) {
      if (matchedRecords.length === 0) return;

      const isPassword = (input.type || "").toLowerCase() === "password";

      if (!popupContainer) {
        popupContainer = document.createElement("div");
        popupContainer.id = "poohma-autofill-popup";
        document.body.appendChild(popupContainer);
      }

      const rect = input.getBoundingClientRect();
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;

      popupContainer.style.position = "absolute";
      popupContainer.style.left = `${rect.left + scrollX}px`;
      popupContainer.style.top = `${rect.bottom + scrollY + 6}px`;
      popupContainer.style.width = `${Math.max(rect.width, 280)}px`;
      popupContainer.style.maxWidth = "360px";
      popupContainer.style.backgroundColor = "#ffffff";
      popupContainer.style.color = "#0f172a";
      popupContainer.style.border = "1px solid #e2e8f0";
      popupContainer.style.borderRadius = "8px";
      popupContainer.style.boxShadow =
        "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";
      popupContainer.style.zIndex = "2147483647";
      popupContainer.style.fontSize = "12px";
      popupContainer.style.fontFamily =
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      popupContainer.style.overflow = "hidden";
      popupContainer.style.display = "block";

      // ポップオーバーの内容構築
      popupContainer.innerHTML = "";

      // パスワード入力欄の場合：IDは絶対に入力せず、サイドパネルへのヒント確認誘導のみを表示
      if (isPassword) {
        const hasAnyHint = matchedRecords.some((r) =>
          r.credentials.some((c) => c.hasPasswordHint),
        );

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.gap = "6px";
        header.style.padding = "8px 12px";
        header.style.backgroundColor = "#fff7ed";
        header.style.borderBottom = "1px solid #fed7aa";

        header.innerHTML = `
          <div style="width:16px;height:16px;border-radius:4px;background-color:#f97316;display:flex;align-items:center;justify-content:center;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <span style="font-weight:600;font-size:11px;color:#9a3412;">PoohMa パスワードヒント</span>
        `;
        popupContainer.appendChild(header);

        const body = document.createElement("div");
        body.style.padding = "10px 12px";
        body.style.fontSize = "11px";
        body.style.lineHeight = "1.4";
        body.style.color = "#475569";
        body.textContent = hasAnyHint
          ? "このサイトのアカウントにはパスワードヒントが登録されています。安全のため、サイドパネルを開いて家族パスコードを入力してご確認ください。"
          : "パスワードヒントの確認や登録はサイドパネルから行えます。";
        popupContainer.appendChild(body);

        const footer = document.createElement("div");
        footer.style.padding = "8px 12px";
        footer.style.backgroundColor = "#f8fafc";
        footer.style.borderTop = "1px solid #e2e8f0";

        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.style.all = "unset";
        openBtn.style.display = "block";
        openBtn.style.width = "100%";
        openBtn.style.boxSizing = "border-box";
        openBtn.style.backgroundColor = "#f97316";
        openBtn.style.color = "#ffffff";
        openBtn.style.textAlign = "center";
        openBtn.style.padding = "6px 0";
        openBtn.style.borderRadius = "6px";
        openBtn.style.fontSize = "11px";
        openBtn.style.fontWeight = "600";
        openBtn.style.cursor = "pointer";
        openBtn.textContent = "サイドパネルでヒントを確認 →";

        openBtn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideAutofillPopup();
          chrome.runtime
            .sendMessage({ type: "OPEN_SIDEPANEL" })
            .catch(() => {});
        });

        footer.appendChild(openBtn);
        popupContainer.appendChild(footer);
        return;
      }

      // ユーザー名・ID入力欄の場合：アカウント一覧とID入力補助を提供
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between";
      header.style.padding = "8px 12px";
      header.style.backgroundColor = "#f8fafc";
      header.style.borderBottom = "1px solid #e2e8f0";

      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="width:16px;height:16px;border-radius:4px;background-color:#f97316;display:flex;align-items:center;justify-content:center;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <span style="font-weight:600;font-size:11px;color:#334155;">PoohMaからの提案</span>
        </div>
        <span style="font-size:10px;color:#64748b;background:#e2e8f0;padding:1px 6px;border-radius:10px;">${matchedRecords.length}件</span>
      `;
      popupContainer.appendChild(header);

      // アカウントリスト
      const listContainer = document.createElement("div");
      listContainer.style.maxHeight = "200px";
      listContainer.style.overflowY = "auto";

      for (const record of matchedRecords) {
        for (const cred of record.credentials) {
          const item = document.createElement("div");
          item.style.padding = "8px 12px";
          item.style.cursor = "pointer";
          item.style.display = "flex";
          item.style.alignItems = "center";
          item.style.justifyContent = "space-between";
          item.style.borderBottom = "1px solid #f1f5f9";
          item.style.transition = "background-color 0.15s ease";

          item.addEventListener("mouseenter", () => {
            item.style.backgroundColor = "#fff7ed"; // オレンジ薄背景
          });
          item.addEventListener("mouseleave", () => {
            item.style.backgroundColor = "#ffffff";
          });

          // アカウント名・ID・ラベル
          const textContainer = document.createElement("div");
          textContainer.style.overflow = "hidden";
          textContainer.style.textOverflow = "ellipsis";
          textContainer.style.whiteSpace = "nowrap";

          const titleRow = document.createElement("div");
          titleRow.style.display = "flex";
          titleRow.style.alignItems = "center";
          titleRow.style.gap = "6px";
          titleRow.style.fontSize = "11px";
          titleRow.style.color = "#64748b";

          const titleSpan = document.createElement("span");
          titleSpan.textContent = record.title;
          titleRow.appendChild(titleSpan);

          if (cred.label?.trim()) {
            const labelBadge = document.createElement("span");
            labelBadge.style.fontSize = "10px";
            labelBadge.style.padding = "1px 5px";
            labelBadge.style.borderRadius = "4px";
            labelBadge.style.backgroundColor = "#f1f5f9";
            labelBadge.style.color = "#475569";
            labelBadge.style.fontWeight = "500";
            labelBadge.textContent = cred.label.trim();
            titleRow.appendChild(labelBadge);
          }

          const idRow = document.createElement("div");
          idRow.style.fontSize = "13px";
          idRow.style.fontWeight = "600";
          idRow.style.color = "#0f172a";
          idRow.style.marginTop = "1px";
          idRow.textContent = cred.loginId;

          textContainer.appendChild(titleRow);
          textContainer.appendChild(idRow);
          item.appendChild(textContainer);

          // パスワードヒントありバッジ
          if (cred.hasPasswordHint) {
            const hintBadge = document.createElement("span");
            hintBadge.style.fontSize = "10px";
            hintBadge.style.padding = "2px 6px";
            hintBadge.style.borderRadius = "4px";
            hintBadge.style.backgroundColor = "#fef3c7";
            hintBadge.style.color = "#92400e";
            hintBadge.style.fontWeight = "500";
            hintBadge.style.marginLeft = "8px";
            hintBadge.textContent = "ヒントあり";
            item.appendChild(hintBadge);
          }

          // クリック時の入力実行（ID欄への安全な代入 ＆ パスワード欄へのフォーカス移動）
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();

            // 1. フォーカス中の ID 入力欄へ自動入力（パスワード欄ではないことを保証）
            input.value = cred.loginId;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));

            // 2. もしパスワード欄があれば自動でフォーカス移動（パスワード欄には文字は一切入れない）
            const form = input.form;
            const passwordInput = (form?.querySelector(
              'input[type="password"]',
            ) ||
              document.querySelector(
                'input[type="password"]',
              )) as HTMLInputElement | null;

            hideAutofillPopup();

            if (passwordInput && passwordInput !== input) {
              setTimeout(() => {
                passwordInput.focus();
              }, 50);
            }
          });

          listContainer.appendChild(item);
        }
      }

      popupContainer.appendChild(listContainer);

      // フッター（サイドパネルを開く導線）
      const footer = document.createElement("div");
      footer.style.padding = "6px 12px";
      footer.style.backgroundColor = "#f8fafc";
      footer.style.borderTop = "1px solid #e2e8f0";
      footer.style.display = "flex";
      footer.style.justifyContent = "space-between";
      footer.style.alignItems = "center";

      const openSidepanelBtn = document.createElement("button");
      openSidepanelBtn.type = "button";
      openSidepanelBtn.style.all = "unset";
      openSidepanelBtn.style.fontSize = "11px";
      openSidepanelBtn.style.color = "#ea580c";
      openSidepanelBtn.style.cursor = "pointer";
      openSidepanelBtn.style.fontWeight = "500";
      openSidepanelBtn.textContent = "サイドパネルで開く →";

      openSidepanelBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideAutofillPopup();
        chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }).catch(() => {});
      });

      footer.appendChild(openSidepanelBtn);
      popupContainer.appendChild(footer);
    }

    function hideAutofillPopup() {
      if (popupContainer) {
        popupContainer.style.display = "none";
      }
    }

    // 5. アカウント作成・未登録サイトでの自律保存サジェストバナー
    function showSaveSuggestionBanner(detectedLoginId: string) {
      // 1. iframe 内での小窓崩れ・重複表示を完全抑止（トップフレームのみ）
      if (window.self !== window.top) return;

      // 2. 既に非表示操作済みの場合は表示しない（セッション中抑止）
      if (isSaveDismissed) return;
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === "true") {
          isSaveDismissed = true;
          return;
        }
      } catch (_) {}

      // 3. 既に表示中なら重ねて出さない
      if (saveBannerContainer) return;

      // 4. すでにこのサイトのレコードが存在している場合：
      if (matchedRecords.length > 0) {
        // ログインIDが取得できていない場合は誤爆防止のため提案しない
        if (!detectedLoginId) {
          return;
        }
        // 既存クレデンシャルにすでに同一IDが存在している場合も重複防止のため出さない
        const isAlreadyRegistered = matchedRecords.some((r) =>
          r.credentials.some(
            (c) => c.loginId.toLowerCase() === detectedLoginId.toLowerCase(),
          ),
        );
        if (isAlreadyRegistered) {
          return;
        }
      }

      console.log(
        "[PoohMa Content] Showing save suggestion banner for domain:",
        window.location.hostname,
        "loginId:",
        detectedLoginId,
      );

      const banner = document.createElement("div");
      banner.id = "poohma-save-banner";
      banner.style.position = "fixed";
      banner.style.top = "16px";
      banner.style.right = "16px";
      banner.style.width = "320px";
      banner.style.backgroundColor = "#ffffff";
      banner.style.color = "#0f172a";
      banner.style.borderRadius = "10px";
      banner.style.border = "1px solid #fed7aa";
      banner.style.boxShadow =
        "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)";
      banner.style.zIndex = "2147483647";
      banner.style.padding = "14px";
      banner.style.fontFamily =
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      banner.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:10px;position:relative;">
          <div style="width:28px;height:28px;border-radius:6px;background-color:#f97316;display:flex;align-items:center;justify-content:center;shrink:0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <div style="flex:1;padding-right:16px;">
            <div style="font-weight:600;font-size:13px;color:#0f172a;line-height:1.3;">
              PoohMa に登録しますか？
            </div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">
              ${window.location.hostname}
              ${detectedLoginId ? ` (${detectedLoginId})` : ""}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
              <button id="poohma-save-btn" type="button" style="all:unset;background:#f97316;color:#ffffff;padding:5px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
                PoohMa に保存
              </button>
              <button id="poohma-dismiss-btn" type="button" style="all:unset;color:#64748b;padding:5px 8px;font-size:11px;cursor:pointer;">
                後で
              </button>
            </div>
          </div>
          <button id="poohma-close-btn" type="button" style="all:unset;position:absolute;top:-4px;right:-4px;cursor:pointer;color:#94a3b8;padding:4px;display:flex;align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      document.body.appendChild(banner);
      saveBannerContainer = banner;

      const saveBtn = banner.querySelector("#poohma-save-btn");
      const dismissBtn = banner.querySelector("#poohma-dismiss-btn");
      const closeBtn = banner.querySelector("#poohma-close-btn");

      saveBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissSaveSuggestion();
        chrome.runtime
          .sendMessage({
            type: "OPEN_NEW_RECORD",
            url: window.location.href,
            title: document.title,
            loginId: detectedLoginId,
          })
          .catch(() => {});
        hideSaveBanner();
      });

      dismissBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissSaveSuggestion();
        chrome.runtime
          .sendMessage({ type: "CLEAR_PENDING_SAVE" })
          .catch(() => {});
        hideSaveBanner();
      });

      closeBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismissSaveSuggestion();
        chrome.runtime
          .sendMessage({ type: "CLEAR_PENDING_SAVE" })
          .catch(() => {});
        hideSaveBanner();
      });

      // 12秒後に自動で閉じる（自動消滅時もスパム防止のためセッション中は再表示しない）
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

    // 保存サジェストのトリガー判定ヘルパー
    // 【セキュリティ最重要】パスワード入力欄（input[type="password"]）の .value には一切アクセスしない。
    // 要素が存在すること（DOMの存在チェック）と送信アクションのみで判定する。
    function checkAndTriggerSaveSuggestion() {
      if (window.self !== window.top) return;
      if (isSaveDismissed) return;
      try {
        if (sessionStorage.getItem(DISMISS_KEY) === "true") {
          isSaveDismissed = true;
          return;
        }
      } catch (_) {}

      // パスワード入力欄要素の存在確認（.value は一切読み取らない）
      const hasPasswordInput =
        document.querySelector('input[type="password"]') !== null;
      if (!hasPasswordInput) {
        return;
      }

      // ログインIDのみを取得（公開テキスト欄・email欄・ユーザー名欄等から）
      let loginId = lastEnteredLoginId;
      if (!loginId) {
        const candidateInput = document.querySelector(
          'input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="email" i], input[autocomplete="username"], input[type="text"]',
        ) as HTMLInputElement | null;
        if (candidateInput?.value) {
          loginId = candidateInput.value.trim();
        }
      }

      // 既登録サイトで、ログインIDが取れない場合や既存IDと同一なら提案しない
      if (matchedRecords.length > 0) {
        if (!loginId) {
          return;
        }
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
      // フォーム送信に伴いページが別URLやダッシュボードへ遷移しても、新ページでバナーを自律表示できる
      chrome.runtime
        .sendMessage({
          type: "SET_PENDING_SAVE",
          url: window.location.href,
          title: document.title,
          loginId,
        })
        .catch(() => {});

      // SPA等でページ遷移しないサイトのために、現在のページでもバナーを表示
      showSaveSuggestionBanner(loginId);
    }

    function scheduleSaveSuggestion(delay = 400) {
      if (isSaveDismissed) return;
      if (saveTriggerTimeout) {
        clearTimeout(saveTriggerTimeout);
      }
      saveTriggerTimeout = setTimeout(() => {
        saveTriggerTimeout = null;
        checkAndTriggerSaveSuggestion();
      }, delay);
    }

    // SPA（Single Page Application）のクライアントサイドルーティング検知
    let lastObservedUrl = window.location.href;

    function handleSpaNavigation() {
      const currentUrl = window.location.href;
      if (currentUrl === lastObservedUrl) return;
      lastObservedUrl = currentUrl;

      // 新URLに合わせた一致レコードを再照会
      queryMatchedRecords(true);

      // 直前の非同期送信に基づく保留中保存（Pending Save）があればSPA遷移先画面で表示
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
            url: currentUrl,
          })
          .then((res) => {
            if (res?.success && res.pendingSave) {
              showSaveSuggestionBanner(res.pendingSave.loginId);
            }
          })
          .catch(() => {});
      }
    }

    // 6. 入力欄・フォームの監視
    function attachListeners() {
      // ページ読み込み時に一致レコードを事前照会
      queryMatchedRecords();

      // SPA 画面遷移（popstate, hashchange, URL変化）の監視
      window.addEventListener("popstate", handleSpaNavigation);
      window.addEventListener("hashchange", handleSpaNavigation);
      setInterval(() => {
        if (window.location.href !== lastObservedUrl) {
          handleSpaNavigation();
        }
      }, 500);

      // 通常ページ遷移（MPA / リロード）直後に直前の保留中保存提案があるか確認
      chrome.runtime
        .sendMessage({
          type: "GET_PENDING_SAVE",
          url: window.location.href,
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

      // 入力フォーカス検知
      document.addEventListener("focusin", (e) => {
        const target = e.target as HTMLElement;
        if (target && target.tagName === "INPUT") {
          const input = target as HTMLInputElement;
          const type = (input.type || "text").toLowerCase();

          if (
            type === "password" ||
            type === "email" ||
            type === "text" ||
            type === "tel"
          ) {
            activeInput = input;
            positionBadge(input);

            // 一致レコードがあればサジェストポップオーバーを表示
            queryMatchedRecords().then(() => {
              if (matchedRecords.length > 0) {
                // サインアップ（新規登録）画面では既存登録レコードのサジェストポップアップを抑止
                const kind = detectFormKind(input);
                if (kind !== "signup") {
                  showAutofillPopup(input);
                }
              }
            });
          }
        }
      });

      // 入力値の追跡（ログインIDの記憶）
      document.addEventListener("input", (e) => {
        const target = e.target as HTMLElement;
        if (target && target.tagName === "INPUT") {
          const input = target as HTMLInputElement;
          const type = (input.type || "text").toLowerCase();

          if (type === "email" || type === "text" || type === "tel") {
            if (input.value.trim().length > 1) {
              lastEnteredLoginId = input.value.trim();
            }
          }
        }
      });

      // フォーカスアウト時の処理（バッジ・ポップアップの非表示化のみ。保存サジェストは誤爆防止のため発火させない）
      document.addEventListener("focusout", (_e) => {
        setTimeout(() => {
          if (document.activeElement !== activeInput) {
            hideBadge();
            hideAutofillPopup();
          }
        }, 250);
      });

      // フォーム送信（submit）時の新規保存サジェスト
      document.addEventListener("submit", (e) => {
        if (isSaveDismissed) return;
        const form = e.target as HTMLFormElement;
        // フォーム内にパスワード入力欄がある場合のみ
        if (form?.querySelector?.('input[type="password"]')) {
          scheduleSaveSuggestion(300);
        }
      });

      // ボタンクリック時の新規保存サジェスト（ログイン/登録系ボタンに限定）
      document.addEventListener("click", (e) => {
        if (isSaveDismissed) return;

        const target = e.target as HTMLElement;
        const btn = target.closest(
          'button, input[type="submit"], [role="button"]',
        );
        if (btn) {
          // PoohMa 自身の UI 内クリックは無視
          if (
            btn.id.startsWith("poohma-") ||
            btn.closest("#poohma-save-banner") ||
            btn.closest("#poohma-autofill-popup") ||
            btn.closest("#poohma-floating-badge")
          ) {
            return;
          }

          // ナビゲーションバー内の要素は除外
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
            scheduleSaveSuggestion(400);
          }
        }
      });

      // Enter キー押下時の新規保存サジェスト（パスワード欄での Enter に限定）
      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !isSaveDismissed) {
          const target = e.target as HTMLElement;
          if (
            target &&
            target.tagName === "INPUT" &&
            (target as HTMLInputElement).type === "password"
          ) {
            scheduleSaveSuggestion(400);
          }
        }
      });

      window.addEventListener("resize", () => {
        if (activeInput && badgeContainer?.style.display !== "none") {
          positionBadge(activeInput);
        }
      });

      window.addEventListener(
        "scroll",
        () => {
          if (activeInput && badgeContainer?.style.display !== "none") {
            positionBadge(activeInput);
          }
        },
        { passive: true },
      );
    }

    // 7. 外部からのログインID自動入力メッセージ受信
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "CONTENT_FILL_LOGIN_ID" && message.loginId) {
        const targetInput =
          activeInput ||
          (document.querySelector(
            'input[type="email"], input[name*="user"], input[name*="login"], input[name*="email"], input[autocomplete="username"]',
          ) as HTMLInputElement) ||
          (document.querySelector('input[type="text"]') as HTMLInputElement);

        if (targetInput) {
          targetInput.focus();
          targetInput.value = message.loginId;
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
          targetInput.dispatchEvent(new Event("change", { bubbles: true }));
          sendResponse({ success: true });
          return false;
        }

        sendResponse({
          success: false,
          reason: "No matching input element found",
        });
        return false;
      }
      return false;
    });

    attachListeners();
  },
});

import { matchRecordUrl } from "@poohma/shared/utils/url-matcher";
import {
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  LogOut,
  PencilSparkles,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { env } from "@/env";
import {
  clearAuthSession,
  type ExtensionFamily,
  type ExtensionUser,
  getAuthStorage,
  setPendingSyncNonce,
  switchActiveAccount,
} from "@/lib/auth";
import { sendExtensionMessage } from "@/lib/messaging";
import {
  calculateLockoutDelayMs,
  decryptPasswordHint,
  unlockMasterKeyWithPasscode,
} from "@/lib/passcode";
import { normalizeUrl } from "@/lib/url";
import { useInactivityLock } from "@/lib/useInactivityLock";
import { useTheme } from "@/lib/useTheme";
import packageJson from "@/package.json";

interface CurrentTabInfo {
  tabId?: number;
  url?: string;
  title?: string;
}

interface CredentialItem {
  _id: string;
  label?: string;
  loginId?: string;
  passwordHint?: string;
  passwordHintIv?: string;
  passwordHintDekEncrypted?: string;
  passwordHintDekIv?: string;
}

interface ServiceRecordItem {
  _id: string;
  title: string;
  url?: string;
  tags?: string[];
  credentials?: CredentialItem[];
  updatedAt: number;
}

export function App() {
  // テーマ同期（デバイス設定自動追従 ＆ Web設定同期）
  useTheme();

  // 状態管理
  const [tabInfo, setTabInfo] = useState<CurrentTabInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<ExtensionUser | null>(null);
  const [accounts, setAccounts] = useState<ExtensionUser[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);
  const [family, setFamily] = useState<ExtensionFamily | null>(null);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [records, setRecords] = useState<ServiceRecordItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // 検索・UI
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [passcode, setPasscode] = useState<string>("");
  const [showPasscode, setShowPasscode] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isWaitingSync, setIsWaitingSync] = useState<boolean>(false);
  const [isPasscodePromptOpen, setIsPasscodePromptOpen] =
    useState<boolean>(false);
  const [pendingRevealCred, setPendingRevealCred] =
    useState<CredentialItem | null>(null);
  const [pendingRevealRecordId, setPendingRevealRecordId] = useState<
    string | null
  >(null);

  // 誤入力バックオフ
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);
  const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // 入力支援フィードバック・暗号状態
  const [filledLoginId, setFilledLoginId] = useState<string | null>(null);
  const [fillErrorMsg, setFillErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [decryptedHints, setDecryptedHints] = useState<Record<string, string>>(
    {},
  );
  const [visibleHints, setVisibleHints] = useState<Record<string, boolean>>({});
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const isRefreshingRef = useRef<boolean>(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountGenerationRef = useRef<number>(0);

  // 1. 自動ロック（無操作15分またはサイドパネル非表示で自律ロック）
  const handleLock = useCallback(() => {
    accountGenerationRef.current += 1;
    masterKeyRef.current = null;
    sendExtensionMessage({ type: "VAULT_LOCK" }).catch(() => {});
    setIsUnlocked(false);
    setIsPasscodePromptOpen(false);
    setPendingRevealCred(null);
    setPendingRevealRecordId(null);
    setDecryptedHints({});
    setVisibleHints({});
  }, []);

  useInactivityLock({
    onLock: handleLock,
    enabled: isUnlocked,
    timeoutMinutes: 15,
  });

  // 2. 全体状態のリフレッシュ（storage直接読み取りでハング完全防止・並行実行ロック付き）
  const refreshState = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    const currentGeneration = accountGenerationRef.current;
    try {
      // カレントタブ情報（Side Panel から直接取得）
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (activeTab) {
          setTabInfo({
            tabId: activeTab.id,
            url: activeTab.url,
            title: activeTab.title,
          });
        }
      } catch (_e) {
        // タブ情報取得失敗時はスキップ
      }

      // 認証状態（chrome.storage.local から直接取得）
      const storage = await getAuthStorage();
      const isAuth = !!storage.user;

      setIsAuthenticated(isAuth);
      setCurrentUser(storage.user);
      setAccounts(storage.accounts);
      setActiveAccountId(storage.activeAccountId);
      setFamily(storage.family);

      if (isAuth) {
        setIsWaitingSync(false);

        // Offscreen Document の起動完了を待機
        await sendExtensionMessage<{ success: boolean }>({
          type: "ENSURE_OFFSCREEN",
        }).catch(() => ({ success: false }));

        // ロック状態確認（メモリ上の MasterKey で即時判定）
        setIsUnlocked(masterKeyRef.current !== null);

        // レコード取得（Offscreen Document 初期化遅延対策としてリトライ付き）
        try {
          let recordsRes: {
            success: boolean;
            records: ServiceRecordItem[];
          } | null = null;

          for (let attempt = 1; attempt <= 4; attempt++) {
            try {
              recordsRes = await sendExtensionMessage<{
                success: boolean;
                records: ServiceRecordItem[];
              }>({ type: "GET_ALL_RECORDS" });

              if (recordsRes?.success && Array.isArray(recordsRes.records)) {
                break;
              }
            } catch (_msgErr) {
              // 待機再試行
            }

            if (attempt < 4) {
              await new Promise((r) => setTimeout(r, 600));
            }
          }

          if (recordsRes?.success && Array.isArray(recordsRes.records)) {
            if (accountGenerationRef.current === currentGeneration) {
              setRecords(recordsRes.records);
            }
          }
        } catch (_err) {
          // レコード取得失敗時はスキップ
        }
      } else {
        setIsUnlocked(false);
        setRecords([]);
      }
    } catch (_err) {
      // 内部エラーは握る
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  // 3. イベントリスナー登録
  useEffect(() => {
    refreshState();

    const messageListener = (message: {
      type: string;
      isAuthenticated?: boolean;
      user?: ExtensionUser | null;
      accounts?: ExtensionUser[];
      family?: ExtensionFamily | null;
      isUnlocked?: boolean;
    }) => {
      if (message?.type === "OFFSCREEN_PING") return;

      if (message.type === "AUTH_STATE_CHANGED") {
        setIsAuthenticated(!!message.isAuthenticated);
        setCurrentUser(message.user ?? null);
        if (message.accounts) {
          setAccounts(message.accounts);
        }
        setFamily(message.family ?? null);
        if (!message.isAuthenticated) {
          setIsUnlocked(false);
          setRecords([]);
        } else {
          setIsWaitingSync(false);
          refreshState();
        }
      }
      if (message.type === "VAULT_LOCK_STATE_CHANGED") {
        setIsUnlocked(!!message.isUnlocked);
        if (!message.isUnlocked) {
          accountGenerationRef.current += 1;
          masterKeyRef.current = null;
          setDecryptedHints({});
          setVisibleHints({});
        }
      }
    };

    // ストレージ変更監視（サブアカウント切り替えやセッション保存時に即時反映）
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (
        areaName === "local" &&
        (changes.user ||
          changes.family ||
          changes.accounts ||
          changes.activeAccountId)
      ) {
        setIsWaitingSync(false);
        refreshState();
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.storage.onChanged.removeListener(storageListener);
      if (lockoutIntervalRef.current) {
        clearInterval(lockoutIntervalRef.current);
      }
    };
  }, [refreshState]);

  // アカウントドロップダウンの外側クリック検知
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(e.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    }
    if (isAccountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isAccountMenuOpen]);

  // 連携待機セーフティネット: storageイベント取りこぼしを防ぐため1秒ごとに確認
  useEffect(() => {
    if (!isWaitingSync) return;

    const timer = setInterval(async () => {
      const storage = await getAuthStorage().catch(() => null);
      if (storage?.user) {
        setIsWaitingSync(false);
        refreshState();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isWaitingSync, refreshState]);

  // タブの変化（切り替え・ページ遷移）をリアルタイムに検知してカレントタブ情報を自動更新（自ウィンドウに限定）
  useEffect(() => {
    let isMounted = true;
    let panelWindowId: number | undefined;

    chrome.windows
      .getCurrent()
      .then((w) => {
        if (isMounted) panelWindowId = w?.id;
      })
      .catch(() => {});

    const updateActiveTab = async () => {
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (isMounted && activeTab?.id) {
          setTabInfo({
            tabId: activeTab.id,
            url: activeTab.url,
            title: activeTab.title,
          });
        }
      } catch (_e) {
        // スキップ
      }
    };

    const handleTabActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      if (panelWindowId && activeInfo.windowId !== panelWindowId) {
        return;
      }
      updateActiveTab();
    };

    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (panelWindowId && tab.windowId !== panelWindowId) {
        return;
      }
      if ((changeInfo.url || changeInfo.status === "complete") && tab.active) {
        if (isMounted) {
          setTabInfo({
            tabId,
            url: tab.url,
            title: tab.title,
          });
        }
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    updateActiveTab();

    return () => {
      isMounted = false;
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, []);

  // 4. Web 同期ログインの開始
  const handleStartLogin = async () => {
    try {
      const nonce = crypto.randomUUID();
      await setPendingSyncNonce(nonce);
      setIsWaitingSync(true);

      const targetUrl = `${env.VITE_SITE_URL}/auth/extension-sync?nonce=${encodeURIComponent(nonce)}`;
      chrome.tabs.create({ url: targetUrl });
    } catch (_err) {
      setIsWaitingSync(false);
    }
  };

  // 5. サブアカウントの切り替え
  const handleSelectAccount = async (accountId: string) => {
    setIsAccountMenuOpen(false);
    if (accountId === activeAccountId) return;
    accountGenerationRef.current += 1;
    masterKeyRef.current = null;
    setIsUnlocked(false);
    setDecryptedHints({});
    setVisibleHints({});
    setRecords([]);
    await switchActiveAccount(accountId);
    await refreshState();
  };

  // 6. ヒントの復号と表示実行（Web Crypto による直接復号 ＆ 閲覧監査ログ記録）
  const decryptAndShowHint = useCallback(
    async (
      cred: CredentialItem,
      explicitKey?: CryptoKey,
      recordId?: string,
    ) => {
      const activeKey = explicitKey || masterKeyRef.current;
      if (!activeKey) return;

      if (
        cred.passwordHint &&
        cred.passwordHintIv &&
        cred.passwordHintDekEncrypted &&
        cred.passwordHintDekIv
      ) {
        try {
          const hint = await decryptPasswordHint(
            cred.passwordHint,
            cred.passwordHintIv,
            cred.passwordHintDekEncrypted,
            cred.passwordHintDekIv,
            activeKey,
          );

          setDecryptedHints((prev) => ({ ...prev, [cred._id]: hint }));
          setVisibleHints((prev) => ({ ...prev, [cred._id]: true }));

          // 閲覧監査ログを記録
          if (recordId) {
            sendExtensionMessage({
              type: "LOG_RECORD_HINT_VIEW",
              recordId,
            }).catch(() => {});
          }
        } catch (err) {
          console.warn("[PoohMa Sidepanel] Decrypt hint failed:", err);
        }
      }
    },
    [],
  );

  // 7. パスコード解除
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode || lockoutRemainingSec > 0) return;

    setUnlockError(null);
    const startGen = accountGenerationRef.current;

    startTransition(async () => {
      try {
        const storage = await getAuthStorage();
        const currentFamily = family || storage.family;
        if (
          !currentFamily?.masterKeyEncrypted ||
          !currentFamily?.masterKeyIv ||
          !currentFamily?.masterKeySalt
        ) {
          throw new Error("家族暗号情報が見つかりません");
        }

        const derivedKey = await unlockMasterKeyWithPasscode(
          passcode,
          currentFamily,
        );

        // 処理中にアカウント切り替えやロックが行われていた場合は古い鍵を破棄
        if (accountGenerationRef.current !== startGen) {
          return;
        }

        masterKeyRef.current = derivedKey;
        setIsUnlocked(true);
        setPasscode("");
        setFailedAttempts(0);
        setUnlockError(null);
        setIsPasscodePromptOpen(false);

        // 保留されていたヒント要求があれば直ちに復号・表示
        if (pendingRevealCred) {
          const credToReveal = pendingRevealCred;
          const recordIdToLog = pendingRevealRecordId;
          setPendingRevealCred(null);
          setPendingRevealRecordId(null);
          await decryptAndShowHint(
            credToReveal,
            derivedKey,
            recordIdToLog ?? undefined,
          );
        }
      } catch (_err) {
        masterKeyRef.current = null;
        handleFailedUnlock();
      }
    });
  };

  // 誤入力バックオフ処理（Web の PasscodeProvider と完全一致）
  const handleFailedUnlock = () => {
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);
    setUnlockError("パスコードが正しくありません");

    const delayMs = calculateLockoutDelayMs(nextAttempts);
    if (delayMs > 0) {
      const remaining = Math.ceil(delayMs / 1000);
      setLockoutRemainingSec(remaining);

      if (lockoutIntervalRef.current) {
        clearInterval(lockoutIntervalRef.current);
      }
      lockoutIntervalRef.current = setInterval(() => {
        setLockoutRemainingSec((prev) => {
          if (prev <= 1) {
            if (lockoutIntervalRef.current) {
              clearInterval(lockoutIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const handleCancelUnlock = () => {
    setIsPasscodePromptOpen(false);
    setPendingRevealCred(null);
    setPendingRevealRecordId(null);
    setPasscode("");
    setUnlockError(null);
  };

  // 8. ログアウト
  const handleSignOut = async () => {
    accountGenerationRef.current += 1;
    masterKeyRef.current = null;
    try {
      await clearAuthSession();
      sendExtensionMessage({ type: "AUTH_SIGN_OUT" }).catch(() => {});
    } catch (_err) {
      // 内部エラーは握る
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setAccounts([]);
    setActiveAccountId(null);
    setFamily(null);
    setIsUnlocked(false);
    setIsPasscodePromptOpen(false);
    setPendingRevealCred(null);
    setPendingRevealRecordId(null);
    setRecords([]);
    setDecryptedHints({});
    setVisibleHints({});
  };

  // 9. パスワードヒント復号トグル
  const toggleHintVisibility = async (
    cred: CredentialItem,
    recordId?: string,
  ) => {
    const credId = cred._id;
    if (visibleHints[credId]) {
      setVisibleHints((prev) => ({ ...prev, [credId]: false }));
      return;
    }

    if (decryptedHints[credId]) {
      setVisibleHints((prev) => ({ ...prev, [credId]: true }));
      return;
    }

    // 未アンロック状態ならパスコードモーダルを開く
    if (!isUnlocked) {
      setPendingRevealCred(cred);
      setPendingRevealRecordId(recordId ?? null);
      setUnlockError(null);
      setPasscode("");
      setIsPasscodePromptOpen(true);
      return;
    }

    await decryptAndShowHint(cred, undefined, recordId);
  };

  // 10. カレントタブへの自動入力（ドメイン一致検証 ＆ 失敗理由の通知）
  const handleFillLoginId = async (loginId: string, recordUrl?: string) => {
    if (!tabInfo?.tabId) return;

    if (
      recordUrl &&
      tabInfo.url &&
      matchRecordUrl(tabInfo.url, recordUrl) === "none"
    ) {
      setFillErrorMsg("現在開いているサイトと異なるため自動入力できません");
      setTimeout(() => setFillErrorMsg(null), 3500);
      return;
    }

    try {
      const res = await sendExtensionMessage<{
        success: boolean;
        reason?: string;
      }>({
        type: "FORWARD_FILL_LOGIN_ID",
        tabId: tabInfo.tabId,
        loginId,
      });
      if (res?.success) {
        setFilledLoginId(loginId);
        setTimeout(() => {
          setFilledLoginId(null);
        }, 2000);
      } else {
        setFillErrorMsg("入力可能なID欄が見つかりませんでした");
        setTimeout(() => setFillErrorMsg(null), 3500);
      }
    } catch (_err) {
      setFillErrorMsg("自動入力に失敗しました");
      setTimeout(() => setFillErrorMsg(null), 3500);
    }
  };

  // 11. レコードフィルタリング（閲覧中サイト一致 ＆ 検索クエリ）
  const matchedRecords = useMemo(() => {
    const tabUrl = tabInfo?.url;
    if (!tabUrl) return [];
    return records.filter((r) => {
      if (!r.url) return false;
      return matchRecordUrl(tabUrl, r.url) !== "none";
    });
  }, [records, tabInfo?.url]);

  const searchedRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return matchedRecords;

    return records.filter((r) => {
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchUrl = r.url?.toLowerCase().includes(q) ?? false;
      const matchTags =
        r.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
      const matchCreds =
        r.credentials?.some(
          (c) =>
            (c.label?.toLowerCase().includes(q) ?? false) ||
            (c.loginId?.toLowerCase().includes(q) ?? false),
        ) ?? false;
      return matchTitle || matchUrl || matchTags || matchCreds;
    });
  }, [records, matchedRecords, searchQuery]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center p-4 bg-background">
        <Spinner className="h-6 w-6 text-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-orange-500/20 font-sans">
      {/* 共通ヘッダー */}
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          {/* ブランドロゴ ＆ サブアカウント切り替え */}
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/poohma_icon.png"
              alt="PoohMa"
              className="h-6 w-6 rounded-md object-contain shrink-0 shadow-xs"
            />
            {isAuthenticated ? (
              <div className="relative min-w-0" ref={accountMenuRef}>
                {accounts.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setIsAccountMenuOpen((prev) => !prev)}
                    className="flex items-center gap-1 text-left rounded-md px-1.5 py-0.5 hover:bg-muted/80 transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                          {currentUser?.displayName || "ユーザー"}
                        </span>
                        <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform" />
                      </div>
                      <span className="text-[10px] text-muted-foreground truncate block max-w-[120px]">
                        {family?.name || "家族アカウント"}
                      </span>
                    </div>
                  </button>
                ) : (
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground truncate block max-w-[130px]">
                      {currentUser?.displayName || family?.name || "PoohMa"}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate block max-w-[130px]">
                      {currentUser?.email || family?.name}
                    </span>
                  </div>
                )}

                {/* サブアカウント切り替えドロップダウン */}
                {isAccountMenuOpen && accounts.length > 1 && (
                  <div className="absolute left-0 top-full mt-1.5 w-48 rounded-md bg-card p-1 shadow-lg shadow-border z-30 animate-in fade-in-50 zoom-in-95">
                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-b border-border/60">
                      アカウント切り替え
                    </div>
                    <div className="py-1 space-y-0.5 max-h-48 overflow-y-auto">
                      {accounts.map((acc) => {
                        const isSelected = acc._id === activeAccountId;
                        return (
                          <button
                            key={acc._id}
                            type="button"
                            onClick={() => handleSelectAccount(acc._id)}
                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[10px] shrink-0 font-medium text-muted-foreground">
                                {acc.displayName?.[0] || (
                                  <User className="h-2.5 w-2.5" />
                                )}
                              </div>
                              <span className="truncate">
                                {acc.displayName || acc.email}
                              </span>
                            </div>
                            {isSelected && (
                              <Check className="h-3 w-3 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs font-bold tracking-tight text-foreground">
                PoohMa
              </span>
            )}
          </div>

          {/* 右側アクション（手動ロックボタンは撤廃・無操作オートロックで自律防衛） */}
          <div className="flex items-center gap-0.5 shrink-0">
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshState}
                title="最新情報に更新"
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                title="ログアウト"
                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* メインビュー */}
      <main className="flex-1 p-3 space-y-3">
        {/* 自動入力エラーバナー */}
        {fillErrorMsg && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 text-xs text-destructive flex items-center justify-between animate-in fade-in">
            <span>{fillErrorMsg}</span>
            <button
              type="button"
              onClick={() => setFillErrorMsg(null)}
              className="text-destructive/70 hover:text-destructive cursor-pointer ml-2 shrink-0"
              title="閉じる"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* A. 未認証ビュー */}
        {!isAuthenticated ? (
          <Card className="shadow-border bg-card">
            <CardHeader className="text-center p-5 space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold">
                  Web アプリと連携
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  閲覧中のサイトに応じてアカウント情報を安全に参照・自動入力できます。
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0 space-y-3">
              <Button
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium text-xs shadow-xs"
                onClick={handleStartLogin}
                disabled={isWaitingSync}
              >
                {isWaitingSync ? (
                  <>
                    <Spinner className="mr-2 h-3.5 w-3.5 text-white" />
                    連携タブを確認中...
                  </>
                ) : (
                  "ログイン"
                )}
              </Button>
              {isWaitingSync && (
                <p className="text-[11px] text-center text-muted-foreground leading-normal">
                  ブラウザで開いた連携タブでログインを完了すると、自動的に反映されます。
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          /* B. 通常操作ビュー（ログイン直後から常に利用可能） */
          <>
            {/* インクリメンタル検索バー */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="サービス名・URL・アカウント名で検索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 bg-card shadow-border border-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  クリア
                </button>
              )}
            </div>

            {/* 閲覧中サイト情報（検索クエリ未入力時のみ表示） */}
            {!searchQuery && tabInfo?.url && (
              <div className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1.5 text-xs shadow-border">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                  <span className="truncate font-medium text-[11px] text-foreground">
                    {(() => {
                      try {
                        const parsed = new URL(tabInfo.url);
                        return parsed.hostname || tabInfo.title || "Web サイト";
                      } catch {
                        return tabInfo.title || "Web サイト";
                      }
                    })()}
                  </span>
                </div>
                <Badge
                  variant={matchedRecords.length > 0 ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0 h-4 font-normal"
                >
                  {matchedRecords.length} 件一致
                </Badge>
              </div>
            )}

            {/* レコード一覧表示 */}
            {searchedRecords.length > 0 ? (
              <div className="space-y-2.5">
                {searchedRecords.map((record) => (
                  <Card
                    key={record._id}
                    className="overflow-hidden shadow-border bg-card rounded-md border-0"
                  >
                    <CardHeader className="p-3 pb-2 bg-muted/30 border-b border-border/40">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-xs font-bold truncate text-foreground">
                          {record.title}
                        </CardTitle>
                        {record.url && (
                          <a
                            href={record.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            title="Webサイトを開く"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      {record.tags && record.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {record.tags.map((t) => (
                            <Badge
                              key={t}
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 h-4 border-border text-muted-foreground rounded"
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="p-2.5 space-y-2">
                      {record.credentials && record.credentials.length > 0 ? (
                        record.credentials.map((cred) => (
                          <div
                            key={cred._id}
                            className="rounded-md border border-border/60 p-2 space-y-1.5 bg-background/50 shadow-xs"
                          >
                            {cred.label && (
                              <div className="text-[10px] font-medium text-muted-foreground">
                                {cred.label}
                              </div>
                            )}

                            {/* ログインID行（Web互換 CopyButton ＋ 入力支援ボタン） */}
                            {cred.loginId && (
                              <div className="flex items-center justify-between text-xs gap-1.5">
                                <span className="text-[10px] text-muted-foreground shrink-0 w-8">
                                  ID
                                </span>
                                <span className="font-mono text-xs text-foreground truncate flex-1 select-all">
                                  {cred.loginId}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (cred.loginId) {
                                        handleFillLoginId(
                                          cred.loginId,
                                          record.url,
                                        );
                                      }
                                    }}
                                    title="ページに入力"
                                    className="h-7 px-2 text-[11px] text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 font-medium"
                                  >
                                    {filledLoginId === cred.loginId ? (
                                      <>
                                        <Check className="mr-1 h-3 w-3 text-emerald-500" />
                                        入力済
                                      </>
                                    ) : (
                                      <>
                                        <PencilSparkles className="mr-1 h-3 w-3" />
                                        入力
                                      </>
                                    )}
                                  </Button>
                                  <CopyButton
                                    text={cred.loginId}
                                    label="ログインID"
                                  />
                                </div>
                              </div>
                            )}

                            {/* パスワードヒント行（Web互換伏字 ＋ トグル ＋ CopyButton） */}
                            {cred.passwordHint && (
                              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-border/40 gap-1.5">
                                <span className="text-[10px] text-muted-foreground shrink-0 w-8">
                                  ヒント
                                </span>
                                <span className="font-mono text-xs text-foreground truncate flex-1 select-all">
                                  {visibleHints[cred._id]
                                    ? decryptedHints[cred._id] || "..."
                                    : "••••••••"}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      toggleHintVisibility(cred, record._id)
                                    }
                                    title={
                                      visibleHints[cred._id] ? "隠す" : "表示"
                                    }
                                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground font-medium"
                                  >
                                    {visibleHints[cred._id] ? (
                                      <>
                                        <EyeOff className="mr-1 h-3 w-3" />
                                        隠す
                                      </>
                                    ) : (
                                      <>
                                        <Eye className="mr-1 h-3 w-3" />
                                        表示
                                      </>
                                    )}
                                  </Button>
                                  <CopyButton
                                    text={
                                      visibleHints[cred._id]
                                        ? (decryptedHints[cred._id] ?? "")
                                        : ""
                                    }
                                    label="パスワードヒント"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          アカウント情報が未登録です
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              /* 一致レコードなし */
              <Card className="border-dashed border-border/80 bg-transparent p-5 text-center rounded-md">
                <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Globe className="h-4 w-4" />
                </div>
                <CardTitle className="text-xs font-semibold mt-2.5">
                  {searchQuery
                    ? "一致する記録がありません"
                    : "このサイトのアカウント情報がありません"}
                </CardTitle>
                <CardDescription className="text-[11px] mt-1 leading-normal">
                  {searchQuery
                    ? "検索条件を変更してお試しください。"
                    : "閲覧中のサイトを PoohMa に追加して、次回から素早く参照・入力できます。"}
                </CardDescription>
                {!searchQuery && (
                  <div className="mt-3.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-medium shadow-xs"
                      onClick={() => {
                        const newUrl = new URL(
                          `${env.VITE_SITE_URL}/records/new`,
                        );
                        if (tabInfo?.url) {
                          newUrl.searchParams.set(
                            "url",
                            normalizeUrl(tabInfo.url),
                          );
                        }
                        if (tabInfo?.title) {
                          newUrl.searchParams.set("title", tabInfo.title);
                        }
                        chrome.tabs.create({ url: newUrl.toString() });
                      }}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      このサイトを PoohMa に追加
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </main>

      {/* 家族パスコード入力モーダル */}
      {isAuthenticated && isPasscodePromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="passcode-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 animate-in fade-in"
        >
          <Card className="w-full max-w-sm shadow-border bg-card border-0 rounded-md shadow-lg">
            <CardHeader className="p-4 pb-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <CardTitle
                    id="passcode-dialog-title"
                    className="text-xs font-semibold"
                  >
                    家族パスコードの入力
                  </CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCancelUnlock}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title="閉じる"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <CardDescription className="text-[11px] leading-relaxed">
                暗号化されたパスワードヒントを安全に復号するため、
                {family?.name || "家族"}のパスコードを入力してください。
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-1">
              <form onSubmit={handleUnlock} className="space-y-3">
                <div className="relative">
                  <Input
                    type={showPasscode ? "text" : "password"}
                    placeholder="パスコード"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    disabled={lockoutRemainingSec > 0 || isPending}
                    aria-invalid={!!unlockError}
                    autoFocus
                    className="pr-9 font-mono text-xs shadow-border border-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    title={showPasscode ? "隠す" : "表示"}
                  >
                    {showPasscode ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {lockoutRemainingSec > 0 ? (
                  <p className="text-[11px] text-destructive">
                    試行制限中です。残り {lockoutRemainingSec}{" "}
                    秒お待ちください。
                  </p>
                ) : unlockError ? (
                  <p className="text-[11px] text-destructive">{unlockError}</p>
                ) : null}

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelUnlock}
                    className="text-xs h-7 px-3 text-muted-foreground hover:text-foreground"
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="text-xs h-7 px-3 bg-orange-600 hover:bg-orange-500 text-white font-medium"
                    disabled={!passcode || lockoutRemainingSec > 0 || isPending}
                  >
                    {isPending ? (
                      <Spinner className="h-3.5 w-3.5 text-white" />
                    ) : (
                      "ロック解除"
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* フッター */}
      <footer className="border-t border-border/80 bg-background/50 px-3 py-2 text-center text-[10px] text-muted-foreground flex items-center justify-between">
        <span>PoohMa Extension v{packageJson.version}</span>
        <a
          href={env.VITE_SITE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          PoohMaをタブで開く
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </footer>
    </div>
  );
}

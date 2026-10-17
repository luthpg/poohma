import { matchRecordUrl } from "@poohma/shared/utils/url-matcher";
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  PencilSparkles,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
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
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { env } from "@/env";
import {
  clearAuthSession,
  type ExtensionFamily,
  type ExtensionUser,
  getAuthStorage,
  setPendingSyncNonce,
} from "@/lib/auth";
import { sendExtensionMessage } from "@/lib/messaging";
import {
  calculateLockoutDelayMs,
  decryptPasswordHint,
  unlockMasterKeyWithPasscode,
} from "@/lib/passcode";

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
  // 状態管理
  const [tabInfo, setTabInfo] = useState<CurrentTabInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<ExtensionUser | null>(null);
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

  // 誤入力バックオフ
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);
  const lockoutIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // ヒント復号・コピー表示
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [decryptedHints, setDecryptedHints] = useState<Record<string, string>>(
    {},
  );
  const [visibleHints, setVisibleHints] = useState<Record<string, boolean>>({});
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const isRefreshingRef = useRef<boolean>(false);

  // 1. 全体状態のリフレッシュ（storage直接読み取りでハング完全防止・並行実行ロック付き）
  const refreshState = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
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
      console.log("[PoohMa Sidepanel] refreshState:", {
        isAuth,
        userEmail: storage.user?.email,
        familyName: storage.family?.name,
      });

      setIsAuthenticated(isAuth);
      setCurrentUser(storage.user);
      setFamily(storage.family);

      if (isAuth) {
        setIsWaitingSync(false);

        // Offscreen Document の起動完了を待機
        console.log("[PoohMa Sidepanel] Calling ENSURE_OFFSCREEN...");
        await sendExtensionMessage<{ success: boolean }>({
          type: "ENSURE_OFFSCREEN",
        }).catch((err) => {
          console.error("[PoohMa Sidepanel] ENSURE_OFFSCREEN error:", err);
          return { success: false };
        });
        // ロック状態確認（メモリ上の MasterKey で即時判定）
        setIsUnlocked(masterKeyRef.current !== null);

        // レコード取得（Offscreen Document 初期化・Firebaseセッション確立遅延対策としてリトライ付き）
        try {
          console.log(
            "[PoohMa Sidepanel] Requesting GET_ALL_RECORDS from offscreen...",
          );
          let recordsRes: {
            success: boolean;
            records: ServiceRecordItem[];
          } | null = null;

          // 初回が失敗または0件の場合、最大4回まで再試行（Firebaseトークン伝播・Offscreen待機）
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
              console.log(
                `[PoohMa Sidepanel] GET_ALL_RECORDS attempt ${attempt} waiting...`,
              );
            }

            if (attempt < 4) {
              await new Promise((r) => setTimeout(r, 600));
            }
          }

          console.log("[PoohMa Sidepanel] GET_ALL_RECORDS response:", {
            success: recordsRes?.success,
            recordsCount: recordsRes?.records?.length ?? 0,
          });

          if (recordsRes?.success && Array.isArray(recordsRes.records)) {
            setRecords(recordsRes.records);
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

  // 2. イベントリスナー登録
  useEffect(() => {
    refreshState();

    const messageListener = (message: {
      type: string;
      isAuthenticated?: boolean;
      user?: ExtensionUser | null;
      family?: ExtensionFamily | null;
      isUnlocked?: boolean;
    }) => {
      if (message?.type === "OFFSCREEN_PING") return;
      console.log(
        "[PoohMa Sidepanel] runtime.onMessage received:",
        message.type,
      );
      if (message.type === "AUTH_STATE_CHANGED") {
        console.log("[PoohMa Sidepanel] AUTH_STATE_CHANGED received:", {
          isAuthenticated: message.isAuthenticated,
          email: message.user?.email,
        });
        setIsAuthenticated(!!message.isAuthenticated);
        setCurrentUser(message.user ?? null);
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
          setDecryptedHints({});
          setVisibleHints({});
        }
      }
    };

    // ストレージ変更監視（Background でセッション保存された瞬間に即時反映）
    const storageListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === "local" && (changes.user || changes.family)) {
        console.log(
          "[PoohMa Sidepanel] storage.onChanged detected user/family change!",
          changes,
        );
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

  // タブの変化（切り替え・ページ遷移）をリアルタイムに検知してカレントタブ情報を自動更新
  useEffect(() => {
    let isMounted = true;

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
        // タブ情報取得失敗時はスキップ
      }
    };

    // タブのアクティブ切り替え（ユーザーが別タブを選択した時）
    const handleTabActivated = () => {
      updateActiveTab();
    };

    // タブの更新（同一タブ内でのページ遷移やURL変更時）
    const handleTabUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
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

    // 初回実行
    updateActiveTab();

    return () => {
      isMounted = false;
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, []);

  // 3. Web 同期ログインの開始
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

  // 4. ヒントの復号と表示実行（Web Crypto による直接復号）
  const decryptAndShowHint = useCallback(
    async (cred: CredentialItem, explicitKey?: CryptoKey) => {
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
        } catch (err) {
          console.warn("[PoohMa Sidepanel] Decrypt hint failed:", err);
        }
      }
    },
    [],
  );

  // 5. パスコード解除（Web Crypto による直接 PBKDF2 導出 ＆ MasterKey 展開）
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode || lockoutRemainingSec > 0) return;

    setUnlockError(null);
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

        console.log(
          "[PoohMa Sidepanel] Unlocking MasterKey with passcode for family:",
          currentFamily.name,
        );
        const derivedKey = await unlockMasterKeyWithPasscode(
          passcode,
          currentFamily,
        );

        masterKeyRef.current = derivedKey;
        setIsUnlocked(true);
        setPasscode("");
        setFailedAttempts(0);
        setUnlockError(null);
        setIsPasscodePromptOpen(false);

        // Offscreen Document があれば同期（バックグラウンド保持用・エラーは握る）
        sendExtensionMessage({
          type: "VAULT_UNLOCK",
          passcode,
        }).catch(() => {});

        // 保留されていたヒント要求があれば直ちに復号・表示
        if (pendingRevealCred) {
          const credToReveal = pendingRevealCred;
          setPendingRevealCred(null);
          await decryptAndShowHint(credToReveal, derivedKey);
        }
      } catch (err) {
        console.warn("[PoohMa Sidepanel] Unlock failed:", err);
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

  // パスコードモーダルのキャンセル
  const handleCancelUnlock = () => {
    setIsPasscodePromptOpen(false);
    setPendingRevealCred(null);
    setPasscode("");
    setUnlockError(null);
  };

  // 6. 手動ロック
  const handleLock = async () => {
    masterKeyRef.current = null;
    sendExtensionMessage({ type: "VAULT_LOCK" }).catch(() => {});
    setIsUnlocked(false);
    setIsPasscodePromptOpen(false);
    setPendingRevealCred(null);
    setDecryptedHints({});
    setVisibleHints({});
  };

  // 7. ログアウト（直接ストレージを削除して確実に未ログイン画面へ戻す）
  const handleSignOut = async () => {
    masterKeyRef.current = null;
    try {
      await clearAuthSession();
      sendExtensionMessage({ type: "AUTH_SIGN_OUT" }).catch(() => {});
    } catch (_err) {
      // 内部エラーは握る
    }
    setIsAuthenticated(false);
    setCurrentUser(null);
    setFamily(null);
    setIsUnlocked(false);
    setIsPasscodePromptOpen(false);
    setPendingRevealCred(null);
    setRecords([]);
    setDecryptedHints({});
    setVisibleHints({});
  };

  // 8. パスワードヒント復号トグル（Web の requireUnlock と同様、閲覧要求時にのみロック解除を促す）
  const toggleHintVisibility = async (cred: CredentialItem) => {
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
      setUnlockError(null);
      setPasscode("");
      setIsPasscodePromptOpen(true);
      return;
    }

    await decryptAndShowHint(cred);
  };

  // 8. クリップボードコピー
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // 9. カレントタブへの自動入力
  const handleFillLoginId = async (loginId: string) => {
    if (!tabInfo?.tabId) return;
    try {
      await sendExtensionMessage({
        type: "FORWARD_FILL_LOGIN_ID",
        tabId: tabInfo.tabId,
        loginId,
      });
      setCopiedKey(`fill-${loginId}`);
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch (_err) {
      handleCopy(loginId, `id-${loginId}`);
    }
  };

  // 10. レコードフィルタリング（閲覧中サイト一致 ＆ 検索クエリ）
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
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-orange-500/20">
      {/* 共通ヘッダー */}
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 px-3.5 py-2.5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-white shadow-xs">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold tracking-tight text-foreground">
                PoohMa
              </span>
              {(family?.name || currentUser?.displayName) && (
                <span
                  className="ml-1.5 inline-block text-[10px] text-muted-foreground truncate max-w-[110px]"
                  title={currentUser?.email}
                >
                  {family?.name || currentUser?.displayName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {isAuthenticated && isUnlocked && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLock}
                title="パスコードで再ロック"
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Lock className="h-3.5 w-3.5" />
              </Button>
            )}
            {isAuthenticated && (
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshState}
                title="再読み込み"
                className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
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
        {/* A. 未認証ビュー */}
        {!isAuthenticated ? (
          <Card className="border border-border/80 bg-card shadow-xs">
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
                className="pl-8 text-xs h-8 bg-card border-border/80"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground hover:text-foreground"
                >
                  クリア
                </button>
              )}
            </div>

            {/* 閲覧中サイト情報（検索クエリ未入力時のみ表示） */}
            {!searchQuery && tabInfo?.url && (
              <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-2.5 py-1.5 text-xs">
                <div className="flex items-center gap-1.5 overflow-hidden">
                  <Globe className="h-3 w-3 shrink-0 text-orange-500" />
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
                    className="overflow-hidden border border-border/80 bg-card shadow-xs"
                  >
                    <CardHeader className="p-3 pb-2 bg-muted/20 border-b border-border/60">
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
                              className="text-[9px] px-1 py-0 h-3.5 border-border text-muted-foreground"
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
                            className="rounded border border-border/60 p-2 space-y-1.5 bg-background/50"
                          >
                            {cred.label && (
                              <div className="text-[10px] font-medium text-muted-foreground">
                                {cred.label}
                              </div>
                            )}

                            {/* ログインID行 */}
                            {cred.loginId && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[10px] text-muted-foreground shrink-0 w-8">
                                  ID
                                </span>
                                <span className="font-mono text-xs text-foreground truncate mx-1.5 select-all">
                                  {cred.loginId}
                                </span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (cred.loginId) {
                                        handleFillLoginId(cred.loginId);
                                      }
                                    }}
                                    title="ページに入力"
                                    className="h-6 w-6 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                                  >
                                    {copiedKey === `fill-${cred.loginId}` ? (
                                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <PencilSparkles className="h-3 w-3" />
                                    )}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      if (cred.loginId) {
                                        handleCopy(
                                          cred.loginId,
                                          `id-${cred._id}`,
                                        );
                                      }
                                    }}
                                    title="コピー"
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  >
                                    {copiedKey === `id-${cred._id}` ? (
                                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* パスワードヒント行 */}
                            {cred.passwordHint && (
                              <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                                <span className="text-[10px] text-muted-foreground shrink-0 w-8">
                                  ヒント
                                </span>
                                <span className="font-mono text-xs text-foreground truncate mx-1.5 select-all">
                                  {visibleHints[cred._id]
                                    ? decryptedHints[cred._id] || "..."
                                    : "••••••••"}
                                </span>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => toggleHintVisibility(cred)}
                                    title={
                                      visibleHints[cred._id] ? "隠す" : "表示"
                                    }
                                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  >
                                    {visibleHints[cred._id] ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </Button>
                                  {visibleHints[cred._id] &&
                                    decryptedHints[cred._id] && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                          const hintText =
                                            decryptedHints[cred._id];
                                          if (hintText) {
                                            handleCopy(
                                              hintText,
                                              `hint-${cred._id}`,
                                            );
                                          }
                                        }}
                                        title="ヒントをコピー"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                      >
                                        {copiedKey === `hint-${cred._id}` ? (
                                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                        ) : (
                                          <Copy className="h-3 w-3" />
                                        )}
                                      </Button>
                                    )}
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
              <Card className="border-dashed border-border/80 bg-transparent p-5 text-center">
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
                      className="w-full text-xs font-medium"
                      onClick={() => {
                        const newUrl = `${env.VITE_SITE_URL}/records/new?url=${encodeURIComponent(
                          tabInfo?.url || "",
                        )}&title=${encodeURIComponent(tabInfo?.title || "")}`;
                        chrome.tabs.create({ url: newUrl });
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

      {/* 家族パスコード入力モーダル（ヒント閲覧要求時にのみ表示されるWeb互換仕様） */}
      {isAuthenticated && isPasscodePromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="passcode-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 animate-in fade-in"
        >
          <Card className="w-full max-w-sm border border-border/80 bg-card shadow-lg">
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
                    className="pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasscode((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
        <span>PoohMa Extension v0.1.0</span>
        <a
          href={env.VITE_SITE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          Webアプリを開く
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </footer>
    </div>
  );
}

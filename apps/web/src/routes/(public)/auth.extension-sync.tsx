import { api } from "@poohma/backend/api";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAuth } from "@/components/AuthProvider";
import { HoneyPotLoader } from "@/components/HoneyPotLoader";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { getCustomTokenFromSession } from "@/services/auth.functions";

const searchSchema = z.object({
  nonce: z.string().optional(),
});

export const Route = createFileRoute("/(public)/auth/extension-sync")({
  validateSearch: searchSchema,
  component: ExtensionSyncPage,
});

function debugSyncLog(...args: unknown[]) {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
}

function ExtensionSyncPage() {
  const { nonce } = Route.useSearch();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { isAuthenticated: isConvexAuth, isLoading: isConvexLoading } =
    useConvexAuth();
  const {
    activeAccountId,
    isLoading: isAccountLoading,
    accounts,
  } = useAccount();
  const issueSyncToken = useMutation(api.extensionAuth.issueSyncToken);

  const [status, setStatus] = useState<
    "processing" | "success" | "used" | "error"
  >(() => {
    if (typeof window !== "undefined" && nonce?.trim()) {
      const cleanNonce = nonce.trim();
      try {
        if (
          sessionStorage.getItem(`poohma_used_sync_nonce_${cleanNonce}`) ===
            "true" ||
          localStorage.getItem(`poohma_used_sync_nonce_${cleanNonce}`) ===
            "true"
        ) {
          return "used";
        }
      } catch (_) {}
    }
    return "processing";
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const syncIssuedRef = useRef(false);
  const attemptCleanupRef = useRef<(() => void) | null>(null);

  // アンマウント時に未完了のタイマー・リスナーを確実に解除
  useEffect(() => () => attemptCleanupRef.current?.(), []);

  // 1. nonce ガード: 欠落・不正時は即時エラートースト表示してルートへリダイレクト
  useEffect(() => {
    if (!nonce || typeof nonce !== "string" || !nonce.trim()) {
      toast.error("無効な連携リクエストです");
      navigate({ to: "/", replace: true });
    }
  }, [nonce, navigate]);

  // 2. 未認証時はログイン画面へリダイレクト（nonce を保持したまま戻れるようにする）
  useEffect(() => {
    if (isAuthLoading) return;
    if (!nonce?.trim()) return;

    if (!isAuthenticated) {
      const redirectUrl = `/auth/extension-sync?nonce=${encodeURIComponent(nonce)}`;
      navigate({
        to: "/login",
        search: { redirect: redirectUrl },
        replace: true,
      });
    }
  }, [isAuthenticated, isAuthLoading, nonce, navigate]);

  // 3. タイムアウト保護（8秒経過しても処理中なら再試行ボタンを表示）
  useEffect(() => {
    if (status !== "processing") return;
    const timer = setTimeout(() => {
      setIsTimedOut(true);
    }, 8000);
    return () => clearTimeout(timer);
  }, [status]);

  // 4. 手動再試行ハンドラ
  const handleRetry = useCallback(() => {
    attemptCleanupRef.current?.();
    attemptCleanupRef.current = null;
    syncIssuedRef.current = false;
    setIsTimedOut(false);
    setStatus("processing");
    setErrorMessage(null);
    setRetryAttempt((prev) => prev + 1);
  }, []);

  // 5. 認証・アカウント確定時: 短命同期コードを発行して Content Script へ伝達
  useEffect(() => {
    const targetAccountId = activeAccountId || accounts[0]?._id;
    debugSyncLog("[PoohMa Sync] Checking conditions:", {
      isAuthenticated,
      isAuthLoading,
      isConvexAuth,
      isConvexLoading,
      isAccountLoading,
      nonce: nonce?.slice(0, 8),
      syncIssued: syncIssuedRef.current,
      activeAccountId,
      accountsCount: accounts.length,
      targetAccountId,
      retryAttempt,
    });

    // Firebase Auth、Convex 接続認証、アカウント情報のすべてが準備完了するまで待機
    if (!isAuthenticated || isAuthLoading) {
      debugSyncLog("[PoohMa Sync] Waiting for Firebase Auth...", {
        isAuthenticated,
        isAuthLoading,
      });
      return;
    }
    if (!isConvexAuth || isConvexLoading) {
      debugSyncLog("[PoohMa Sync] Waiting for Convex Auth...", {
        isConvexAuth,
        isConvexLoading,
      });
      return;
    }
    if (isAccountLoading || !nonce?.trim()) {
      debugSyncLog("[PoohMa Sync] Waiting for Account / Nonce...", {
        isAccountLoading,
        hasNonce: !!nonce?.trim(),
      });
      return;
    }
    if (status !== "processing") {
      return;
    }
    if (syncIssuedRef.current) {
      debugSyncLog(
        "[PoohMa Sync] Sync code already issued, skipping duplicate",
      );
      return;
    }

    const cleanNonce = nonce.trim();
    if (!targetAccountId) {
      debugSyncLog(
        "[PoohMa Sync] Waiting for targetAccountId (no account resolved yet)",
      );
      return;
    }

    debugSyncLog(
      "[PoohMa Sync] All conditions met! Starting executeSync for account:",
      targetAccountId,
    );
    syncIssuedRef.current = true;

    async function executeSync() {
      try {
        debugSyncLog(
          "[PoohMa Sync] Issuing sync token & fetching credentials...",
        );
        // 7秒タイムアウト付きでトークン発行処理を実行（キューハング防止）
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 7000),
        );

        // セッションCookieからのCustom Token取得（3秒タイムアウト付き）
        const customTokenRes = await Promise.race([
          getCustomTokenFromSession(),
          new Promise<null>((r) => setTimeout(() => r(null), 3000)),
        ])
          .then((res) => {
            debugSyncLog(
              "[PoohMa Sync] getCustomTokenFromSession completed:",
              !!res?.customToken,
            );
            return res;
          })
          .catch(() => null);

        if (!customTokenRes?.customToken) {
          debugSyncLog(
            "[PoohMa Sync] Failed to retrieve custom token from session",
          );
          syncIssuedRef.current = false;
          setStatus("error");
          setErrorMessage(
            "認証トークンの取得に失敗しました。再ログインをお試しください。",
          );
          return;
        }

        // Convex 短命同期コードの発行（Convex Mutation、Custom Token をサーバー間バックチャネルで伝達）
        const issuePromise = issueSyncToken({
          accountId: targetAccountId,
          nonce: cleanNonce,
          customToken: customTokenRes.customToken,
        })
          .then((res) => {
            debugSyncLog(
              "[PoohMa Sync] issueSyncToken succeeded:",
              res?.code ? "code issued" : "no code",
            );
            return res;
          })
          .catch((err) => {
            throw err;
          });

        const [res] = await Promise.race([
          Promise.all([issuePromise]),
          timeoutPromise,
        ]);

        if (res?.success && res.code) {
          debugSyncLog(
            "[PoohMa Sync] Sync payload ready, dispatching window.postMessage...",
          );
          const currentTheme =
            typeof localStorage !== "undefined"
              ? localStorage.getItem("theme")
              : "system";

          // Content Script へのトークン非露出（CWE-200対策）: nonce, code, theme のみ中継
          const syncPayload = {
            type: "POOHMA_AUTH_SYNC",
            nonce: cleanNonce,
            code: res.code,
            theme: currentTheme || "system",
          };

          // 拡張機能からの同期完了 ACK（POOHMA_AUTH_SYNC_ACK）を待機
          let retryTimer: ReturnType<typeof setInterval> | null = null;
          let ackTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
          let acknowledged = false;

          const handleAck = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (
              event.data &&
              typeof event.data === "object" &&
              event.data.type === "POOHMA_AUTH_SYNC_ACK" &&
              event.data.nonce === cleanNonce
            ) {
              acknowledged = true;
              if (retryTimer) clearInterval(retryTimer);
              if (ackTimeoutTimer) clearTimeout(ackTimeoutTimer);
              window.removeEventListener("message", handleAck);
              try {
                sessionStorage.setItem(
                  `poohma_used_sync_nonce_${cleanNonce}`,
                  "true",
                );
                localStorage.setItem(
                  `poohma_used_sync_nonce_${cleanNonce}`,
                  "true",
                );
              } catch (_) {}
              setStatus("success");
              debugSyncLog("[PoohMa Sync] ACK received, status set to success");
            }
          };
          window.addEventListener("message", handleAck);
          attemptCleanupRef.current = () => {
            acknowledged = true;
            if (retryTimer) clearInterval(retryTimer);
            if (ackTimeoutTimer) clearTimeout(ackTimeoutTimer);
            window.removeEventListener("message", handleAck);
          };

          // 即時送信
          window.postMessage(syncPayload, window.location.origin);
          debugSyncLog("[PoohMa Sync] Initial window.postMessage sent");

          // Content Script の読み込み遅延に備えて 300ms 間隔で最大 8 回再送
          let retryCount = 0;
          retryTimer = setInterval(() => {
            retryCount += 1;
            if (retryCount >= 8) {
              if (retryTimer) clearInterval(retryTimer);
              debugSyncLog(
                "[PoohMa Sync] Max retries reached, waiting for background ACK...",
              );
              return;
            }
            window.postMessage(syncPayload, window.location.origin);
            debugSyncLog(
              `[PoohMa Sync] Retried window.postMessage (${retryCount}/8)`,
            );
          }, 300);

          // Background の非同期 Convex 通信完了まで十分な猶予（10秒）をもって ACK 待機
          ackTimeoutTimer = setTimeout(() => {
            if (acknowledged) return;
            if (retryTimer) clearInterval(retryTimer);
            window.removeEventListener("message", handleAck);
            attemptCleanupRef.current = null;
            syncIssuedRef.current = false;
            setStatus("error");
            setErrorMessage(
              "拡張機能からの応答を確認できませんでした。拡張機能が有効か確認してください。",
            );
          }, 10000);
        } else {
          syncIssuedRef.current = false;
          setStatus("error");
          setErrorMessage("連携コードの発行に失敗しました");
        }
      } catch (_err) {
        syncIssuedRef.current = false;
        setStatus("error");
        setErrorMessage("連携処理中にエラーが発生しました");
      }
    }

    executeSync();
  }, [
    isAuthenticated,
    isAuthLoading,
    isConvexAuth,
    isConvexLoading,
    isAccountLoading,
    activeAccountId,
    accounts,
    nonce,
    issueSyncToken,
    status,
    retryAttempt,
  ]);

  const handleCloseTab = () => {
    window.close();
  };

  if (!nonce?.trim()) {
    return null;
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-6 sm:p-8 text-center shadow-card space-y-6">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <ShieldCheck className="h-8 w-8" />
          </div>
        </div>

        {status === "processing" && (
          <div className="space-y-4">
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              拡張機能と連携中
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ブラウザ拡張機能との認証セッションを確立しています。しばらくお待ちください。
            </p>
            <div className="flex justify-center py-4">
              <HoneyPotLoader size="md" />
            </div>
            {isTimedOut && (
              <div className="pt-2 animate-in fade-in">
                <Button
                  onClick={handleRetry}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs font-medium border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  連携処理を再試行する
                </Button>
              </div>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="space-y-5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              連携完了
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              連携が完了しました
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              拡張機能との連携が正常に完了しました。このタブを閉じて拡張機能をご利用ください。
            </p>
            <div className="pt-2 flex flex-col gap-2.5">
              <Button
                onClick={handleCloseTab}
                className="w-full font-medium"
                size="sm"
              >
                このタブを閉じる
              </Button>
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ダッシュボードへ移動
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {status === "used" && (
          <div className="space-y-5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              連携済みリクエスト
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              この連携URLは既に使用済みです
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              この認証連携URLはすでに使用されており、セキュリティ保護のため再利用できません。
              再度連携を行う場合は、ブラウザ拡張機能から新しくログインを開始してください。
            </p>
            <div className="pt-2 flex flex-col gap-2.5">
              <Link
                to="/"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-primary py-2 px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                トップページへ戻る
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
              >
                ダッシュボードへ移動
                <ArrowRight className="h-3 w-3" />
              </Link>
              <Button
                onClick={handleCloseTab}
                variant="ghost"
                className="w-full font-medium text-xs text-muted-foreground"
                size="sm"
              >
                このタブを閉じる
              </Button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              エラー
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              連携に失敗しました
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {errorMessage ||
                "連携処理に失敗しました。もう一度拡張機能からログインをお試しください。"}
            </p>
            <div className="pt-2 flex flex-col gap-2.5">
              <Button
                onClick={handleRetry}
                variant="outline"
                className="w-full font-medium border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
                size="sm"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                もう一度試す
              </Button>
              <Button
                onClick={handleCloseTab}
                variant="ghost"
                className="w-full font-medium text-xs text-muted-foreground"
                size="sm"
              >
                このタブを閉じる
              </Button>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                トップページへ戻る
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { syncUser } from "@/services/auth.functions";
import { auth, googleProvider } from "@/utils/firebase";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    return {
      redirect: search.redirect as string | undefined,
    };
  },
  beforeLoad: ({ context }) => {
    if (context.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  const search = Route.useSearch();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }

    let isComponentMounted = true;
    let authFired = false;
    let redirectChecked = false;

    // 最終的な状態を判定してローディングを解除する関数
    const finalizeAuth = (user: unknown) => {
      if (!isComponentMounted) return;

      // リダイレクト確認と認証監視の両方が一度は完了している必要がある
      if (redirectChecked && authFired) {
        if (!user) {
          setIsLoading(false);
        }
      }
    };

    // リダイレクト結果の確認
    const checkRedirect = async () => {
      try {
        // biome-ignore lint/style/noNonNullAssertion: authはuseEffectの時点でnullでないことが保証されている
        await getRedirectResult(auth!);
      } catch (err) {
        console.error("Redirect login error:", err);
        setError("ログインに失敗しました。もう一度お試しください。");
      } finally {
        redirectChecked = true;
        // Firebaseの状態によっては、ここで既にauthFiredがtrueになっている場合がある
        if (auth?.currentUser === null) {
          finalizeAuth(null);
        }
      }
    };

    checkRedirect();

    // 認証状態の監視
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      authFired = true;

      if (user) {
        try {
          setIsLoading(true);
          const idToken = await user.getIdToken();
          await syncUser({ data: { idToken } });
          await queryClient.invalidateQueries({ queryKey: ["authUser"] });

          if (!isComponentMounted) return;
          await router.invalidate();

          const target =
            localStorage.getItem("postLoginRedirect") || "/dashboard";
          localStorage.removeItem("postLoginRedirect");

          try {
            const url = new URL(target, window.location.origin);
            await router.navigate({
              to: url.pathname,
              search: Object.fromEntries(url.searchParams),
            });
          } catch {
            await router.navigate({ to: "/dashboard" });
          }
        } catch (err) {
          console.error("Authentication flow error:", err);
          if (isComponentMounted) {
            setError("認証プロセスでエラーが発生しました。");
            setIsLoading(false);
          }
        }
      } else {
        finalizeAuth(null);
      }
    });

    return () => {
      isComponentMounted = false;
      unsubscribe();
    };
  }, [router, queryClient]);

  const handleGoogleLogin = async () => {
    if (!auth || !googleProvider) {
      setError("Firebaseの初期化に失敗しました。");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (search.redirect) {
        localStorage.setItem("postLoginRedirect", search.redirect);
      }
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      console.error("Login redirect error:", err);
      setError("ログイン画面への遷移に失敗しました。もう一度お試しください。");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-card p-8 shadow-lg">
        {/* ロゴエリア */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-orange-500">PoohMa</h1>
          <p className="mt-2 text-muted-foreground">
            家族のパスワード、
            <br />
            ヒントで安全に共有しよう。
          </p>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="rounded-md bg-red-950/20 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* ログインボタン */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="flex w-full items-center justify-center rounded-lg bg-card border border-border px-4 py-3 text-sm font-medium text-foreground shadow-sm hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {isLoading ? (
            <>
              <Spinner className="mr-2" />
              処理中...
            </>
          ) : (
            <>
              {/* Google G Logo SVG */}
              <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                <title>Google</title>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Googleでログイン
            </>
          )}
        </button>

        {/* フッターリンク */}
        <div className="mt-8 flex justify-center gap-4 text-xs text-muted-foreground">
          <Link
            to="/terms-of-service"
            className="hover:text-foreground transition-colors underline underline-offset-2"
          >
            利用規約
          </Link>
          <Link
            to="/privacy-policy"
            className="hover:text-foreground transition-colors underline underline-offset-2"
          >
            プライバシーポリシー
          </Link>
        </div>
      </div>
    </div>
  );
}

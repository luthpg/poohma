import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { isAuthenticated, loginWithGoogle } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, navigate]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await loginWithGoogle();
      toast.success("ログインしました");
    } catch {
      toast.error("ログインに失敗しました。もう一度お試しください。");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-zinc-950 tech-grid-pattern relative">
      <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 backdrop-blur-xl rounded-2xl p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* ロゴ & ヘッダー */}
        <div className="text-center space-y-3 mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 mx-auto shadow-2xl">
            <img
              src="/logo.png"
              alt="PoohMa Admin Logo"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              PoohMa Admin Console
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              システム管理者・運営専用コンソール
            </p>
          </div>
        </div>

        {/* ログインボタン */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full h-12 rounded-xl bg-white text-zinc-950 font-medium text-sm hover:bg-zinc-200 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer shadow-lg disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google アカウントで管理者ログイン</span>
          </button>
        </div>

        {/* セキュリティ・ガードレール案内 */}
        <div className="mt-8 pt-6 border-t border-zinc-800/80 space-y-2.5 text-xs text-zinc-500">
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              管理者認可を持つ Google アカウントのみがアクセスできます。
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link, useMatches } from "@tanstack/react-router";
import { Lightbulb, Plus } from "lucide-react";
import { ResponsiveNews } from "@/components/ResponsiveNews";
import { UserMenu } from "@/components/UserMenu";

interface AppHeaderProps {
  user: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  };
}

/**
 * (app) 配下の全ページで共通表示されるヘッダーコンポーネント。
 * - ロゴ（ダッシュボードへのリンク）
 * - お知らせ通知ベル (ResponsiveNews variant="bell")
 * - 使い方ガイドツアー起動ランプ
 * - ダッシュボード表示時のみ「+ 新規登録」ボタン
 * - UserMenu（アバター＋ドロップダウン）
 */
export function AppHeader({ user }: AppHeaderProps) {
  const matches = useMatches();
  const isDashboard = matches.some((m) => m.routeId === "/(app)/dashboard");

  return (
    <header className="sticky top-0 z-20 h-16 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
      <div className="mx-auto max-w-5xl h-full flex items-center justify-between px-6">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-[24px] font-semibold tracking-geist-h1 text-foreground hover:opacity-80 transition-opacity"
        >
          <img
            src="/poohma_icon.png"
            alt="PoohMa"
            className="h-9 w-9 object-contain"
          />
          <span className="hidden sm:inline">
            Pooh<span className="text-orange-500">Ma</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ResponsiveNews variant="bell" />
          {isDashboard && (
            <Link
              to="/dashboard"
              search={(prev) => ({ ...prev, onboarding: "guide" })}
              className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
              title="使い方を見る"
              aria-label="使い方を見る"
            >
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="hidden md:inline">使い方</span>
            </Link>
          )}
          {isDashboard && (
            <Link
              to="/records/new"
              data-tour="add-record"
              className="flex h-9 items-center justify-center rounded-md bg-orange-500 px-2.5 sm:px-4 text-[14px] font-medium text-white shadow-border hover:bg-orange-600 transition shrink-0"
              aria-label="新規登録"
            >
              <Plus className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">新規登録</span>
            </Link>
          )}
          <div data-tour="user-menu">
            <UserMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}

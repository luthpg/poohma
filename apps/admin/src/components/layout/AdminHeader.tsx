import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  FileText,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  User,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../lib/auth";
import { LivePulse } from "../ui/LivePulse";

const NAV_ITEMS = [
  { to: "/", label: "ダッシュボード", icon: Home },
  { to: "/contacts", label: "お問い合わせ", icon: MessageSquare },
  { to: "/users", label: "ユーザー・家族", icon: Users },
  { to: "/cms", label: "microCMS 連携", icon: FileText },
  { to: "/system", label: "システム運用", icon: Activity },
];

interface AdminHeaderProps {
  onOpenCommandPalette: () => void;
}

export function AdminHeader({ onOpenCommandPalette }: AdminHeaderProps) {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <>
      <header className="h-16 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between px-4 md:px-6">
        {/* 左側: モバイルメニューボタン or LivePulse */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="メニューを開く"
          >
            <Menu className="w-5 h-5" />
          </button>

          <LivePulse status="online" />
        </div>

        {/* 中央/右側: Cmd+K 検索ボタン & ユーザーメニュー */}
        <div className="flex items-center gap-3">
          {/* コマンドパレット起動トリガー */}
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:border-zinc-700 transition-all cursor-pointer min-h-[40px]"
          >
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span className="hidden sm:inline">検索またはコマンド...</span>
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-400 border border-zinc-700">
              ⌘K
            </span>
          </button>

          {/* ユーザー情報 & ログアウト */}
          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? "User"}
                className="w-7 h-7 rounded-full border border-zinc-700"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
            <span className="hidden lg:inline text-xs text-zinc-300 font-mono max-w-[140px] truncate">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={() => logout()}
              title="ログアウト"
              className="p-1.5 rounded text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="ログアウト"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* モバイル用スライドオーバードロワー */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[80vw] bg-zinc-950 border-r border-zinc-800 h-full flex flex-col p-4 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0">
                  <img
                    src="/logo.png"
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="font-semibold text-sm text-white">
                  PoohMa Admin
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 py-4 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.to === "/"
                    ? currentPath === "/"
                    : currentPath.startsWith(item.to);

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                      isActive
                        ? "bg-zinc-800 text-white border border-zinc-700"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-zinc-800 text-xs text-zinc-500">
              <div className="font-mono text-zinc-400 truncate mb-2">
                {user?.email}
              </div>
              <button
                type="button"
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-red-400 min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span>ログアウト</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

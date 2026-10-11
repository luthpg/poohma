import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  FileText,
  Home,
  MessageSquare,
  ShieldAlert,
  Users,
} from "lucide-react";

const NAV_ITEMS = [
  {
    to: "/",
    label: "ダッシュボード",
    icon: Home,
    badge: null,
  },
  {
    to: "/contacts",
    label: "お問い合わせ",
    icon: MessageSquare,
    badge: null,
  },
  {
    to: "/users",
    label: "ユーザー・家族",
    icon: Users,
    badge: null,
  },
  {
    to: "/cms",
    label: "microCMS 連携",
    icon: FileText,
    badge: null,
  },
  {
    to: "/system",
    label: "システム運用",
    icon: Activity,
    badge: null,
  },
];

export function AdminSidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md h-screen sticky top-0 z-30 select-none">
      {/* ロゴ & バッジ */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-zinc-800/80">
        <div className="w-8 h-8 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900 shrink-0 shadow-sm">
          <img
            src="/logo.png"
            alt="PoohMa Logo"
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white tracking-tight">
              PoohMa
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
              Admin
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono block">
            Console v1.0
          </span>
        </div>
      </div>

      {/* ナビゲーションリンク */}
      <nav className="flex-1 px-3 py-4 space-y-1">
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-zinc-800/80 text-white border border-zinc-700/60 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive ? "text-emerald-400" : "text-zinc-500"
                }`}
              />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* フッター / セキュリティバナー */}
      <div className="p-4 border-t border-zinc-800/80">
        <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400 font-mono mb-1">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px]">E2EE Invariant Active</span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            パスワードヒント平文は暗号化保護されており閲覧不可です。
          </p>
        </div>
      </div>
    </aside>
  );
}

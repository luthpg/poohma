import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Activity,
  FileText,
  Home,
  MessageSquare,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useEffect } from "react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else window.dispatchEvent(new CustomEvent("open-command-palette"));
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const runCommand = (command: () => void) => {
    command();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center pt-16 md:pt-0 p-4">
      {/* 背景ブラー */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-xl z-10">
        <Command className="w-full bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden text-zinc-100">
          <div className="flex items-center px-4 border-b border-zinc-800/80">
            <Search className="w-4 h-4 text-zinc-500 mr-2" />
            <Command.Input
              placeholder="検索またはコマンドを入力... (Esc で閉じる)"
              className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-zinc-500 font-sans text-white"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-xs text-zinc-500">
              一致するコマンドが見つかりません
            </Command.Empty>

            <Command.Group
              heading="ナビゲーション"
              className="text-xs text-zinc-500 font-mono px-2 py-1.5"
            >
              <Command.Item
                onSelect={() => runCommand(() => navigate({ to: "/" }))}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer transition-colors"
              >
                <Home className="w-4 h-4 text-zinc-400" />
                <span>ダッシュボード</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate({ to: "/contacts" }))}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-amber-400" />
                <span>お問い合わせ管理</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate({ to: "/users" }))}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer transition-colors"
              >
                <Users className="w-4 h-4 text-cyan-400" />
                <span>ユーザー & ファミリー照会</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate({ to: "/cms" }))}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer transition-colors"
              >
                <FileText className="w-4 h-4 text-violet-400" />
                <span>microCMS お知らせ連携</span>
              </Command.Item>

              <Command.Item
                onSelect={() => runCommand(() => navigate({ to: "/system" }))}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-900 cursor-pointer transition-colors"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>システム運用 & 監査ログ</span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="クイックアクション"
              className="text-xs text-zinc-500 font-mono px-2 py-1.5 mt-2"
            >
              <Command.Item
                onSelect={() =>
                  runCommand(() => {
                    navigate({ to: "/system" });
                  })
                }
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>デモファミリー環境のリセット画面へ</span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/50 border-t border-zinc-800/80 text-[11px] text-zinc-500 font-mono">
            <span>PoohMa Command Palette</span>
            <div className="flex items-center gap-2">
              <span>↑↓ 選択</span>
              <span>↵ 決定</span>
              <span>Esc 閉じる</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
}

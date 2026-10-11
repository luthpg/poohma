import { api } from "@poohma/backend/api";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { KeyRound, Search, Users } from "lucide-react";
import { useState } from "react";
import { CopyableBadge } from "../../components/ui/CopyableBadge";

export const Route = createFileRoute("/_auth/users")({
  component: UsersPage,
});

function UsersPage() {
  const [activeTab, setActiveTab] = useState<"users" | "families">("users");
  const [searchQuery, setSearchQuery] = useState("");

  const users = useQuery(api.admin.users.getUsersList, {
    search: searchQuery,
  });

  const families = useQuery(api.admin.users.getFamiliesList, {});

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Users className="w-6 h-6 text-cyan-400" />
          <span>ユーザー & ファミリー照会</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          登録アカウントおよび家族グループの利用状況確認
        </p>
      </div>

      {/* タブ切り替え & 検索バー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer min-h-[36px] ${
              activeTab === "users"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>ユーザー一覧</span>
            <span className="ml-1.5 text-[10px] text-zinc-500">
              ({users?.length ?? 0})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("families")}
            className={`px-4 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer min-h-[36px] ${
              activeTab === "families"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>家族グループ一覧</span>
            <span className="ml-1.5 text-[10px] text-zinc-500">
              ({families?.length ?? 0})
            </span>
          </button>
        </div>

        {activeTab === "users" && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder="メール・名前で検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-zinc-700 min-h-[40px]"
            />
          </div>
        )}
      </div>

      {/* ユーザー一覧テーブル / カード */}
      {activeTab === "users" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 font-mono">
                <tr>
                  <th className="py-3 px-4">表示名</th>
                  <th className="py-3 px-4">メールアドレス</th>
                  <th className="py-3 px-4">所属家族</th>
                  <th className="py-3 px-4">家族ロール</th>
                  <th className="py-3 px-4 text-right">登録日時</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {users == null ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      読み込み中...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      ユーザーが見つかりません
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-zinc-200">
                        {u.displayName ?? "（未設定）"}
                      </td>
                      <td className="py-3.5 px-4">
                        <CopyableBadge value={u.email} truncateLength={24} />
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">
                        {u.familyName ? (
                          <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 text-[11px]">
                            {u.familyName}
                          </span>
                        ) : (
                          <span className="text-zinc-500 text-[11px]">
                            未所属
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            u.familyRole === "admin"
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}
                        >
                          {u.familyRole}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-400">
                        {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* モバイル表示 */}
          <div className="md:hidden divide-y divide-zinc-800/80">
            {users == null ? (
              <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                読み込み中...
              </div>
            ) : users.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500 font-mono">
                ユーザーが見つかりません
              </div>
            ) : (
              users.map((u) => (
                <div key={u.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-zinc-200">
                      {u.displayName ?? "（未設定）"}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {u.familyRole}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <CopyableBadge value={u.email} truncateLength={22} />
                    <span className="text-[11px] font-mono text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString("ja-JP")}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    所属: {u.familyName ?? "未所属"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ファミリーグループ一覧 */}
      {activeTab === "families" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 font-mono">
                <tr>
                  <th className="py-3 px-4">家族名</th>
                  <th className="py-3 px-4">メンバー数</th>
                  <th className="py-3 px-4">暗号バージョン</th>
                  <th className="py-3 px-4">リカバリーキット</th>
                  <th className="py-3 px-4 text-right">最終更新</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {families == null ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      読み込み中...
                    </td>
                  </tr>
                ) : families.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      ファミリーグループがありません
                    </td>
                  </tr>
                ) : (
                  families.map((f) => (
                    <tr
                      key={f.id}
                      className="hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-zinc-200">
                        {f.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-cyan-400">
                        {f.memberCount} 名
                      </td>
                      <td className="py-3.5 px-4 font-mono text-zinc-400">
                        v{f.cryptoVersion}
                      </td>
                      <td className="py-3.5 px-4">
                        {f.hasRecoveryKit ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                            <KeyRound className="w-3.5 h-3.5" />
                            発行済み
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-500 font-mono">
                            未発行
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-400">
                        {new Date(f.updatedAt).toLocaleDateString("ja-JP")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* モバイル表示 */}
          <div className="md:hidden divide-y divide-zinc-800/80">
            {families?.map((f) => (
              <div key={f.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-zinc-200">
                    {f.name}
                  </span>
                  <span className="text-xs font-mono text-cyan-400">
                    {f.memberCount} 名
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>暗号: v{f.cryptoVersion}</span>
                  <span>
                    リカバリー: {f.hasRecoveryKit ? "発行済み" : "未発行"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { api } from "@poohma/backend/api";
import type { Doc, Id } from "@poohma/backend/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle, Clock, Mail, MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { CopyableBadge } from "../../components/ui/CopyableBadge";
import { StatusBadge } from "../../components/ui/StatusBadge";

export const Route = createFileRoute("/_auth/contacts")({
  component: ContactsPage,
});

type StatusFilter = "ALL" | "UNREAD" | "READ" | "RESOLVED";
type ContactDoc = Doc<"contacts">;

function ContactsPage() {
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactDoc | null>(
    null,
  );

  const contacts = useQuery(api.admin.contacts.getContacts, {
    status: filter === "ALL" ? undefined : filter,
  });

  const stats = useQuery(api.admin.contacts.getContactStats, {});
  const updateStatus = useMutation(api.admin.contacts.updateContactStatus);

  const handleUpdateStatus = async (
    id: Id<"contacts">,
    newStatus: "UNREAD" | "READ" | "RESOLVED",
  ) => {
    try {
      await updateStatus({ id, status: newStatus });
      toast.success(`ステータスを「${newStatus}」に更新しました`);
      if (selectedContact?._id === id) {
        setSelectedContact((prev) =>
          prev ? { ...prev, status: newStatus } : null,
        );
      }
    } catch {
      toast.error("ステータスの更新に失敗しました");
    }
  };

  const filteredContacts = (contacts ?? []).filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.message.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ページタイトル */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <MessageSquare className="w-6 h-6 text-amber-400" />
          <span>お問い合わせ管理</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          ユーザーからの問い合わせ一覧と対応ステータス管理
        </p>
      </div>

      {/* ステータスタブ & 検索バー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* タブ (横スクロール可能) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-zinc-900/80 border border-zinc-800 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              filter === "ALL"
                ? "bg-zinc-800 text-white font-semibold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>すべて</span>
            <span className="text-[10px] text-zinc-500">
              ({stats?.total ?? 0})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("UNREAD")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              filter === "UNREAD"
                ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>未対応</span>
            <span className="text-[10px] text-amber-400">
              ({stats?.unread ?? 0})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("READ")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              filter === "READ"
                ? "bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>対応中</span>
            <span className="text-[10px] text-cyan-400">
              ({stats?.read ?? 0})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilter("RESOLVED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap min-h-[36px] flex items-center gap-1.5 ${
              filter === "RESOLVED"
                ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>完了</span>
            <span className="text-[10px] text-emerald-400">
              ({stats?.resolved ?? 0})
            </span>
          </button>
        </div>

        {/* 検索入力欄 */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="送信者・内容で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-white placeholder:text-zinc-500 outline-none focus:border-zinc-700 min-h-[40px]"
          />
        </div>
      </div>

      {/* デスクトップ表示: 高密度データテーブル */}
      <div className="hidden md:block rounded-xl border border-zinc-800/80 bg-zinc-900/30 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 font-mono">
            <tr>
              <th className="py-3 px-4">日時</th>
              <th className="py-3 px-4">送信者</th>
              <th className="py-3 px-4">種別</th>
              <th className="py-3 px-4">本文</th>
              <th className="py-3 px-4">ステータス</th>
              <th className="py-3 px-4 text-right">アクション</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {filteredContacts.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-12 text-center text-zinc-500 font-mono"
                >
                  該当するお問い合わせはありません
                </td>
              </tr>
            ) : (
              filteredContacts.map((contact) => (
                <tr
                  key={contact._id}
                  onClick={() => setSelectedContact(contact)}
                  className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                >
                  <td className="py-3.5 px-4 font-mono text-zinc-400 whitespace-nowrap">
                    {new Date(contact.createdAt).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-zinc-200">
                      {contact.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono">
                      {contact.email}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-300">
                    <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/50 text-[11px]">
                      {contact.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-400 max-w-xs truncate">
                    {contact.message}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={contact.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedContact(contact);
                      }}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                    >
                      詳細
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* モバイル表示: カード型レイアウト（タッチ最適化） */}
      <div className="md:hidden space-y-3">
        {filteredContacts.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500 font-mono">
            該当するお問い合わせはありません
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <button
              type="button"
              key={contact._id}
              onClick={() => setSelectedContact(contact)}
              className="w-full text-left p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2.5 active:scale-[0.99] transition-all cursor-pointer block"
            >
              <div className="flex items-center justify-between">
                <StatusBadge status={contact.status} />
                <span className="text-[11px] text-zinc-500 font-mono">
                  {new Date(contact.createdAt).toLocaleDateString("ja-JP")}
                </span>
              </div>

              <div>
                <div className="font-semibold text-sm text-zinc-200">
                  {contact.name}
                </div>
                <div className="text-xs text-zinc-400 font-mono">
                  {contact.email}
                </div>
              </div>

              <div className="text-xs text-zinc-300 line-clamp-2">
                {contact.message}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-500">
                <span>{contact.category}</span>
                <span className="text-emerald-400 font-medium">
                  タップして詳細
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* 詳細表示ボトムシート (モバイル親指操作 & デスクトップ対応) */}
      <BottomSheet
        isOpen={selectedContact != null}
        onClose={() => setSelectedContact(null)}
        title={
          selectedContact ? `${selectedContact.name} 様からのお問い合わせ` : ""
        }
        description={selectedContact?.category}
      >
        {selectedContact && (
          <div className="space-y-5">
            {/* メタ情報 */}
            <div className="p-3.5 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">送信日時:</span>
                <span className="font-mono text-zinc-300">
                  {new Date(selectedContact.createdAt).toLocaleString("ja-JP")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">メールアドレス:</span>
                <CopyableBadge
                  value={selectedContact.email}
                  truncateLength={30}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">ステータス:</span>
                <StatusBadge status={selectedContact.status} />
              </div>
            </div>

            {/* 本文 */}
            <div>
              <div className="text-xs font-mono text-zinc-500 mb-1.5">本文</div>
              <div className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
                {selectedContact.message}
              </div>
            </div>

            {/* アクションボタン群 (44pxタッチターゲット) */}
            <div className="pt-3 border-t border-zinc-800 space-y-2.5">
              <div className="text-xs font-mono text-zinc-500 mb-1">
                ステータスを変更
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStatus(selectedContact._id, "UNREAD")
                  }
                  className={`h-11 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedContact.status === "UNREAD"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>未対応</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStatus(selectedContact._id, "READ")
                  }
                  className={`h-11 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedContact.status === "READ"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                  }`}
                >
                  <span>対応中</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleUpdateStatus(selectedContact._id, "RESOLVED")
                  }
                  className={`h-11 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    selectedContact.status === "RESOLVED"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>完了</span>
                </button>
              </div>

              {/* メール返信用リンク */}
              <a
                href={`mailto:${encodeURIComponent(selectedContact.email).replaceAll("%40", "@")}?subject=${encodeURIComponent(
                  "【PoohMaサポート】お問い合わせについて",
                )}&body=${encodeURIComponent(
                  `\n\n--- お問い合わせ内容 ---\n${selectedContact.message}`,
                )}`}
                className="w-full h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4 text-emerald-400" />
                <span>メールソフトで返信を作成</span>
              </a>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

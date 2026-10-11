import { api } from "@poohma/backend/api";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import {
  Edit3,
  ExternalLink,
  FileCheck,
  FileText,
  HelpCircle,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { CopyableBadge } from "../../components/ui/CopyableBadge";
import { stripHtmlTags } from "../../lib/utils";

// 型定義
interface InfoItem {
  id: string;
  title: string;
  content?: string;
  published_at?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  status?: "published" | "draft";
}

interface FaqItem {
  id: string;
  slug?: string;
  question: string;
  answer: string;
  category: string | { id?: string; name: string };
  createdAt: string;
  updatedAt: string;
}

interface LegalItem {
  terms: string;
  privacy: string;
  published_at?: string;
}

export const Route = createFileRoute("/_auth/cms")({
  component: CmsPage,
});

function CmsPage() {
  const [activeTab, setActiveTab] = useState<"info" | "faq" | "legal">("info");

  // Actions
  const fetchInfoList = useAction(api.admin.cms.getCmsInfoList);
  const createInfo = useAction(api.admin.cms.createCmsInfo);
  const updateInfo = useAction(api.admin.cms.updateCmsInfo);
  const deleteInfo = useAction(api.admin.cms.deleteCmsInfo);

  const fetchFaqList = useAction(api.admin.cms.getCmsFaqList);
  const createFaq = useAction(api.admin.cms.createCmsFaq);
  const updateFaq = useAction(api.admin.cms.updateCmsFaq);
  const deleteFaq = useAction(api.admin.cms.deleteCmsFaq);

  const fetchLegal = useAction(api.admin.cms.getCmsLegal);
  const updateLegal = useAction(api.admin.cms.updateCmsLegal);

  // データ状態
  const [infoList, setInfoList] = useState<InfoItem[]>([]);
  const [faqList, setFaqList] = useState<FaqItem[]>([]);
  const [legalData, setLegalData] = useState<LegalItem | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [loading, setLoading] = useState(false);

  // info モーダル
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [editingInfo, setEditingInfo] = useState<InfoItem | null>(null);
  const [infoTitle, setInfoTitle] = useState("");
  const [infoContent, setInfoContent] = useState("");
  const [infoIsDraft, setInfoIsDraft] = useState(false);
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  // faq モーダル
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [faqQuestion, setFaqQuestion] = useState("");
  const [faqAnswer, setFaqAnswer] = useState("");
  const [faqCategory, setFaqCategory] = useState("全般");
  const [isSavingFaq, setIsSavingFaq] = useState(false);

  // legal エディタ
  const [legalTerms, setLegalTerms] = useState("");
  const [legalPrivacy, setLegalPrivacy] = useState("");
  const [isSavingLegal, setIsSavingLegal] = useState(false);
  const [legalLoaded, setLegalLoaded] = useState(false);

  // データ読み込み
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === "info") {
        const res = await fetchInfoList({ limit: 50 });
        setInfoList(res.contents);
        setIsConfigured(res.configured);
      } else if (activeTab === "faq") {
        const res = await fetchFaqList({ limit: 50 });
        setFaqList(res.contents);
        setIsConfigured(res.configured);
      } else if (activeTab === "legal") {
        setLegalLoaded(false);
        const res = await fetchLegal();
        if (res.data) {
          setLegalData(res.data);
          setLegalTerms(res.data.terms);
          setLegalPrivacy(res.data.privacy);
          setLegalLoaded(true);
        } else {
          toast.error("microCMS からのデータ取得に失敗しました");
        }
        setIsConfigured(res.configured);
      }
    } catch {
      toast.error("microCMS からのデータ取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchInfoList, fetchFaqList, fetchLegal]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // info 保存
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!infoTitle.trim() || !infoContent.trim()) {
      toast.error("タイトルと本文を入力してください");
      return;
    }
    setIsSavingInfo(true);
    try {
      if (editingInfo) {
        await updateInfo({
          id: editingInfo.id,
          title: infoTitle,
          content: infoContent,
          isDraft: infoIsDraft,
        });
        toast.success("お知らせを更新しました");
      } else {
        await createInfo({
          title: infoTitle,
          content: infoContent,
          isDraft: infoIsDraft,
        });
        toast.success("お知らせを作成しました");
      }
      setInfoModalOpen(false);
      await loadData();
    } catch {
      toast.error("お知らせの保存に失敗しました");
    } finally {
      setIsSavingInfo(false);
    }
  };

  // info 削除
  const handleDeleteInfo = async (id: string) => {
    if (!confirm("本当にこのお知らせを削除しますか？")) return;
    try {
      await deleteInfo({ id });
      toast.success("お知らせを削除しました");
      await loadData();
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  // faq 保存
  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqQuestion.trim() || !faqAnswer.trim()) {
      toast.error("質問と回答を入力してください");
      return;
    }
    setIsSavingFaq(true);
    try {
      if (editingFaq) {
        await updateFaq({
          id: editingFaq.id,
          question: faqQuestion,
          answer: faqAnswer,
          category: faqCategory,
        });
        toast.success("FAQを更新しました");
      } else {
        await createFaq({
          question: faqQuestion,
          answer: faqAnswer,
          category: faqCategory,
        });
        toast.success("FAQを作成しました");
      }
      setFaqModalOpen(false);
      await loadData();
    } catch {
      toast.error("FAQの保存に失敗しました");
    } finally {
      setIsSavingFaq(false);
    }
  };

  // faq 削除
  const handleDeleteFaq = async (id: string) => {
    if (!confirm("本当にこのFAQを削除しますか？")) return;
    try {
      await deleteFaq({ id });
      toast.success("FAQを削除しました");
      await loadData();
    } catch {
      toast.error("削除に失敗しました");
    }
  };

  // legal 保存
  const handleSaveLegal = async () => {
    setIsSavingLegal(true);
    try {
      await updateLegal({
        terms: legalTerms,
        privacy: legalPrivacy,
      });
      toast.success("利用規約とプライバシーポリシーを更新しました");
      await loadData();
    } catch {
      toast.error("規約の更新に失敗しました");
    } finally {
      setIsSavingLegal(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ページタイトル */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-purple-400" />
            <span>microCMS コンテンツ管理</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            お知らせ (info)・よくある質問 (faq)・規約 (legal) の 3
            つのエンドポイント一元管理
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition-all cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="再取得"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {activeTab === "info" && (
            <button
              type="button"
              onClick={() => {
                setEditingInfo(null);
                setInfoTitle("");
                setInfoContent("");
                setInfoIsDraft(false);
                setInfoModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>お知らせ作成</span>
            </button>
          )}

          {activeTab === "faq" && (
            <button
              type="button"
              onClick={() => {
                setEditingFaq(null);
                setFaqQuestion("");
                setFaqAnswer("");
                setFaqCategory("全般");
                setFaqModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>FAQ追加</span>
            </button>
          )}

          <a
            href="https://poohma.microcms.io/"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white text-xs font-mono transition-all flex items-center gap-1.5 min-h-[44px]"
          >
            <span>microCMS Console</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {!isConfigured && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400" />
          <span>
            microCMS の環境変数（MICROCMS_SERVICE_DOMAIN /
            MICROCMS_API_KEY）が設定されていません。
          </span>
        </div>
      )}

      {/* タブ切り替えバー */}
      <div className="flex border-b border-zinc-800 gap-6">
        <button
          type="button"
          onClick={() => setActiveTab("info")}
          className={`pb-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer min-h-[44px] ${
            activeTab === "info"
              ? "border-purple-400 text-purple-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>お知らせ (info)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
            {infoList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("faq")}
          className={`pb-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer min-h-[44px] ${
            activeTab === "faq"
              ? "border-purple-400 text-purple-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>よくある質問 (faq)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-800 text-zinc-400">
            {faqList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("legal")}
          className={`pb-3 text-xs font-mono font-medium border-b-2 transition-all flex items-center gap-2 cursor-pointer min-h-[44px] ${
            activeTab === "legal"
              ? "border-purple-400 text-purple-400"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>規約・ポリシー (legal)</span>
        </button>
      </div>

      {/* 1. info タブ */}
      {activeTab === "info" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono">
                <tr>
                  <th className="py-3 px-4">Content ID</th>
                  <th className="py-3 px-4">タイトル</th>
                  <th className="py-3 px-4">公開日時</th>
                  <th className="py-3 px-4">更新日時</th>
                  <th className="py-3 px-4 text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {infoList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      {loading ? "読み込み中..." : "お知らせがありません"}
                    </td>
                  </tr>
                ) : (
                  infoList.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono">
                        <CopyableBadge value={item.id} />
                      </td>
                      <td className="py-3 px-4 font-medium text-white max-w-md truncate">
                        {item.title}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-400 whitespace-nowrap">
                        {(item.publishedAt ?? item.published_at)
                          ? new Date(
                              item.publishedAt ?? item.published_at ?? "",
                            ).toLocaleDateString("ja-JP")
                          : "未設定"}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-500 whitespace-nowrap">
                        {new Date(item.updatedAt).toLocaleDateString("ja-JP")}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInfo(item);
                              setInfoTitle(item.title);
                              setInfoContent(item.content ?? "");
                              setInfoIsDraft(false);
                              setInfoModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="編集"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInfo(item.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* モバイル表示 */}
          <div className="md:hidden divide-y divide-zinc-800/80">
            {infoList.map((item) => (
              <div key={item.id} className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <CopyableBadge value={item.id} />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingInfo(item);
                        setInfoTitle(item.title);
                        setInfoContent(item.content ?? "");
                        setInfoIsDraft(false);
                        setInfoModalOpen(true);
                      }}
                      className="p-2 rounded bg-zinc-800 text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteInfo(item.id)}
                      className="p-2 rounded bg-red-500/10 text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="font-semibold text-white">{item.title}</div>
                <div className="text-[11px] font-mono text-zinc-500">
                  {new Date(item.updatedAt).toLocaleDateString("ja-JP")}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. faq タブ */}
      {activeTab === "faq" && (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
          <div className="hidden md:block">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/80 border-b border-zinc-800/80 text-zinc-400 font-mono">
                <tr>
                  <th className="py-3 px-4">カテゴリ</th>
                  <th className="py-3 px-4">質問 (Question)</th>
                  <th className="py-3 px-4">回答プレビュー</th>
                  <th className="py-3 px-4 text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {faqList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-12 text-center text-zinc-500 font-mono"
                    >
                      {loading ? "読み込み中..." : "FAQがありません"}
                    </td>
                  </tr>
                ) : (
                  faqList.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-[10px] font-mono text-purple-300">
                          {typeof item.category === "string"
                            ? item.category
                            : item.category.name}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-white max-w-xs truncate">
                        {item.question}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 max-w-md truncate text-[11px]">
                        {stripHtmlTags(item.answer)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFaq(item);
                              setFaqQuestion(item.question);
                              setFaqAnswer(item.answer);
                              setFaqCategory(
                                typeof item.category === "string"
                                  ? item.category
                                  : item.category.name,
                              );
                              setFaqModalOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title="編集"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFaq(item.id)}
                            className="p-1.5 rounded hover:bg-red-500/10 text-red-400 transition-colors cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* モバイル表示 */}
          <div className="md:hidden divide-y divide-zinc-800/80">
            {faqList.map((item) => (
              <div key={item.id} className="p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-purple-300">
                    {typeof item.category === "string"
                      ? item.category
                      : item.category.name}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFaq(item);
                        setFaqQuestion(item.question);
                        setFaqAnswer(item.answer);
                        setFaqCategory(
                          typeof item.category === "string"
                            ? item.category
                            : item.category.name,
                        );
                        setFaqModalOpen(true);
                      }}
                      className="p-2 rounded bg-zinc-800 text-zinc-300 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFaq(item.id)}
                      className="p-2 rounded bg-red-500/10 text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="font-semibold text-white">{item.question}</div>
                <div className="text-[11px] text-zinc-400 line-clamp-2">
                  {stripHtmlTags(item.answer)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. legal タブ */}
      {activeTab === "legal" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              {legalData?.published_at && (
                <span className="font-mono">
                  最終改訂日:{" "}
                  {new Date(legalData.published_at).toLocaleDateString("ja-JP")}
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={handleSaveLegal}
              disabled={isSavingLegal || !legalLoaded}
              className="px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>
                {isSavingLegal ? "保存中..." : "規約・ポリシーを保存"}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 利用規約 */}
            <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-purple-400" />
                <span>利用規約 (terms)</span>
              </h2>
              <textarea
                value={legalTerms}
                onChange={(e) => setLegalTerms(e.target.value)}
                placeholder="利用規約のMarkdown/HTML本文..."
                rows={16}
                className="w-full p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none focus:border-purple-500/50 resize-y leading-relaxed"
              />
            </div>

            {/* プライバシーポリシー */}
            <div className="p-5 rounded-xl bg-zinc-900/40 border border-zinc-800/80 space-y-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-purple-400" />
                <span>プライバシーポリシー (privacy)</span>
              </h2>
              <textarea
                value={legalPrivacy}
                onChange={(e) => setLegalPrivacy(e.target.value)}
                placeholder="プライバシーポリシーのMarkdown/HTML本文..."
                rows={16}
                className="w-full p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none focus:border-purple-500/50 resize-y leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* お知らせ作成/編集 BottomSheet */}
      <BottomSheet
        isOpen={infoModalOpen}
        onClose={() => setInfoModalOpen(false)}
        title={editingInfo ? "お知らせの編集" : "新しいお知らせの作成"}
        description="microCMS info エンドポイントへ即時反映されます"
      >
        <form onSubmit={handleSaveInfo} className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="text-xs font-mono text-zinc-400"
              htmlFor="info-title"
            >
              タイトル *
            </label>
            <input
              id="info-title"
              type="text"
              value={infoTitle}
              onChange={(e) => setInfoTitle(e.target.value)}
              placeholder="例: v1.2.0 アップデートのお知らせ"
              required
              className="w-full h-11 px-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-mono text-zinc-400"
              htmlFor="info-content"
            >
              本文 (HTML / リッチテキスト) *
            </label>
            <textarea
              id="info-content"
              value={infoContent}
              onChange={(e) => setInfoContent(e.target.value)}
              placeholder="<p>お知らせ本文...</p>"
              rows={8}
              required
              className="w-full p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="info-draft"
              checked={infoIsDraft}
              onChange={(e) => setInfoIsDraft(e.target.checked)}
              className="rounded border-zinc-700 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
            />
            <label
              htmlFor="info-draft"
              className="text-xs text-zinc-300 cursor-pointer"
            >
              下書き（Draft）として保存する
            </label>
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <button
              type="submit"
              disabled={isSavingInfo}
              className="w-full h-12 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingInfo ? "保存中..." : "保存する"}</span>
            </button>
            <button
              type="button"
              onClick={() => setInfoModalOpen(false)}
              className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-medium cursor-pointer min-h-[44px]"
            >
              キャンセル
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* FAQ作成/編集 BottomSheet */}
      <BottomSheet
        isOpen={faqModalOpen}
        onClose={() => setFaqModalOpen(false)}
        title={editingFaq ? "FAQの編集" : "新しいFAQの追加"}
        description="microCMS faq エンドポイントへ即時反映されます"
      >
        <form onSubmit={handleSaveFaq} className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="text-xs font-mono text-zinc-400"
              htmlFor="faq-category"
            >
              カテゴリ *
            </label>
            <input
              id="faq-category"
              type="text"
              value={faqCategory}
              onChange={(e) => setFaqCategory(e.target.value)}
              placeholder="例: アカウント、暗号化、家族管理"
              required
              className="w-full h-11 px-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-mono text-zinc-400"
              htmlFor="faq-question"
            >
              質問 (Question) *
            </label>
            <input
              id="faq-question"
              type="text"
              value={faqQuestion}
              onChange={(e) => setFaqQuestion(e.target.value)}
              placeholder="例: パスコードを忘れた場合はどうすればよいですか？"
              required
              className="w-full h-11 px-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="text-xs font-mono text-zinc-400"
              htmlFor="faq-answer"
            >
              回答 (Answer - HTML / リッチテキスト) *
            </label>
            <textarea
              id="faq-answer"
              value={faqAnswer}
              onChange={(e) => setFaqAnswer(e.target.value)}
              placeholder="<p>回答の本文...</p>"
              rows={8}
              required
              className="w-full p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex flex-col gap-2 pt-3">
            <button
              type="submit"
              disabled={isSavingFaq}
              className="w-full h-12 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
            >
              <Save className="w-4 h-4" />
              <span>{isSavingFaq ? "保存中..." : "保存する"}</span>
            </button>
            <button
              type="button"
              onClick={() => setFaqModalOpen(false)}
              className="w-full h-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white text-xs font-medium cursor-pointer min-h-[44px]"
            >
              キャンセル
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  );
}

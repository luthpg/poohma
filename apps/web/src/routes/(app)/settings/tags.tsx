import { api } from "@poohma/backend/api";
import type { Id } from "@poohma/backend/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Edit3,
  Layers,
  Loader2,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SubHeader } from "@/components/common/SubHeader";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";
import { usePersistentQuery } from "@/hooks/usePersistentQuery";

export const Route = createFileRoute("/(app)/settings/tags")({
  component: TagManagementPage,
});

interface TagStat {
  tag: string;
  totalRecordCount: number;
  manageableRecordCount: number;
  readonlyRecordCount: number;
}

interface PreviewResult {
  totalAffectedCount: number;
  manageableCount: number;
  readonlyCount: number;
  alreadyHasTargetCount: number;
  sampleRecords: Array<{
    id: Id<"serviceRecords">;
    title: string;
    canEdit: boolean;
  }>;
}

function TagManagementPage() {
  const { activeAccountId } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // モーダル管理
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSourceTags, setModalSourceTags] = useState<string[]>([]);

  // タグ統計一覧取得
  const tagStats =
    usePersistentQuery<TagStat[]>(api.records.getTagManagementList, {
      accountId: activeAccountId || undefined,
    }) || [];

  // 検索フィルター
  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tagStats;
    const q = searchQuery.trim().toLowerCase();
    return tagStats.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tagStats, searchQuery]);

  // 全選択・選択解除
  const isAllSelected =
    filteredTags.length > 0 &&
    filteredTags.every((t) => selectedTags.includes(t.tag));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTags([]);
    } else {
      setSelectedTags(filteredTags.map((t) => t.tag));
    }
  };

  const handleToggleSelectTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  // 単一タグの変更（リネーム）
  const handleOpenSingleRename = (tag: string) => {
    setModalSourceTags([tag]);
    setIsModalOpen(true);
  };

  // 選択タグの一括変更・統合
  const handleOpenBulkMerge = () => {
    if (selectedTags.length === 0) return;
    setModalSourceTags([...selectedTags]);
    setIsModalOpen(true);
  };

  // ページ遷移時に先頭スクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 sm:py-8 space-y-6 pb-24">
      {/* 共通スマート子ヘッダー */}
      <SubHeader
        className="sm:-mx-4 sm:px-4"
        backLabel="設定へ戻る"
        fallbackTo="/settings"
        rightElement={
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium cursor-pointer"
          >
            <Link to="/dashboard">ダッシュボードへ</Link>
          </Button>
        }
      >
        <span className="text-muted-foreground text-xs sm:text-sm">/</span>
        <span className="text-foreground font-medium text-xs sm:text-sm">
          タグ管理
        </span>
      </SubHeader>

      {/* ページタイトル & ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Tag className="h-5 w-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              タグ管理
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            登録されているタグの一覧です。表記揺れのあるタグの名称変更（リネーム）や、複数のタグを選んで1つにまとめる統合が行えます。
          </p>
        </div>
      </div>

      {/* 検索・フィルターバー */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="タグを検索..."
            className="w-full rounded-lg bg-card border border-border pl-9 pr-8 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-muted-foreground shrink-0">
          {filteredTags.length > 0 && (
            <label className="flex items-center gap-1.5 cursor-pointer sm:hidden select-none">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                aria-label="すべてのタグを選択"
                className="rounded border-border text-orange-500 focus:ring-orange-500"
              />
              <span>全選択</span>
            </label>
          )}
          <span>
            全 {tagStats.length} 件中 {filteredTags.length} 件
          </span>
        </div>
      </div>

      {/* タグ一覧コンテナ */}
      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        {filteredTags.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {tagStats.length === 0
              ? "登録されているタグはありません"
              : "一致するタグが見つかりません"}
          </div>
        ) : (
          <>
            {/* モバイルビュー: カード型リスト（横圧縮を完全防止） */}
            <div className="divide-y divide-border/60 sm:hidden">
              {filteredTags.map((item) => {
                const isSelected = selectedTags.includes(item.tag);
                return (
                  <div
                    key={item.tag}
                    className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? "bg-orange-500/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectTag(item.tag)}
                        aria-label={`${item.tag} を選択`}
                        className="h-4 w-4 rounded border-border text-orange-500 focus:ring-orange-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-medium border border-border/80 max-w-full">
                          <Tag className="h-3 w-3 opacity-60 shrink-0" />
                          <span className="truncate">{item.tag}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-1">
                          <span className="font-semibold text-foreground">
                            {item.totalRecordCount} 件
                          </span>
                          {item.readonlyRecordCount > 0 && (
                            <span className="opacity-80">
                              (可能: {item.manageableRecordCount} / 閲覧:{" "}
                              {item.readonlyRecordCount})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenSingleRename(item.tag)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-500/10 transition cursor-pointer shrink-0"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      <span>変更</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* デスクトップビュー: テーブル表示 */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="すべてのタグを選択"
                        className="rounded border-border text-orange-500 focus:ring-orange-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-4 font-medium">タグ名</th>
                    <th className="py-3 px-4 font-medium">使用件数</th>
                    <th className="py-3 px-4 font-medium text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredTags.map((item) => {
                    const isSelected = selectedTags.includes(item.tag);
                    return (
                      <tr
                        key={item.tag}
                        className={`transition-colors hover:bg-muted/30 ${
                          isSelected ? "bg-orange-500/5" : ""
                        }`}
                      >
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectTag(item.tag)}
                            aria-label={`${item.tag} を選択`}
                            className="rounded border-border text-orange-500 focus:ring-orange-500 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium border border-border/80 max-w-xs">
                            <Tag className="h-3 w-3 opacity-60 shrink-0" />
                            <span className="truncate">{item.tag}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span className="font-semibold text-foreground">
                            {item.totalRecordCount}
                          </span>
                          <span className="text-muted-foreground ml-1">件</span>
                          {item.readonlyRecordCount > 0 && (
                            <span className="text-[11px] text-muted-foreground ml-2">
                              (変更可能: {item.manageableRecordCount} /
                              閲覧専用: {item.readonlyRecordCount})
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenSingleRename(item.tag)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-orange-600 hover:text-orange-700 hover:bg-orange-500/10 transition cursor-pointer"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            変更
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 選択時の一括操作バー（モバイルでも横圧縮されない最適化レイアウト） */}
      {selectedTags.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-lg bg-card/95 border border-border shadow-xl backdrop-blur-md rounded-xl p-3 sm:px-5 sm:py-3 flex items-center justify-between gap-2.5 sm:gap-4 animate-in slide-in-from-bottom-4 duration-200">
          <div className="text-xs sm:text-sm font-semibold text-foreground shrink-0">
            <span className="text-orange-500 font-bold">
              {selectedTags.length}
            </span>{" "}
            件選択中
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenBulkMerge}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs sm:text-sm font-medium shadow-sm transition cursor-pointer"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>
                {selectedTags.length === 1 ? "タグを変更" : "選択タグを統合"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-2 py-1.5"
            >
              解除
            </button>
          </div>
        </div>
      )}

      {/* タグ変更・統合モーダル */}
      {isModalOpen && (
        <TagMergeModal
          sourceTags={modalSourceTags}
          allAvailableTags={tagStats.map((t) => t.tag)}
          onClose={() => {
            setIsModalOpen(false);
            setModalSourceTags([]);
          }}
          onSuccess={() => {
            setIsModalOpen(false);
            setModalSourceTags([]);
            setSelectedTags([]);
          }}
        />
      )}
    </div>
  );
}

// === タグ変更・統合 統一モーダル (N → 1) ===
function TagMergeModal({
  sourceTags: initialSourceTags,
  allAvailableTags,
  onClose,
  onSuccess,
}: {
  sourceTags: string[];
  allAvailableTags: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { activeAccountId } = useAccount();
  const [sourceTags, setSourceTags] = useState<string[]>(initialSourceTags);
  const [targetTag, setTargetTag] = useState<string>(
    (initialSourceTags.length === 1 ? initialSourceTags[0] : "") || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // プレビュー情報の取得
  const preview = usePersistentQuery<PreviewResult>(
    api.records.previewTagOperation,
    {
      accountId: activeAccountId || undefined,
      sourceTags,
      targetTag: targetTag.trim(),
    },
  );

  const mergeOrRenameMut = useMutation(api.records.mergeOrRenameTags);

  const isSingle = sourceTags.length === 1;

  // 変更元タグの除外
  const handleRemoveSourceTag = (tagToRemove: string) => {
    setSourceTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  // 実行ハンドラー
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTarget = targetTag.trim();
    if (!trimmedTarget) {
      toast.error("変更先のタグ名を入力してください");
      return;
    }
    if (trimmedTarget.length > 50) {
      toast.error("タグ名は50文字以内で入力してください");
      return;
    }
    if (sourceTags.length === 0) {
      toast.error("変更元のタグを1つ以上指定してください");
      return;
    }

    // 1→1 で名前が変わっていない場合
    if (isSingle && sourceTags[0] === trimmedTarget) {
      toast.info("変更前と同じタグ名です");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await mergeOrRenameMut({
        accountId: activeAccountId || undefined,
        sourceTags,
        targetTag: trimmedTarget,
      });

      toast.success(`${result.updatedCount} 件のレコードのタグを更新しました`);
      if (result.skippedCount > 0) {
        toast.info(
          `${result.skippedCount} 件のレコードは編集権限がないためスキップされました`,
        );
      }
      onSuccess();
    } catch (_err) {
      toast.error("タグの更新に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-4 sm:p-6 shadow-xl animate-in fade-in duration-200 my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <h3 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
            {isSingle ? (
              <>
                <Edit3 className="h-5 w-5 text-orange-500" />
                タグの名称変更
              </>
            ) : (
              <>
                <Layers className="h-5 w-5 text-orange-500" />
                タグの統合 ({sourceTags.length}件 → 1件)
              </>
            )}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground cursor-pointer p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 変更元タグ一覧 */}
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-1.5">
              変更元のタグ ({sourceTags.length})
            </span>
            {sourceTags.length === 0 ? (
              <p className="text-xs text-destructive">
                変更元のタグが選択されていません
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-lg bg-muted/30 border border-border">
                {sourceTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium border border-border max-w-full"
                  >
                    <span className="truncate">{tag}</span>
                    {sourceTags.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSourceTag(tag)}
                        className="text-muted-foreground hover:text-destructive cursor-pointer ml-0.5 shrink-0"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 矢印アイコン */}
          <div className="flex justify-center my-0.5 text-muted-foreground">
            <ArrowRight className="h-4 w-4 rotate-90 sm:rotate-0" />
          </div>

          {/* 変更先タグ指定 */}
          <div>
            <label
              htmlFor="target-tag-input"
              className="block text-xs font-medium text-muted-foreground mb-1.5"
            >
              変更先・統合先のタグ名
            </label>
            <input
              id="target-tag-input"
              type="text"
              value={targetTag}
              onChange={(e) => setTargetTag(e.target.value)}
              placeholder="新しいタグ名を入力..."
              maxLength={50}
              className="w-full rounded-lg bg-card border border-border px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
            {/* 既存タグからの候補 */}
            <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <span>既存タグから選ぶ:</span>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                {allAvailableTags
                  .filter((t) => !sourceTags.includes(t))
                  .slice(0, 8)
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTargetTag(t)}
                      className="px-2 py-0.5 rounded bg-muted hover:bg-muted/80 text-foreground text-[11px] cursor-pointer"
                    >
                      {t}
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* 影響プレビュー */}
          <div className="rounded-lg bg-muted/40 p-3 sm:p-3.5 border border-border/80 text-xs space-y-2">
            <div className="font-medium text-foreground flex items-center justify-between">
              <span>影響レコードの確認:</span>
              <span className="font-bold text-orange-500">
                {preview ? `${preview.totalAffectedCount} 件` : "計算中..."}
              </span>
            </div>

            {preview && (
              <div className="space-y-1.5 text-muted-foreground text-[11px]">
                <div className="flex justify-between">
                  <span>更新対象 (変更権限あり):</span>
                  <span className="font-medium text-foreground">
                    {preview.manageableCount} 件
                  </span>
                </div>
                {preview.readonlyCount > 0 && (
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <span>スキップ (変更権限なし):</span>
                    <span className="font-medium">
                      {preview.readonlyCount} 件
                    </span>
                  </div>
                )}
                {preview.alreadyHasTargetCount > 0 && (
                  <div className="flex justify-between">
                    <span>変更先のタグを既に所持 (重複排除):</span>
                    <span className="font-medium">
                      {preview.alreadyHasTargetCount} 件
                    </span>
                  </div>
                )}

                {preview.readonlyCount > 0 && (
                  <div className="flex items-start gap-1.5 pt-1.5 border-t border-border/60 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      編集権限のないレコード（他メンバーの作成した共有レコード等）は変更されず、既存のタグが維持されます。
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* モーダルフッターボタン */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition cursor-pointer text-center"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                sourceTags.length === 0 ||
                !targetTag.trim() ||
                (preview && preview.manageableCount === 0)
              }
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition cursor-pointer text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  更新中...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {isSingle ? "タグを変更する" : "タグを統合する"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

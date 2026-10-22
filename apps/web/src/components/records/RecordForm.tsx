import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MAX_CREDENTIALS_PER_RECORD } from "@poohma/shared/schemas";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Users,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { SessionExpiredDialog } from "@/components/auth/SessionExpiredDialog";
import { Spinner } from "@/components/ui/spinner";
import { TagInput } from "@/components/ui/tag-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  RecordFormCredential,
  UseRecordFormReturn,
} from "@/hooks/useRecordForm";
import { CredentialFieldsCard } from "./CredentialFieldsCard";

export interface RecordFormProps {
  form: UseRecordFormReturn;
  availableTags: string[];
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitIdleLabel: string;
  isAdmin?: boolean;
}

export function RecordForm({
  form,
  availableTags,
  onSubmit,
  onCancel,
  submitIdleLabel,
  isAdmin = true,
}: RecordFormProps) {
  const [showAdvancedTitle, setShowAdvancedTitle] = useState(false);
  const { values, isFieldModified } = form;
  const isEditMode = Boolean(form.targetRecordId);
  const isBusy =
    form.isSubmitting || form.isFetchingOgp || form.isFetchingFurigana;

  // SSR ハイドレーション一致保護のための固定一意 ID
  const dndId = useId();

  // クリック・フォーカス誤爆防止のため 5px 以上の移動でドラッグ開始判定
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = values.credentials.findIndex((c) => c.id === active.id);
    const newIndex = values.credentials.findIndex((c) => c.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      form.reorderCredentials(oldIndex, newIndex);
    }
  };

  const credentialsListRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  const handleAddCredential = () => {
    form.addCredential();
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
    }
    // DOM反映を待機したのち、追加された最後の枠へスムーズにスクロール
    scrollTimerRef.current = setTimeout(() => {
      const container = credentialsListRef.current;
      if (!container) return;
      const lastItem = container.lastElementChild as HTMLElement | null;
      if (lastItem) {
        lastItem.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      }
    }, 120);
  };

  const getModifiedClass = (field: string) => {
    if (!isEditMode) return "";
    const modified = isFieldModified(field);
    return `relative pl-3.5 before:pointer-events-none before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-orange-500 before:rounded-full before:transition-all before:duration-200 ${
      modified
        ? "before:opacity-100 before:scale-y-100"
        : "before:opacity-0 before:scale-y-50"
    }`;
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* フォーム全体の下書き自動保存ステータスバー */}
      <div
        className="flex items-center justify-between px-3.5 py-2 -mt-2 rounded-lg bg-card/60 border border-border/40 text-xs text-muted-foreground shadow-sm transition-all"
        data-testid="draft-save-status-indicator"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="font-medium text-muted-foreground/80">
          下書き自動保存
        </span>
        <div className="flex items-center gap-2">
          {form.draftSaveStatus === "saving" && (
            <span className="inline-flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-medium">
              <Spinner className="h-3 w-3 animate-spin" />
              保存中...
            </span>
          )}
          {form.draftSaveStatus === "saved" && (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <Check className="h-3.5 w-3.5" />
              保存済み
            </span>
          )}
          {form.draftSaveStatus === "paused" && (
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
              <Lock className="h-3.5 w-3.5" />
              一時停止中
              <button
                type="button"
                onClick={() => form.requireUnlock()}
                className="underline hover:text-foreground font-semibold ml-1 cursor-pointer"
              >
                自動保存開始
              </button>
            </span>
          )}
          {form.draftSaveStatus === "error" && (
            <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
              <AlertCircle className="h-3.5 w-3.5" />
              下書きの保存に失敗しました
            </span>
          )}
          {form.draftSaveStatus === "idle" && (
            <span className="text-muted-foreground/70">有効</span>
          )}
        </div>
      </div>

      {/* 基本情報セクション */}
      <section className="rounded-lg bg-card p-6 shadow-card transition-shadow">
        <div className="sticky top-16 z-10 -mx-6 -mt-6 mb-6 flex items-center justify-between rounded-t-lg border-b border-border/60 bg-card/95 px-6 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <h2 className="text-[16px] md:text-[18px] font-semibold text-foreground tracking-geist-ui">
            基本情報
          </h2>
        </div>
        <div className="space-y-4">
          <div className={getModifiedClass("url")}>
            <label
              htmlFor="url-input"
              className="block text-[14px] font-medium text-foreground"
            >
              URL
            </label>
            <div className="relative">
              <input
                id="url-input"
                type="url"
                value={values.url}
                onChange={(e) => form.setUrl(e.target.value)}
                onBlur={form.handleUrlBlur}
                placeholder="https://example.com"
                className="mt-1 w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
              {form.isFetchingOgp && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-muted-foreground text-xs mt-0.5">
                  <Spinner className="h-3 w-3" />
                  <span>情報取得中...</span>
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              入力後にフォーカスを外すと情報を自動取得します
            </p>
          </div>

          <div className={getModifiedClass("title")}>
            <label
              htmlFor="title-input"
              className="block text-[14px] font-medium text-foreground"
            >
              サービス名 <span className="text-red-500">*</span>
            </label>
            <input
              id="title-input"
              type="text"
              required
              value={values.title}
              onChange={(e) => form.updateTitle(e.target.value)}
              onBlur={form.handleTitleBlur}
              className="mt-1 w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            />
          </div>

          {/* 折りたたみ式：読み仮名（ふりがな）設定 */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedTitle(!showAdvancedTitle)}
              className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              {showAdvancedTitle ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>読み仮名（ルビ）の調整</span>
              {values.titleReading && !showAdvancedTitle && (
                <span className="ml-1 text-[11px] text-orange-500 font-normal">
                  ({values.titleReading})
                </span>
              )}
            </button>

            {showAdvancedTitle && (
              <div
                className={`mt-2 rounded-md bg-muted/40 p-3.5 border border-border/40 space-y-2 animate-in fade-in duration-200 ${getModifiedClass("titleReading")}`}
              >
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="title-reading-input"
                    className="block text-[12px] font-medium text-foreground"
                  >
                    読み仮名 (ひらがな)
                  </label>
                  <button
                    type="button"
                    onClick={() => form.fetchFuriganaForTitle(values.title)}
                    disabled={!values.title || form.isFetchingFurigana}
                    className="text-[11px] text-orange-500 hover:text-orange-600 disabled:opacity-50 transition cursor-pointer"
                  >
                    {form.isFetchingFurigana ? "取得中..." : "自動再取得"}
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="title-reading-input"
                    type="text"
                    value={values.titleReading}
                    onChange={(e) => form.updateTitleReading(e.target.value)}
                    placeholder="例: あまぞん / さんいんごうどうぎんこう"
                    className="w-full rounded-md bg-card p-2 text-base md:text-[13px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  {form.isFetchingFurigana && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  インデックス検索・あいうえお順ジャンプに使用されます。自動読み取りが異なる場合、手動で修正できます。
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* アカウント情報セクション */}
      <section className="rounded-lg bg-card p-6 shadow-card transition-shadow">
        <div className="sticky top-16 z-10 -mx-6 -mt-6 mb-6 flex items-center justify-between rounded-t-lg border-b border-border/60 bg-card/95 px-6 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <h2 className="text-[16px] md:text-[18px] font-semibold text-foreground tracking-geist-ui">
            アカウント情報
          </h2>
          <button
            type="button"
            onClick={handleAddCredential}
            disabled={values.credentials.length >= MAX_CREDENTIALS_PER_RECORD}
            className="inline-flex items-center min-h-[44px] px-2.5 py-1.5 text-[14px] font-medium text-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
          >
            + 追加する
          </button>
        </div>

        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={values.credentials.map((c, i) => c.id ?? `cred-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div ref={credentialsListRef} className="space-y-6">
              {values.credentials.map((cred, index) => (
                <SortableCredentialItem
                  key={cred.id ?? `cred-${index}`}
                  cred={cred}
                  index={index}
                  totalCount={values.credentials.length}
                  form={form}
                  isFieldModified={isFieldModified}
                  isEditMode={isEditMode}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      {/* 所有設定・タグ・メモ */}
      <section className="rounded-lg bg-card p-6 shadow-card transition-shadow space-y-6">
        <div className="sticky top-16 z-10 -mx-6 -mt-6 mb-6 flex items-center justify-between rounded-t-lg border-b border-border/60 bg-card/95 px-6 py-3.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <h2 className="text-[16px] md:text-[18px] font-semibold text-foreground tracking-geist-ui">
            その他の設定
          </h2>
        </div>
        <div className={getModifiedClass("ownerType")}>
          <span
            id="owner-type-label"
            className="block text-[14px] font-medium text-foreground mb-2"
          >
            所有設定
          </span>
          <ToggleGroup
            aria-labelledby="owner-type-label"
            type="single"
            value={values.ownerType}
            disabled={!isAdmin}
            onValueChange={(val) => {
              if (val === "user" || val === "family") {
                form.setOwnerType(val);
              }
            }}
            variant="outline"
            className="w-full justify-start gap-2"
          >
            <ToggleGroupItem
              value="user"
              disabled={!isAdmin}
              aria-label="自分のみ（個人用）"
              className="flex-1 py-2.5 px-2.5 sm:px-4 text-xs sm:text-sm font-medium border rounded-md data-[state=on]:bg-orange-500 data-[state=on]:text-white data-[state=on]:border-orange-500 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
            >
              <Lock className="h-4 w-4" />
              <span>自分のみ（個人用）</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="family"
              disabled={!isAdmin}
              aria-label="家族と共有"
              className="flex-1 py-2.5 px-2.5 sm:px-4 text-xs sm:text-sm font-medium border rounded-md data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
            >
              <Users className="h-4 w-4" />
              <span>家族と共有</span>
            </ToggleGroupItem>
          </ToggleGroup>
          {!isAdmin && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              ※ 共有設定の解除は管理者のみ可能です。
            </p>
          )}
        </div>

        <div className={getModifiedClass("tags")}>
          <label
            htmlFor="tags-input"
            className="block text-[14px] font-medium text-foreground mb-1"
          >
            タグ
          </label>
          <TagInput
            value={values.tags}
            onChange={form.setTags}
            availableTags={availableTags}
          />
        </div>

        <div className={getModifiedClass("memo")}>
          <label
            htmlFor="memo-input"
            className="block text-[14px] font-medium text-foreground mb-1"
          >
            メモ
          </label>
          <textarea
            id="memo-input"
            value={values.memo}
            onChange={(e) => form.setMemo(e.target.value)}
            rows={3}
            className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
        </div>
      </section>

      {/* 下部固定アクションバー */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border/80 bg-background/95 backdrop-blur-md px-4 py-2.5 sm:px-6 sm:py-3.5 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)] pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-9 sm:h-10 min-h-11 items-center justify-center rounded-md bg-card px-3 sm:px-5 text-xs sm:text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={isBusy}
            className="flex h-9 sm:h-10 min-h-11 min-w-20 sm:min-w-25 items-center justify-center rounded-md bg-orange-600 px-4 sm:px-6 text-xs sm:text-[14px] font-semibold text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 transition cursor-pointer"
          >
            {form.isSubmitting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                保存中...
              </>
            ) : form.isFetchingFurigana || form.isFetchingOgp ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                自動取得中...
              </>
            ) : (
              submitIdleLabel
            )}
          </button>
        </div>
      </div>

      {/* セッション切れ時の再認証・データ救済モーダル */}
      <SessionExpiredDialog
        open={form.isSessionExpired}
        onOpenChange={form.setIsSessionExpired}
        values={values}
      />
    </form>
  );
}

function SortableCredentialItem({
  cred,
  index,
  totalCount,
  form,
  isFieldModified,
  isEditMode,
}: {
  cred: RecordFormCredential;
  index: number;
  totalCount: number;
  form: UseRecordFormReturn;
  isFieldModified: (field: string) => boolean;
  isEditMode: boolean;
}) {
  const credentialId = cred.id ?? `cred-${index}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: credentialId });

  const style: React.CSSProperties = {
    // スケール歪みを防ぐため CSS.Translate を使用
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <CredentialFieldsCard
        index={index}
        credential={cred}
        removable={totalCount > 1}
        onChange={form.updateCredentialField}
        onRemove={form.removeCredential}
        isFieldModified={isFieldModified}
        isEditMode={isEditMode}
        dragHandleProps={
          totalCount > 1 ? { ...attributes, ...listeners } : undefined
        }
      />
    </div>
  );
}

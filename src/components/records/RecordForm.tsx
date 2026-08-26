import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { TagInput } from "@/components/ui/tag-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { UseRecordFormReturn } from "@/hooks/useRecordForm";
import { MAX_CREDENTIALS_PER_RECORD } from "@/utils/schemas";
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
  const { values } = form;
  const isBusy =
    form.isSubmitting || form.isFetchingOgp || form.isFetchingFurigana;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* URL・OGPセクション */}
      <section className="rounded-lg bg-card p-6 shadow-card transition-shadow">
        <div className="space-y-4">
          <div>
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

          <div>
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
              <div className="mt-2 rounded-md bg-muted/40 p-3.5 border border-border/40 space-y-2 animate-in fade-in duration-200">
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
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <h2 className="text-[18px] font-semibold text-foreground tracking-geist-ui">
            アカウント情報
          </h2>
          <button
            type="button"
            onClick={form.addCredential}
            disabled={values.credentials.length >= MAX_CREDENTIALS_PER_RECORD}
            className="text-[14px] font-medium text-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            + 追加する
          </button>
        </div>

        <div className="space-y-6">
          {values.credentials.map((cred, index) => (
            <CredentialFieldsCard
              key={cred.id ?? index}
              index={index}
              credential={cred}
              removable={values.credentials.length > 1}
              onChange={form.updateCredentialField}
              onRemove={form.removeCredential}
            />
          ))}
        </div>
      </section>

      {/* 所有設定・タグ・メモ */}
      <section className="rounded-lg bg-card p-6 shadow-card transition-shadow space-y-6">
        <div>
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
              className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-md data-[state=on]:bg-orange-500 data-[state=on]:text-white data-[state=on]:border-orange-500 transition-colors disabled:opacity-60"
            >
              自分のみ（個人用）
            </ToggleGroupItem>
            <ToggleGroupItem
              value="family"
              disabled={!isAdmin}
              aria-label="家族と共有"
              className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-md data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600 transition-colors disabled:opacity-60"
            >
              家族と共有
            </ToggleGroupItem>
          </ToggleGroup>
          {!isAdmin && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              ※ 共有設定の解除は管理者のみ可能です。
            </p>
          )}
        </div>

        <div>
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

        <div>
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

      <div className="flex justify-end gap-4 border-t border-border pt-6">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md bg-card px-6 py-2 text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={isBusy}
          className="flex items-center rounded-md bg-orange-500 px-6 py-2 text-[14px] font-medium text-white shadow-border hover:bg-orange-600 disabled:opacity-50 transition"
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
    </form>
  );
}

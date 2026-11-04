import {
  Download,
  FileSpreadsheet,
  Filter,
  KeyRound,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { JpText } from "@/components/JpText";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CsvExportOptions, useExportCsv } from "@/hooks/useExportCsv";

interface CsvExportSectionProps {
  initialFilters?: CsvExportOptions;
}

export function CsvExportSection({ initialFilters }: CsvExportSectionProps) {
  const { handleExport, isExporting } = useExportCsv();

  const [scope, setScope] = useState<"all" | "personal" | "shared">(
    initialFilters?.scope ?? "all",
  );
  const [archiveStatus, setArchiveStatus] = useState<
    "active" | "archived" | "all"
  >(initialFilters?.archiveStatus ?? "all");
  const [includeHints, setIncludeHints] = useState<boolean>(
    initialFilters?.includeHints ?? true,
  );
  const [tag, setTag] = useState<string>(initialFilters?.tag ?? "");
  const [q, setQ] = useState<string>(initialFilters?.q ?? "");
  const [showOptions, setShowOptions] = useState<boolean>(
    Boolean(
      initialFilters?.scope ||
        initialFilters?.archiveStatus ||
        initialFilters?.tag ||
        initialFilters?.q ||
        initialFilters?.includeHints === false,
    ),
  );

  const hasFilterActive =
    scope !== "all" ||
    archiveStatus !== "all" ||
    tag.trim() !== "" ||
    q.trim() !== "" ||
    !includeHints;

  const onDownload = () => {
    handleExport({
      scope,
      archiveStatus,
      includeHints,
      tag: tag.trim() || undefined,
      q: q.trim() || undefined,
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-orange-500 shrink-0" />
            <h3 className="text-base font-bold text-foreground">
              ファイルへの保存（エクスポート）
            </h3>
          </div>
          <JpText
            as="p"
            className="text-xs sm:text-sm text-muted-foreground leading-relaxed"
          >
            登録されているサービス名やログインIDなどの情報を、CSVファイルとして手元に保存できます。
            出力されたファイルには管理用の識別コード（RecordId,
            CredentialId）が含まれており、手元で編集して取り込むことで登録内容を一括更新できます。
          </JpText>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowOptions(!showOptions)}
            className="text-xs h-9 gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            <span>出力条件のカスタマイズ</span>
            {hasFilterActive && (
              <span className="h-2 w-2 rounded-full bg-orange-500" />
            )}
          </Button>

          <Button
            type="button"
            onClick={onDownload}
            disabled={isExporting}
            className="bg-foreground text-background hover:bg-foreground/90 font-semibold text-xs px-5 h-9 shrink-0 gap-2 cursor-pointer shadow"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                CSVをダウンロード
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 出力条件カスタマイズエリア */}
      {showOptions && (
        <div className="rounded-xl border border-border/80 bg-muted/40 p-4 space-y-4 transition-all">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-orange-500" />
            <span>出力条件の絞り込み</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 所有種別（スコープ） */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">対象範囲</Label>
              <select
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "all" | "personal" | "shared")
                }
                className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground shadow-xs focus:ring-1 focus:ring-orange-500"
              >
                <option value="all">すべて（自分のみ＋共有）</option>
                <option value="personal">自分のみ（個人用）</option>
                <option value="shared">家族共有</option>
              </select>
            </div>

            {/* アーカイブステータス */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                ステータス
              </Label>
              <select
                value={archiveStatus}
                onChange={(e) =>
                  setArchiveStatus(
                    e.target.value as "active" | "archived" | "all",
                  )
                }
                className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground shadow-xs focus:ring-1 focus:ring-orange-500"
              >
                <option value="all">すべて（利用中＋アーカイブ）</option>
                <option value="active">利用中のみ</option>
                <option value="archived">アーカイブのみ</option>
              </select>
            </div>

            {/* タグ */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                タグで絞り込み
              </Label>
              <div className="relative">
                <Input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="タグ名を入力..."
                  className="h-8 text-xs bg-background pr-6"
                />
                {tag && (
                  <button
                    type="button"
                    onClick={() => setTag("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* キーワード */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                キーワード検索
              </Label>
              <div className="relative">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="サービス名、URL、ID等..."
                  className="h-8 text-xs bg-background pr-6"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ヒント列除外オプション */}
          <div className="pt-2 border-t border-border/60 flex items-start gap-2.5">
            <Checkbox
              id="include-hints-checkbox"
              checked={includeHints}
              onCheckedChange={(checked) => setIncludeHints(checked === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <label
                htmlFor="include-hints-checkbox"
                className="text-xs font-semibold text-foreground cursor-pointer flex items-center gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                パスワードのヒント列（PasswordHint）を含めて出力する
              </label>
              <p className="text-[11px] text-muted-foreground">
                {includeHints ? (
                  <span>
                    チェックを外すと、パスコード解除不要でサービス名・URL・ログインID等のメタデータのみを即座に出力できます。
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    ※
                    パスワードヒント列を除外して出力します（パスコードロック解除なしで即座にダウンロードできます）。
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground space-y-1 border border-border/50">
        <p className="font-semibold text-foreground">
          ※ ご利用にあたっての確認事項
        </p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>
            <JpText>
              「パスワードのヒント」を出力に含める場合は、家族パスコードによるロック解除が必要となります。
            </JpText>
          </li>
          <li>
            <JpText>
              RecordId 列や CredentialId
              列の番号をそのまま残して編集することで、登録済みのサービス名やメモなどの内容をスムーズに更新できます。
            </JpText>
          </li>
        </ul>
      </div>
    </div>
  );
}

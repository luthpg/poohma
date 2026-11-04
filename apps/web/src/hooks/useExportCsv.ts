import { api } from "@poohma/backend/api";
import { MAX_CREDENTIALS_PER_RECORD } from "@poohma/shared/schemas";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { usePasscode } from "@/components/PasscodeProvider";
import { useAccount } from "@/hooks/useAccount";
import { getClientRequestContext } from "@/services/security.functions";
import { sanitizeCsvValue } from "@/utils/csv-sanitize";

export interface CsvExportOptions {
  scope?: "all" | "personal" | "shared";
  archiveStatus?: "active" | "archived" | "all";
  includeHints?: boolean;
  tag?: string;
  q?: string;
}

export function useExportCsv() {
  const [isExporting, setIsExporting] = useState(false);
  const { masterKey, requireUnlock, decryptHint } = usePasscode();
  const { activeAccountId } = useAccount();
  const fetchRecordsForExport = useMutation(api.records.fetchRecordsForExport);

  const handleExport = async (
    optionsOrEvent?: CsvExportOptions | React.MouseEvent,
  ) => {
    setIsExporting(true);
    const options: CsvExportOptions =
      optionsOrEvent && !("nativeEvent" in optionsOrEvent)
        ? optionsOrEvent
        : {};
    const includeHints = options.includeHints !== false;

    try {
      const context = await getClientRequestContext().catch(() => ({}));
      const records = await fetchRecordsForExport({
        accountId: activeAccountId || undefined,
        scope: options.scope,
        archiveStatus: options.archiveStatus,
        includeHints,
        tag: options.tag,
        q: options.q,
        ...context,
      });

      // Convex レコードを CSV 行フォーマットに変換
      const data: Record<string, string>[] = records.map((record) => {
        const row: Record<string, string> = {
          RecordId: record.stableId || "",
          Title: record.title,
          URL: record.url || "",
          Memo: record.memo || "",
          OwnerType: record.ownerType ?? "user",
          Admins: (record.adminEmails ?? []).join(", "),
          Tags: record.tags.join(","),
          IsArchived: record.isArchived ? "TRUE" : "FALSE",
        };
        record.credentials.forEach((cred, i) => {
          const idx = i + 1;
          row[`CredentialId${idx}`] = cred.stableId || "";
          row[`Label${idx}`] = cred.label || "";
          row[`LoginID${idx}`] = cred.loginId || "";
          if (includeHints) {
            row[`PasswordHint${idx}`] = cred.passwordHint || "";
            row[`PasswordHintIv${idx}`] = cred.passwordHintIv || "";
            row[`PasswordHintDekEncrypted${idx}`] =
              cred.passwordHintDekEncrypted || "";
            row[`PasswordHintDekIv${idx}`] = cred.passwordHintDekIv || "";
          }
        });
        return row;
      });

      // Check if there are any encrypted hints to decrypt
      let hasEncryptedHints = false;
      if (includeHints) {
        for (const row of data) {
          for (let i = 1; i <= MAX_CREDENTIALS_PER_RECORD; i++) {
            if (row[`PasswordHint${i}`] && row[`PasswordHintIv${i}`]) {
              hasEncryptedHints = true;
              break;
            }
          }
          if (hasEncryptedHints) break;
        }

        if (hasEncryptedHints && !masterKey) {
          const unlocked = await requireUnlock();
          if (!unlocked) {
            setIsExporting(false);
            return;
          }
        }
      }

      // Decrypt hints for export (only when includeHints is true)
      let totalDecryptionErrors = 0;
      const processedData = await Promise.all(
        data.map(async (row) => {
          const newRow = { ...row };

          if (includeHints) {
            for (let i = 1; i <= MAX_CREDENTIALS_PER_RECORD; i++) {
              const hint = row[`PasswordHint${i}`];
              const iv = row[`PasswordHintIv${i}`];
              const dekEncrypted = row[`PasswordHintDekEncrypted${i}`];
              const dekIv = row[`PasswordHintDekIv${i}`];
              if (hint && iv) {
                try {
                  const plainHint = await decryptHint(
                    hint,
                    iv,
                    dekEncrypted || undefined,
                    dekIv || undefined,
                  );
                  // 復号後の平文ヒントにCSVサニタイズを適用
                  newRow[`PasswordHint${i}`] = sanitizeCsvValue(plainHint);
                } catch (_e) {
                  newRow[`PasswordHint${i}`] = "";
                  totalDecryptionErrors += 1;
                }
              } else {
                newRow[`PasswordHint${i}`] = "";
                if (hint && !iv) {
                  totalDecryptionErrors += 1;
                }
              }
              // Remove IV and DEK fields from export
              delete newRow[`PasswordHintIv${i}`];
              delete newRow[`PasswordHintDekEncrypted${i}`];
              delete newRow[`PasswordHintDekIv${i}`];
            }
          }

          // 非暗号化フィールドにサニタイズを適用
          for (const key of Object.keys(newRow)) {
            if (!key.startsWith("PasswordHint")) {
              newRow[key] = sanitizeCsvValue(newRow[key]);
            }
          }

          return newRow;
        }),
      );

      const columns = [
        "RecordId",
        "Title",
        "URL",
        "Memo",
        "OwnerType",
        "Admins",
        "Tags",
        "IsArchived",
      ];
      for (let i = 1; i <= MAX_CREDENTIALS_PER_RECORD; i++) {
        columns.push(`CredentialId${i}`, `Label${i}`, `LoginID${i}`);
        if (includeHints) {
          columns.push(`PasswordHint${i}`);
        }
      }

      const Papa = (await import("papaparse")).default;
      const csv = Papa.unparse(processedData, { columns });
      // Excelの文字化け対策としてBOM (UTF-8) を付与
      const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
      const blob = new Blob([bom, csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const prefix = includeHints ? "poohma_export" : "poohma_export_nohints";
      link.setAttribute(
        "download",
        `${prefix}_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (totalDecryptionErrors > 0) {
        toast.warning(
          "一部のアカウント情報の復号に失敗したため、該当のヒントは空欄で出力されました",
        );
      } else {
        toast.success(
          includeHints
            ? "データをエクスポートしました"
            : "ヒントを除外してデータをエクスポートしました",
        );
      }
    } catch (_error) {
      toast.error("エクスポートに失敗しました");
    } finally {
      setIsExporting(false);
    }
  };

  return { handleExport, isExporting };
}

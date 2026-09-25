import { useQuery } from "convex/react";
import { History } from "lucide-react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import {
  AUDIT_ACTION_CONFIG,
  DEFAULT_ACTION_CONFIG,
  formatFieldName,
} from "@/utils/audit-log-formatter";

/** レコードの変更履歴を折りたたみ可能な一覧で表示する。 */
export function RecordAuditHistoryAccordion({
  recordId,
}: {
  recordId: Id<"serviceRecords">;
}) {
  const { activeAccountId } = useAccount();
  const auditLogs = useQuery(api.records.getRecordAuditLogs, {
    recordId,
    accountId: activeAccountId || undefined,
    limit: 30,
  });

  /** 監査イベントの日時を秒単位の日本語表記に整形する。 */
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="mb-10">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="audit-logs"
          className="rounded-lg bg-card shadow-border px-4 py-1"
        >
          <AccordionTrigger className="hover:no-underline py-3">
            <div className="flex items-center gap-2 text-[14px] font-semibold text-foreground tracking-wide uppercase">
              <History className="h-4 w-4 text-orange-500" />
              <span>変更履歴</span>
              {auditLogs !== undefined && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  (
                  {auditLogs.length === 30
                    ? "30件以上"
                    : `${auditLogs.length}件`}
                  )
                </span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-2 pb-4">
            {auditLogs === undefined ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                <Spinner className="h-4 w-4" />
                <span>変更履歴を読み込み中...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                記録された変更履歴はありません。
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {auditLogs.map((log) => {
                  const config =
                    AUDIT_ACTION_CONFIG[log.action] || DEFAULT_ACTION_CONFIG;
                  const Icon = config.icon;

                  return (
                    <div
                      key={log._id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2.5 rounded-md bg-muted/40 border border-border/40 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${config.colorClass}`}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span>{config.label}</span>
                        </span>
                        <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[180px]">
                          {log.actorDisplayName}
                        </span>
                        {log.metadata?.changedFields &&
                          log.metadata.changedFields.length > 0 && (
                            <span className="text-[11px] text-muted-foreground w-full sm:w-auto whitespace-pre-wrap break-words block sm:inline">
                              (変更項目:{" "}
                              {log.metadata.changedFields
                                .map(formatFieldName)
                                .join(", ")}
                              )
                            </span>
                          )}
                        {log.metadata?.detail && (
                          <span className="text-[11px] text-muted-foreground w-full sm:w-auto whitespace-pre-wrap break-words block sm:inline">
                            ({log.metadata.detail})
                          </span>
                        )}
                      </div>
                      <time className="text-[11px] text-muted-foreground shrink-0 font-mono self-end sm:self-auto">
                        {formatDate(log.createdAt)}
                      </time>
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

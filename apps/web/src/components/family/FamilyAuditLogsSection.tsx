import { usePaginatedQuery } from "convex/react";
import { History } from "lucide-react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  AUDIT_ACTION_CONFIG,
  DEFAULT_ACTION_CONFIG,
  formatFieldName,
} from "@/utils/audit-log-formatter";

export function FamilyAuditLogSection({
  activeAccountId,
}: {
  activeAccountId?: Id<"users"> | null;
}) {
  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.records.getFamilyAuditLogs,
    { accountId: activeAccountId || undefined },
    { initialNumItems: 15 },
  );

  /** 監査イベントの日時を日本語ロケールで表示できる形式にする。 */
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Accordion
      type="single"
      collapsible
      className="mt-8 border-t border-border pt-6"
    >
      <AccordionItem value="audit-log" className="border-none">
        <AccordionTrigger
          className="py-0 mb-1 hover:no-underline"
          aria-label="家族のアクティビティログを展開または折りたたむ"
        >
          <div className="flex items-center justify-between flex-1">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-orange-500" />
              <h3 className="text-[14px] font-medium text-foreground">
                家族のアクティビティログ
              </h3>
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block mr-2">
              直近の変更証跡
            </span>
          </div>
        </AccordionTrigger>
        <p className="text-[12px] text-muted-foreground mb-3">
          家族共有レコードに対する登録・更新・共有設定変更・削除などの変更履歴を確認できます。
        </p>
        <AccordionContent className="pb-0">
          {status === "LoadingFirstPage" ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground text-xs">
              <Spinner className="h-5 w-5" />
              <span>アクティビティを読み込み中...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
              アクティビティログはまだありません。
            </div>
          ) : (
            <div className="space-y-2">
              <Accordion type="multiple" className="w-full space-y-2">
                {results.map((log) => {
                  const config =
                    AUDIT_ACTION_CONFIG[log.action] || DEFAULT_ACTION_CONFIG;
                  const Icon = config.icon;
                  const hasMetadata =
                    log.metadata?.changedFields?.length || log.metadata?.detail;

                  return (
                    <AccordionItem
                      key={log._id}
                      value={log._id}
                      className="rounded-lg border border-border/50 bg-card px-3.5 shadow-xs"
                    >
                      {hasMetadata ? (
                        <AccordionTrigger
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 gap-1.5 sm:gap-2 hover:no-underline"
                          aria-label="個別ログの詳細を展開または折りたたむ"
                        >
                          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${config.badgeClass}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{config.label}</span>
                            </span>
                            <div className="min-w-0 text-left">
                              <span className="font-semibold text-foreground text-xs mr-1 sm:mr-2">
                                {log.actorDisplayName}:
                              </span>
                              <span className="text-xs text-muted-foreground break-all sm:break-normal">
                                {log.metadata?.targetTitle
                                  ? `${log.metadata.targetTitle}`
                                  : "対象レコード"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                            <time className="text-[11px] text-muted-foreground font-mono">
                              {formatDate(log.createdAt)}
                            </time>
                          </div>
                        </AccordionTrigger>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-2.5 gap-1.5 sm:gap-2">
                          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border shrink-0 ${config.badgeClass}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span>{config.label}</span>
                            </span>
                            <div className="min-w-0 text-left">
                              <span className="font-semibold text-foreground text-xs mr-1 sm:mr-2">
                                {log.actorDisplayName}:
                              </span>
                              <span className="text-xs text-muted-foreground break-all sm:break-normal">
                                {log.metadata?.targetTitle
                                  ? `${log.metadata.targetTitle}`
                                  : "対象レコード"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center shrink-0 pl-7 sm:pl-0">
                            <time className="text-[11px] text-muted-foreground font-mono">
                              {formatDate(log.createdAt)}
                            </time>
                          </div>
                        </div>
                      )}

                      {hasMetadata ? (
                        <AccordionContent className="pt-2 pb-3 text-xs text-muted-foreground border-t border-border/40">
                          <div className="space-y-1 bg-muted/30 p-2.5 rounded-md">
                            {log.metadata?.changedFields &&
                              log.metadata.changedFields.length > 0 && (
                                <div>
                                  <span className="font-medium text-foreground mr-1.5">
                                    変更項目:
                                  </span>
                                  <span>
                                    {log.metadata.changedFields
                                      .map(formatFieldName)
                                      .join(", ")}
                                  </span>
                                </div>
                              )}
                            {log.metadata?.detail && (
                              <div>
                                <span className="font-medium text-foreground mr-1.5">
                                  詳細:
                                </span>
                                <span>{log.metadata.detail}</span>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      ) : null}
                    </AccordionItem>
                  );
                })}
              </Accordion>

              {/* ページネーション（もっと読み込むボタン） */}
              {status === "CanLoadMore" && (
                <div className="pt-3 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadMore(15)}
                    disabled={isLoading}
                    className="text-xs"
                  >
                    {isLoading ? (
                      <>
                        <Spinner className="h-3 w-3 mr-1.5" />
                        読み込み中...
                      </>
                    ) : (
                      "過去のアクティビティをさらに読み込む"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export { FamilyAuditLogSection as FamilyAuditLogsSection };

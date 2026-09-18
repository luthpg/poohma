import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export interface LogViewParams {
  actor: Doc<"users">;
  recordId: Id<"serviceRecords">;
  familyId?: Id<"families">;
}

/**
 * 閲覧イベントを、操作時点の実行者情報とともに記録する。
 * 監査ログ（変更系）とは分離された通常利用履歴として保持する。
 */
export async function logViewEvent(
  ctx: MutationCtx,
  params: LogViewParams,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("viewLogs", {
    familyId: params.familyId,
    accountId: params.actor._id,
    userId: params.actor.userId,
    actorDisplayName:
      params.actor.displayName || params.actor.email || "メンバー",
    recordId: params.recordId,
    createdAt: now,
  });
}

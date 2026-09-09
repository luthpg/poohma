import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export interface LogAuditParams {
  actor: Doc<"users">;
  record?: Doc<"serviceRecords"> | null;
  recordId?: Id<"serviceRecords">;
  ownerType: "user" | "family";
  ownerFamilyId?: Id<"families">;
  targetAccountId?: Id<"users">;
  action:
    | "RECORD_CREATE"
    | "RECORD_UPDATE"
    | "RECORD_DELETE"
    | "HINT_VIEW"
    | "SHARE_SETTING_CHANGED"
    | "ADMIN_CHANGED";
  metadata?: {
    targetTitle?: string;
    changedFields?: string[];
    detail?: string;
  };
}

/**
 * 監査イベントを、操作時点の実行者情報と対象レコード情報とともに記録する。
 */
export async function logAuditEvent(
  ctx: MutationCtx,
  params: LogAuditParams,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("auditLogs", {
    familyId:
      params.ownerType === "family"
        ? (params.ownerFamilyId ?? params.actor.familyId)
        : undefined,
    accountId: params.actor._id,
    userId: params.actor.userId,
    actorDisplayName:
      params.actor.displayName || params.actor.email || "メンバー",
    recordId: params.recordId ?? params.record?._id,
    ownerType: params.ownerType,
    ownerFamilyId: params.ownerFamilyId,
    targetAccountId: params.targetAccountId,
    action: params.action,
    metadata: params.metadata,
    createdAt: now,
  });
}

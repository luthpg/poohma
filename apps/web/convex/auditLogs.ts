import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { familyBoundQuery } from "./customBuilders";

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
    | "RECORD_ARCHIVE"
    | "RECORD_UNARCHIVE"
    | "CREDENTIAL_CREATE"
    | "CREDENTIAL_UPDATE"
    | "CREDENTIAL_DELETE"
    | "SHARE_SETTING_CHANGED"
    | "ADMIN_CHANGED"
    | "FAMILY_UPDATE"
    | "MEMBER_JOIN"
    | "MEMBER_REMOVE"
    | "MEMBER_LEAVE"
    | "MEMBER_ROLE_CHANGED"
    | "INVITE_CREATE"
    | "INVITE_REVOKE"
    | "JOIN_REQUEST_REJECTED"
    | "FAMILY_MIGRATION"
    | "PASSCODE_ROTATED"
    | "RECOVERY_KIT_REGISTERED"
    | "RECOVERY_REDEEMED"
    | "ACCOUNT_DELETE";
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
      params.ownerFamilyId ??
      (params.ownerType === "family" ? params.actor.familyId : undefined),
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

/**
 * 家族アクティビティログを CSV エクスポート用に一括取得するクエリ。
 * year が指定された場合、その年（JST: 1月1日 00:00:00 〜 12月31日 23:59:59.999）の範囲に絞り込む。
 * 未指定の場合は全期間を降順で取得する。
 */
export const exportFamilyAuditLogs = familyBoundQuery({
  args: {
    year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { familyId } = ctx;

    const query = ctx.db
      .query("auditLogs")
      .withIndex("by_family_createdAt", (q) => {
        if (args.year != null) {
          const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
          const startOfYear =
            new Date(Date.UTC(args.year, 0, 1, 0, 0, 0, 0)).getTime() -
            JST_OFFSET_MS;
          const endOfYear =
            new Date(Date.UTC(args.year, 11, 31, 23, 59, 59, 999)).getTime() -
            JST_OFFSET_MS;
          return q
            .eq("familyId", familyId)
            .gte("createdAt", startOfYear)
            .lte("createdAt", endOfYear);
        }
        return q.eq("familyId", familyId);
      });

    const logs = await query.order("desc").collect();

    return logs.map((log) => ({
      id: log._id,
      action: log.action,
      actorDisplayName: log.actorDisplayName,
      targetTitle: log.metadata?.targetTitle ?? "",
      changedFields: log.metadata?.changedFields?.join("; ") ?? "",
      detail: log.metadata?.detail ?? "",
      createdAt: log.createdAt,
    }));
  },
});

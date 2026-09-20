import { v } from "convex/values";
import { computeSortKey } from "../src/utils/index-group";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { logAuditEvent } from "./auditLogs";
import demoRecords from "./demoRecords.json";
import { deleteCredentialsForRecord } from "./records";

interface DemoCredential {
  label?: string;
  loginId?: string;
  passwordHint?: string;
  passwordHintIv?: string;
  passwordHintDekEncrypted?: string;
  passwordHintDekIv?: string;
}

interface DemoRecord {
  title: string;
  titleReading?: string;
  url?: string;
  ogpImage?: string;
  ogpDescription?: string;
  memo?: string;
  tags: string[];
  credentials: DemoCredential[];
}

const recordsToInsert: DemoRecord[] = demoRecords;

const COOLDOWN_MS = 10 * 60 * 1000; // 10分間のクールダウン
const JOIN_REQUEST_EXPIRY_MS = 48 * 60 * 60 * 1000; // pending 参加申請の保護期間（48時間）
const FAR_FUTURE_MS = 4102415999000; // 2099-12-31 23:59:59 UTC

/**
 * デモファミリーの定期・手動リセット internal mutation
 *
 * コア設計原則: リセット境界を跨いだゲストコホート間で互いの痕跡を一切閲覧できないこと。
 *
 * - ゲスト個人レコードおよび共有レコードの完全削除
 * - 管理者以外のメンバーを kick
 * - approved/rejected の joinRequests を全削除、pending は48時間猶予で保護
 * - auditLogs / viewLogs のファミリー単位パージ（コホート間漏洩防止）
 * - デモ固定コード以外の familyInvites を削除
 * - デモファミリー関連の familyMigrations を削除
 * - demoRecords.json からデモレコードを再投入
 * - 無期限招待コードの維持
 */
export const resetDemoFamilyInternal = internalMutation({
  args: {
    triggeredBy: v.optional(v.string()),
    reason: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // 1. 環境変数の取得と厳格照合（フェイルセーフ）
    const demoFamilyIdStr = process.env.DEMO_FAMILY_ID;
    const adminUserIdsRaw =
      process.env.DEMO_ADMIN_USER_IDS || process.env.DEMO_ADMIN_USER_ID;
    const demoInviteCode = process.env.DEMO_INVITE_CODE || "poohma-demo";

    if (!demoFamilyIdStr || !adminUserIdsRaw) {
      throw new Error(
        "DEMO_FAMILY_ID or DEMO_ADMIN_USER_IDS is not configured in environment variables.",
      );
    }

    const demoFamilyId = demoFamilyIdStr as Id<"families">;
    const adminUserIds = adminUserIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    // デモファミリーの実在確認
    const demoFamily = await ctx.db.get(demoFamilyId);
    if (!demoFamily) {
      throw new Error(`Demo family not found for ID: ${demoFamilyIdStr}`);
    }

    // デモファミリー所属の全メンバーを取得
    const familyMembers = await ctx.db
      .query("users")
      .withIndex("by_familyId", (q) => q.eq("familyId", demoFamilyId))
      .collect();

    // 指定された全管理者がデモファミリーに実在し、かつ familyRole === 'admin' であることを厳格に個別照合
    for (const adminId of adminUserIds) {
      const member = familyMembers.find(
        (m) => m.userId === adminId || m._id === adminId,
      );
      if (!member) {
        throw new Error(
          `Configured demo admin ID "${adminId}" is not a member of demo family.`,
        );
      }
      if (member.familyRole !== "admin") {
        throw new Error(
          `Configured demo admin ID "${adminId}" does not have familyRole "admin".`,
        );
      }
    }

    const adminMembers = familyMembers.filter(
      (m) => adminUserIds.includes(m.userId) || adminUserIds.includes(m._id),
    );
    if (adminMembers.length === 0) {
      throw new Error(
        "No matching admin users found in the specified demo family matching DEMO_ADMIN_USER_IDS.",
      );
    }
    const primaryAdmin = adminMembers[0];

    // 2. クールダウンガード（10分以内の多重実行を防止）
    const now = Date.now();
    if (!args.force) {
      const cooldownThreshold = now - COOLDOWN_MS;
      // 過去10分間の監査ログを取得し、リセット実行ログが存在するか検証
      const recentAudits = await ctx.db
        .query("auditLogs")
        .withIndex("by_family_createdAt", (q) =>
          q.eq("familyId", demoFamilyId).gte("createdAt", cooldownThreshold),
        )
        .order("desc")
        .collect();

      const recentResetAudit = recentAudits.find(
        (audit) =>
          audit.action === "FAMILY_UPDATE" &&
          audit.metadata?.detail?.includes("デモファミリー定期リセット"),
      );

      if (recentResetAudit) {
        return {
          success: true,
          skipped: true,
          message: "Cooldown active (less than 10 minutes since last reset).",
          familyId: demoFamilyId,
          lastResetAt: recentResetAudit.createdAt,
        };
      }
    }

    // 3. ステップ 1: キック対象ゲストの特定
    const guestUsers = familyMembers.filter(
      (m) => !adminUserIds.includes(m.userId) && !adminUserIds.includes(m._id),
    );

    // 4. ステップ 2: レコードの完全消去（ゲスト個人レコード＋共有レコード）
    // 4-1. 家族共有レコードを取得
    const familyRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_family_updatedAt", (q) => q.eq("familyId", demoFamilyId))
      .collect();

    // 4-2. ゲストユーザーが作成した個人レコードを取得（デモファミリーに属する個人レコードのみを厳格に対象とし、他家族のレコードを巻き込まない）
    const guestAccountIds = new Set(guestUsers.map((g) => g._id));
    const guestRecords = [];
    for (const guestAccountId of guestAccountIds) {
      const records = await ctx.db
        .query("serviceRecords")
        .withIndex("by_accountId", (q) => q.eq("accountId", guestAccountId))
        .collect();
      const demoPersonalRecords = records.filter(
        (r) =>
          r.familyId === demoFamilyId &&
          (r.ownerType === "user" || !r.ownerType),
      );
      guestRecords.push(...demoPersonalRecords);
    }

    // レコードの重複排除
    const recordMap = new Map<
      Id<"serviceRecords">,
      (typeof familyRecords)[0]
    >();
    for (const r of familyRecords) {
      recordMap.set(r._id, r);
    }
    for (const r of guestRecords) {
      recordMap.set(r._id, r);
    }
    const allRecordsToDelete = Array.from(recordMap.values());

    // レコードおよび関連データの完全削除
    let deletedRecordsCount = 0;
    for (const record of allRecordsToDelete) {
      await deleteCredentialsForRecord(ctx, record._id);

      // 編集中セッション削除
      const sessions = await ctx.db
        .query("recordEditingSessions")
        .withIndex("by_recordId", (q) => q.eq("recordId", record._id))
        .collect();
      for (const s of sessions) {
        await ctx.db.delete(s._id);
      }

      // 閲覧ログ削除
      const viewLogs = await ctx.db
        .query("viewLogs")
        .withIndex("by_recordId_createdAt", (q) => q.eq("recordId", record._id))
        .collect();
      for (const vl of viewLogs) {
        await ctx.db.delete(vl._id);
      }

      await ctx.db.delete(record._id);
      deletedRecordsCount++;
    }

    // 4.5 デモファミリーの viewLogs をファミリー単位で一括パージ（コホート間漏洩防止）
    const remainingViewLogs = await ctx.db
      .query("viewLogs")
      .withIndex("by_family_createdAt", (q) => q.eq("familyId", demoFamilyId))
      .collect();
    let deletedViewLogsCount = 0;
    for (const vl of remainingViewLogs) {
      await ctx.db.delete(vl._id);
      deletedViewLogsCount++;
    }

    // ゲストの pendingExportVaults があれば削除（デモファミリー由来の vault のみ削除）
    for (const guest of guestUsers) {
      const vaults = await ctx.db
        .query("pendingExportVaults")
        .withIndex("by_accountId", (q) => q.eq("accountId", guest._id))
        .collect();
      for (const v of vaults) {
        if (v.oldFamilyId === demoFamilyId) {
          await ctx.db.delete(v._id);
        }
      }
    }

    // 4.6 デモファミリー関連の familyMigrations を削除
    let deletedMigrationsCount = 0;
    for (const guest of guestUsers) {
      const migrations = await ctx.db
        .query("familyMigrations")
        .withIndex("by_accountId", (q) => q.eq("accountId", guest._id))
        .collect();
      for (const mig of migrations) {
        if (
          mig.sourceFamilyId === demoFamilyId ||
          mig.targetFamilyId === demoFamilyId
        ) {
          await ctx.db.delete(mig._id);
          deletedMigrationsCount++;
        }
      }
    }

    // 5. ステップ 3: ゲストユーザーのキック（所属解除）
    // ※ メール通知は一切送らない（スパム防止）
    let kickedGuestsCount = 0;
    for (const guest of guestUsers) {
      await ctx.db.patch(guest._id, { familyId: undefined });
      kickedGuestsCount++;
    }

    // 6. ステップ 4: 参加申請のクリーンアップ
    //    - approved / rejected: 判定済みなので無条件で全削除
    //    - pending: 直近の申請者保護のため、48時間経過分のみ削除
    const joinRequests = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_status", (q) => q.eq("familyId", demoFamilyId))
      .collect();

    const joinRequestCutoff = now - JOIN_REQUEST_EXPIRY_MS;
    let deletedJoinRequestsCount = 0;
    for (const req of joinRequests) {
      if (req.status !== "pending" || req.createdAt < joinRequestCutoff) {
        await ctx.db.delete(req._id);
        deletedJoinRequestsCount++;
      }
    }

    // 6.5 デモファミリーの監査ログを全パージ（コホート間漏洩防止）
    // ※ クールダウンガード判定は本ステップ到達前（ステップ 2）で完了済みのため影響なし
    const auditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_family_createdAt", (q) => q.eq("familyId", demoFamilyId))
      .collect();
    let deletedAuditLogsCount = 0;
    for (const audit of auditLogs) {
      await ctx.db.delete(audit._id);
      deletedAuditLogsCount++;
    }

    // 7. ステップ 5: 暗号化済みデモレコードの再投入
    let insertedRecordsCount = 0;
    for (const recordData of recordsToInsert) {
      const sortKey = computeSortKey({
        titleReading: recordData.titleReading,
        title: recordData.title,
      });

      const recordId = await ctx.db.insert("serviceRecords", {
        title: recordData.title,
        titleReading: recordData.titleReading,
        url: recordData.url,
        ogpImage: recordData.ogpImage,
        ogpDescription: recordData.ogpDescription,
        memo: recordData.memo,
        userId: primaryAdmin.userId,
        accountId: primaryAdmin._id,
        familyId: demoFamilyId,
        sortKey,
        ownerType: "family",
        ownerFamilyId: demoFamilyId,
        admins: [primaryAdmin._id],
        tags: recordData.tags,
        stableId: crypto.randomUUID(),
        revision: 0,
        updatedAt: now,
        updatedByAccountId: primaryAdmin._id,
      });

      for (let i = 0; i < recordData.credentials.length; i++) {
        const cred = recordData.credentials[i];
        await ctx.db.insert("credentials", {
          recordId,
          stableId: crypto.randomUUID(),
          label: cred.label,
          loginId: cred.loginId,
          passwordHint: cred.passwordHint,
          passwordHintIv: cred.passwordHintIv,
          passwordHintDekEncrypted: cred.passwordHintDekEncrypted,
          passwordHintDekIv: cred.passwordHintDekIv,
          order: i,
          updatedAt: now,
        });
      }
      insertedRecordsCount++;
    }

    // 7.5 デモ固定コード以外の招待を削除（環境汚染防止）
    const allInvites = await ctx.db
      .query("familyInvites")
      .withIndex("by_familyId", (q) => q.eq("familyId", demoFamilyId))
      .collect();
    let deletedExtraInvitesCount = 0;
    for (const inv of allInvites) {
      if (inv.code !== demoInviteCode) {
        await ctx.db.delete(inv._id);
        deletedExtraInvitesCount++;
      }
    }

    // 8. ステップ 6: 無期限招待コードの維持
    const existingInvite = await ctx.db
      .query("familyInvites")
      .withIndex("by_code", (q) => q.eq("code", demoInviteCode))
      .first();

    if (existingInvite && existingInvite.familyId === demoFamilyId) {
      await ctx.db.patch(existingInvite._id, {
        expiresAt: FAR_FUTURE_MS,
        useCount: 0,
        revokedAt: undefined,
      });
    } else {
      if (existingInvite) {
        throw new Error(
          `Invite code "${demoInviteCode}" is already used by another family.`,
        );
      }
      await ctx.db.insert("familyInvites", {
        familyId: demoFamilyId,
        code: demoInviteCode,
        createdBy: primaryAdmin.userId,
        createdAt: now,
        expiresAt: FAR_FUTURE_MS,
        useCount: 0,
      });
    }

    // 9. 監査ログ記録
    await logAuditEvent(ctx, {
      actor: primaryAdmin,
      ownerType: "family",
      ownerFamilyId: demoFamilyId,
      action: "FAMILY_UPDATE",
      metadata: {
        detail: `デモファミリー定期リセット: 実行者=${args.triggeredBy || "cron"}, 理由=${args.reason || "scheduled"}, kick人数=${kickedGuestsCount}, 削除レコード数=${deletedRecordsCount}, 投入レコード数=${insertedRecordsCount}`,
      },
    });

    return {
      success: true,
      familyId: demoFamilyId,
      kickedGuestsCount,
      deletedRecordsCount,
      deletedJoinRequestsCount,
      deletedAuditLogsCount,
      deletedViewLogsCount,
      deletedExtraInvitesCount,
      deletedMigrationsCount,
      insertedRecordsCount,
      inviteCode: demoInviteCode,
      triggeredBy: args.triggeredBy || "cron",
      reason: args.reason || "scheduled",
      resetAt: now,
    };
  },
});

/**
 * デモファミリー（または指定ファミリー）の暗号化済み共有レコードを
 * demoRecords.json と同一のフォーマットで抽出する internal query。
 * 開発環境や検証環境でGUI/CSVインポートしたデータを demoRecords.json として保存・同期する際に使用。
 */
export const exportDemoRecordsInternal = internalQuery({
  args: {
    familyId: v.optional(v.id("families")),
  },
  handler: async (ctx, args) => {
    const demoFamilyIdStr = args.familyId ?? process.env.DEMO_FAMILY_ID;
    if (!demoFamilyIdStr) {
      throw new Error(
        "familyId is not provided and DEMO_FAMILY_ID environment variable is missing.",
      );
    }
    const familyId = demoFamilyIdStr as Id<"families">;

    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_family_updatedAt", (q) => q.eq("familyId", familyId))
      .collect();

    // 共有レコードのみを対象とする
    const familyRecords = records.filter((r) => r.ownerType === "family");

    const exportedRecords = [];
    for (const record of familyRecords) {
      const credentials = await ctx.db
        .query("credentials")
        .withIndex("by_recordId", (q) => q.eq("recordId", record._id))
        .collect();

      credentials.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      exportedRecords.push({
        title: record.title,
        titleReading: record.titleReading,
        url: record.url,
        ogpImage: record.ogpImage,
        ogpDescription: record.ogpDescription,
        memo: record.memo,
        tags: record.tags,
        credentials: credentials.map((c) => ({
          label: c.label,
          loginId: c.loginId,
          passwordHint: c.passwordHint,
          passwordHintIv: c.passwordHintIv,
          passwordHintDekEncrypted: c.passwordHintDekEncrypted,
          passwordHintDekIv: c.passwordHintDekIv,
        })),
      });
    }

    return exportedRecords;
  },
});

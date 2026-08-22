import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  authenticatedMutation,
  authenticatedQuery,
  familyBoundMutation,
  familyBoundQuery,
} from "./customBuilders";

/**
 * メンバーが家族を離脱または削除された際、共有レコードの管理者リストを調停
 * 管理者が0人になる場合は残りの家族メンバー全員を自動昇格
 */
export async function reconcileAdminsOnLeave(
  ctx: { db: MutationCtx["db"] },
  familyId: Id<"families">,
  leavingAccountId: Id<"users">,
) {
  const sharedRecords = await ctx.db
    .query("serviceRecords")
    .withIndex("by_ownerType_ownerFamilyId", (q) =>
      q.eq("ownerType", "family").eq("ownerFamilyId", familyId),
    )
    .collect();

  const remainingFamilyMembers = await ctx.db
    .query("users")
    .withIndex("by_familyId", (q) => q.eq("familyId", familyId))
    .collect();
  const remainingAccountIds = remainingFamilyMembers
    .filter((u) => u._id !== leavingAccountId)
    .map((u) => u._id);

  for (const record of sharedRecords) {
    const currentAdmins = record.admins ?? [];
    if (currentAdmins.includes(leavingAccountId)) {
      const newAdmins = currentAdmins.filter((id) => id !== leavingAccountId);
      if (newAdmins.length === 0) {
        await ctx.db.patch(record._id, {
          admins: remainingAccountIds,
          updatedAt: Date.now(),
        });
      } else {
        await ctx.db.patch(record._id, {
          admins: newAdmins,
          updatedAt: Date.now(),
        });
      }
    }
  }
}

export const getFamilyMembersByFamilyId = async (
  ctx: QueryCtx,
  familyId: Id<"families">,
) => {
  const family = await ctx.db.get(familyId);
  if (!family) return null;

  const usersInFamily = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("familyId"), family._id))
    .collect();

  return {
    ...family,
    users: usersInFamily.map((u) => ({
      id: u._id,
      userId: u.userId,
      email: u.email,
      displayName: u.displayName,
    })),
    id: family._id,
  };
};

export const getFamilyMembersById = async (
  ctx: QueryCtx,
  userOrAccountId: string,
) => {
  // まず ID として正規化を試みる
  const normalizedId = ctx.db.normalizeId("users", userOrAccountId);
  let user = null;

  if (normalizedId !== null) {
    user = await ctx.db.get(normalizedId);
  }

  // ID として見つからなければ userId で検索（レガシーフォールバック）
  if (!user) {
    user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userOrAccountId))
      .first();
  }

  if (!user?.familyId) return null;

  return await getFamilyMembersByFamilyId(ctx, user.familyId);
};

export const getFamilyMembersInternal = internalQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    return await getFamilyMembersByFamilyId(ctx, familyId);
  },
});

export const getFamilyMembers = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    if (!user.familyId) return null;
    return await getFamilyMembersByFamilyId(ctx, user.familyId);
  },
});

export const createFamily = authenticatedMutation({
  args: {
    name: v.string(),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const familyId = await ctx.db.insert("families", {
      name: args.name,
      masterKeyEncrypted: args.masterKeyEncrypted,
      masterKeyIv: args.masterKeyIv,
      masterKeySalt: args.masterKeySalt,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(user._id, { familyId });

    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: user.email,
        payload: {
          template: "familyWelcome",
          props: {
            displayName: user.displayName || "メンバー",
            familyName: args.name,
            ctaUrl: `${appUrl}/dashboard`,
          },
        },
      },
    );

    return familyId;
  },
});

export const joinFamily = authenticatedMutation({
  args: {
    inviteCode: v.id("families"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    // Verify approved request
    const approvedRequest =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", family._id).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .first()) ||
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_userId", (q) =>
          q.eq("familyId", family._id).eq("userId", user.userId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("accountId"), undefined),
          ),
        )
        .first());

    if (!approvedRequest) {
      throw new Error(
        "Access denied: You must be approved to join this family",
      );
    }

    // migrate serviceRecords to family before changing familyId
    const userRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
      .collect();
    for (const record of userRecords) {
      if (!record.familyId) {
        await ctx.db.patch(record._id, { familyId: family._id });
      }
    }

    await ctx.db.patch(user._id, { familyId: family._id });

    // Delete approved request
    await ctx.db.delete(approvedRequest._id);

    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: user.email,
        payload: {
          template: "familyWelcome",
          props: {
            displayName: user.displayName || "メンバー",
            familyName: family.name,
            ctaUrl: `${appUrl}/dashboard`,
          },
        },
      },
    );

    const familyMembers = await ctx.runQuery(
      internal.families.getFamilyMembersInternal,
      {
        familyId: family._id,
      },
    );
    if (familyMembers) {
      await Promise.all(
        familyMembers.users.map((member) => {
          if (member.email === user.email) return null;
          return ctx.scheduler.runAfter(
            0,
            internal.actions.sendTemplatedEmailInternal,
            {
              email: member.email,
              payload: {
                template: "newMemberJoined",
                props: {
                  displayName: member.displayName || "メンバー",
                  familyName: family.name,
                  newMemberDisplayName: user.displayName || undefined,
                  newMemberEmail: user.email,
                  ctaUrl: `${appUrl}/family`,
                },
              },
            },
          );
        }),
      );
    }

    return family._id;
  },
});

export const getFamilyInfoByInviteCode = authenticatedQuery({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    const isMember = user.familyId === family._id;
    const approvedRequest =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", family._id).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .first()) ||
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_userId", (q) =>
          q.eq("familyId", family._id).eq("userId", user.userId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("accountId"), undefined),
          ),
        )
        .first());

    if (!isMember && !approvedRequest) {
      throw new Error(
        "Access denied: You must be approved to access family keys",
      );
    }

    return {
      id: family._id,
      name: family.name,
      masterKeyEncrypted: family.masterKeyEncrypted,
      masterKeyIv: family.masterKeyIv,
      masterKeySalt: family.masterKeySalt,
    };
  },
});

export const cleanupExpiredMigrationsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expiredMigrations = await ctx.db
      .query("familyMigrations")
      .withIndex("by_status", (q) => q.eq("status", "PREPARED"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const migration of expiredMigrations) {
      await ctx.db.patch(migration._id, { status: "EXPIRED" });
      const members = await ctx.db
        .query("users")
        .withIndex("by_familyId", (q) =>
          q.eq("familyId", migration.targetFamilyId),
        )
        .collect();

      const remainingRecord = await ctx.db
        .query("serviceRecords")
        .withIndex("by_family_sortKey", (q) =>
          q.eq("familyId", migration.targetFamilyId),
        )
        .first();

      if (members.length === 0 && !remainingRecord) {
        await ctx.db.delete(migration.targetFamilyId);
      }
    }
  },
});

export const abortFamilyMigration = authenticatedMutation({
  args: { migrationId: v.id("familyMigrations") },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const migration = await ctx.db.get(args.migrationId);
    const isOwner = migration
      ? migration.accountId
        ? migration.accountId === user._id
        : migration.userId === user.userId
      : false;
    if (!migration || !isOwner) {
      throw new Error("Migration not found or access denied");
    }

    if (migration.status !== "PREPARED") {
      return { success: false };
    }

    await ctx.db.patch(migration._id, { status: "ABORTED" });

    const members = await ctx.db
      .query("users")
      .withIndex("by_familyId", (q) =>
        q.eq("familyId", migration.targetFamilyId),
      )
      .collect();

    const remainingRecord = await ctx.db
      .query("serviceRecords")
      .withIndex("by_family_sortKey", (q) =>
        q.eq("familyId", migration.targetFamilyId),
      )
      .first();

    if (members.length === 0 && !remainingRecord) {
      await ctx.db.delete(migration.targetFamilyId);
    }

    return { success: true };
  },
});

export const prepareFamilyMigration = authenticatedMutation({
  args: {
    action: v.union(v.literal("create"), v.literal("join")),
    name: v.optional(v.string()),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    inviteCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    // 未完了の PREPARED 状態の移行を無効化し、メンバー0人の孤児 Family があれば削除
    const staleMigrations = await ctx.db
      .query("familyMigrations")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "PREPARED"),
          q.or(
            q.eq(q.field("accountId"), user._id),
            q.eq(q.field("accountId"), undefined),
          ),
        ),
      )
      .collect();

    for (const stale of staleMigrations) {
      await ctx.db.patch(stale._id, { status: "EXPIRED" });
      const members = await ctx.db
        .query("users")
        .withIndex("by_familyId", (q) => q.eq("familyId", stale.targetFamilyId))
        .collect();

      const remainingRecord = await ctx.db
        .query("serviceRecords")
        .withIndex("by_family_sortKey", (q) =>
          q.eq("familyId", stale.targetFamilyId),
        )
        .first();

      if (members.length === 0 && !remainingRecord) {
        await ctx.db.delete(stale.targetFamilyId);
      }
    }

    let targetFamilyId: Id<"families">;

    if (args.action === "create") {
      if (
        !args.name ||
        !args.masterKeyEncrypted ||
        !args.masterKeyIv ||
        !args.masterKeySalt
      ) {
        throw new Error("Missing fields for create");
      }
      targetFamilyId = await ctx.db.insert("families", {
        name: args.name,
        masterKeyEncrypted: args.masterKeyEncrypted,
        masterKeyIv: args.masterKeyIv,
        masterKeySalt: args.masterKeySalt,
        updatedAt: Date.now(),
      });
    } else {
      if (!args.inviteCode) throw new Error("Missing invite code");
      const family = await ctx.db.get(args.inviteCode as Id<"families">);
      if (!family) throw new Error("Invalid invite code");

      // Verify approved join request
      const approvedRequest =
        (await ctx.db
          .query("joinRequests")
          .withIndex("by_familyId_accountId", (q) =>
            q.eq("familyId", family._id).eq("accountId", user._id),
          )
          .filter((q) => q.eq(q.field("status"), "approved"))
          .first()) ||
        (await ctx.db
          .query("joinRequests")
          .withIndex("by_familyId_userId", (q) =>
            q.eq("familyId", family._id).eq("userId", user.userId),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("status"), "approved"),
              q.eq(q.field("accountId"), undefined),
            ),
          )
          .first());

      if (!approvedRequest) {
        throw new Error(
          "Access denied: You must be approved to join this family",
        );
      }

      targetFamilyId = family._id;
    }

    const userRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_ownerType_accountId", (q) =>
        q.eq("ownerType", "user").eq("accountId", user._id),
      )
      .collect();

    const serviceRecordIds = userRecords.map((r) => r._id);
    const now = Date.now();
    const expiresAt = now + 30 * 60 * 1000; // 30 mins

    const migrationId = await ctx.db.insert("familyMigrations", {
      userId: user.userId,
      accountId: user._id,
      sourceFamilyId: user.familyId,
      targetFamilyId,
      serviceRecordIds,
      status: "PREPARED",
      createdAt: now,
      expiresAt,
    });

    return { migrationId, targetFamilyId };
  },
});

export const getMigrationForEncryption = authenticatedQuery({
  args: { migrationId: v.id("familyMigrations") },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const migration = await ctx.db.get(args.migrationId);
    const isOwner = migration
      ? migration.accountId
        ? migration.accountId === user._id
        : migration.userId === user.userId
      : false;
    if (!migration || !isOwner) {
      throw new Error("Migration not found or access denied");
    }

    if (migration.status !== "PREPARED") {
      throw new Error("Migration is not in PREPARED status");
    }

    if (migration.expiresAt < Date.now()) {
      throw new Error("Migration has expired");
    }

    // prepare 後に作成されたレコードも含めるためリアルタイムで全件取得
    const currentRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_ownerType_accountId", (q) =>
        q.eq("ownerType", "user").eq("accountId", user._id),
      )
      .collect();

    const records = currentRecords.map((record) => ({
      _id: record._id,
      id: record._id,
      credentials: record.credentials
        .filter((c) => c.passwordHint && c.passwordHintIv)
        .map((c) => ({
          id: c.id,
          passwordHint: c.passwordHint,
          passwordHintIv: c.passwordHintIv,
          passwordHintDekEncrypted: c.passwordHintDekEncrypted,
          passwordHintDekIv: c.passwordHintDekIv,
        })),
    }));

    return {
      migrationId: migration._id,
      sourceFamilyId: migration.sourceFamilyId,
      targetFamilyId: migration.targetFamilyId,
      records: records.filter((r) => r.credentials.length > 0),
    };
  },
});

export const commitFamilyMigration = authenticatedMutation({
  args: {
    migrationId: v.id("familyMigrations"),
    credentials: v.array(
      v.object({
        recordId: v.optional(v.string()),
        id: v.string(),
        passwordHint: v.string(),
        passwordHintIv: v.string(),
        passwordHintDekEncrypted: v.optional(v.string()),
        passwordHintDekIv: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const migration = await ctx.db.get(args.migrationId);
    const isOwner = migration
      ? migration.accountId
        ? migration.accountId === user._id
        : migration.userId === user.userId
      : false;
    if (!migration || !isOwner) {
      throw new Error("Migration not found or access denied");
    }

    if (migration.status !== "PREPARED") {
      throw new Error("Migration is not in PREPARED status");
    }

    if (migration.expiresAt < Date.now()) {
      await ctx.db.patch(migration._id, { status: "EXPIRED" });
      throw new Error("Migration has expired");
    }

    if (user.familyId !== migration.sourceFamilyId) {
      throw new Error("Current family does not match prepared source family");
    }

    const credUpdates = new Map<string, (typeof args.credentials)[number]>();
    for (const c of args.credentials) {
      if (c.recordId) {
        credUpdates.set(`${c.recordId}:${c.id}`, c);
      } else {
        credUpdates.set(c.id, c);
      }
    }

    // prepare 後に作成されたレコードも含めるためリアルタイムで全件取得
    const currentRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_ownerType_accountId", (q) =>
        q.eq("ownerType", "user").eq("accountId", user._id),
      )
      .collect();

    // migration.serviceRecordIds(prepare時点のスナップショット)との集合比較
    const currentRecordIds = new Set(currentRecords.map((r) => r._id));
    const preparedRecordIds = new Set(migration.serviceRecordIds);
    if (
      currentRecordIds.size !== preparedRecordIds.size ||
      [...currentRecordIds].some((id) => !preparedRecordIds.has(id))
    ) {
      throw new Error(
        "Conflict detected: Service records were modified during migration. Please retry migration.",
      );
    }

    // 再暗号化対象の全 credential に対して更新情報が存在するか事前に検証
    for (const record of currentRecords) {
      for (const cred of record.credentials) {
        if (cred.passwordHint && cred.passwordHintIv) {
          const hasUpdate =
            credUpdates.has(`${record._id}:${cred.id}`) ||
            credUpdates.has(cred.id);
          if (!hasUpdate) {
            throw new Error(
              `Missing re-encrypted credential update for record ${record._id}, credential ${cred.id}`,
            );
          }
        }
      }
    }

    for (const record of currentRecords) {
      const newCredentials = record.credentials.map((cred) => {
        const update =
          credUpdates.get(`${record._id}:${cred.id}`) ??
          credUpdates.get(cred.id);
        if (update) {
          return {
            ...cred,
            passwordHint: update.passwordHint,
            passwordHintIv: update.passwordHintIv,
            passwordHintDekEncrypted: update.passwordHintDekEncrypted,
            passwordHintDekIv: update.passwordHintDekIv,
          };
        }
        return cred;
      });

      await ctx.db.patch(record._id, {
        familyId: migration.targetFamilyId,
        credentials: newCredentials,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(user._id, { familyId: migration.targetFamilyId });

    const approvedRequest =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", migration.targetFamilyId).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .first()) ||
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_userId", (q) =>
          q.eq("familyId", migration.targetFamilyId).eq("userId", user.userId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("accountId"), undefined),
          ),
        )
        .first());

    if (approvedRequest) {
      await ctx.db.delete(approvedRequest._id);
    }

    if (
      migration.sourceFamilyId &&
      migration.sourceFamilyId !== migration.targetFamilyId
    ) {
      await reconcileAdminsOnLeave(ctx, migration.sourceFamilyId, user._id);

      const remainingUsers = await ctx.db
        .query("users")
        .withIndex("by_familyId", (q) =>
          q.eq("familyId", migration.sourceFamilyId),
        )
        .collect();

      // serviceRecords が旧 Family に残っていないことも確認
      const remainingRecord = await ctx.db
        .query("serviceRecords")
        .withIndex("by_family_sortKey", (q) =>
          q.eq("familyId", migration.sourceFamilyId),
        )
        .first();

      if (remainingUsers.length === 0 && !remainingRecord) {
        await ctx.db.delete(migration.sourceFamilyId);
      }
    }

    await ctx.db.patch(migration._id, { status: "COMPLETED" });

    const targetFamily = await ctx.db.get(migration.targetFamilyId);
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: user.email,
        payload: {
          template: "familyMigrationCompleted",
          props: {
            displayName: user.displayName || "メンバー",
            familyName: targetFamily?.name || "",
            ctaUrl: `${appUrl}/family`,
          },
        },
      },
    );

    return { success: true, familyId: migration.targetFamilyId };
  },
});

export const getRecordsForReEncryption = familyBoundQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;

    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_ownerType_accountId", (q) =>
        q.eq("ownerType", "user").eq("accountId", user._id),
      )
      .collect();

    return records
      .map((record) => ({
        _id: record._id,
        id: record._id,
        credentials: record.credentials
          .filter((c) => c.passwordHint && c.passwordHintIv)
          .map((c) => ({
            id: c.id,
            passwordHint: c.passwordHint,
            passwordHintIv: c.passwordHintIv,
            passwordHintDekEncrypted: c.passwordHintDekEncrypted,
            passwordHintDekIv: c.passwordHintDekIv,
          })),
      }))
      .filter((record) => record.credentials.length > 0);
  },
});

export const changeFamily = authenticatedMutation({
  args: {
    action: v.union(v.literal("create"), v.literal("join")),
    name: v.optional(v.string()),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    inviteCode: v.optional(v.string()),
    credentials: v.array(
      v.object({
        recordId: v.optional(v.string()),
        id: v.string(),
        passwordHint: v.string(),
        passwordHintIv: v.string(),
        passwordHintDekEncrypted: v.optional(v.string()),
        passwordHintDekIv: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    let targetFamilyId: Id<"families">;

    if (args.action === "create") {
      if (
        !args.name ||
        !args.masterKeyEncrypted ||
        !args.masterKeyIv ||
        !args.masterKeySalt
      ) {
        throw new Error("Missing fields for create");
      }
      targetFamilyId = await ctx.db.insert("families", {
        name: args.name,
        masterKeyEncrypted: args.masterKeyEncrypted,
        masterKeyIv: args.masterKeyIv,
        masterKeySalt: args.masterKeySalt,
        updatedAt: Date.now(),
      });
    } else {
      if (!args.inviteCode) throw new Error("Missing invite code");
      const family = await ctx.db.get(args.inviteCode as Id<"families">);
      if (!family) throw new Error("Invalid invite code");

      const approvedRequest =
        (await ctx.db
          .query("joinRequests")
          .withIndex("by_familyId_accountId", (q) =>
            q.eq("familyId", family._id).eq("accountId", user._id),
          )
          .filter((q) => q.eq(q.field("status"), "approved"))
          .first()) ||
        (await ctx.db
          .query("joinRequests")
          .withIndex("by_familyId_userId", (q) =>
            q.eq("familyId", family._id).eq("userId", user.userId),
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("status"), "approved"),
              q.eq(q.field("accountId"), undefined),
            ),
          )
          .first());

      if (!approvedRequest) {
        throw new Error(
          "Access denied: You must be approved to join this family",
        );
      }

      targetFamilyId = family._id;
    }

    const userRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_ownerType_accountId", (q) =>
        q.eq("ownerType", "user").eq("accountId", user._id),
      )
      .collect();

    const serviceRecordIds = userRecords.map((r) => r._id);
    const now = Date.now();

    const migrationId = await ctx.db.insert("familyMigrations", {
      userId: user.userId,
      accountId: user._id,
      sourceFamilyId: user.familyId,
      targetFamilyId,
      serviceRecordIds,
      status: "PREPARED",
      createdAt: now,
      expiresAt: now + 30 * 60 * 1000,
    });

    const credUpdates = new Map<string, (typeof args.credentials)[number]>();
    for (const c of args.credentials) {
      if (c.recordId) {
        credUpdates.set(`${c.recordId}:${c.id}`, c);
      } else {
        credUpdates.set(c.id, c);
      }
    }

    for (const record of userRecords) {
      let needsUpdate = false;
      const newCredentials = record.credentials.map((cred) => {
        const update =
          credUpdates.get(`${record._id}:${cred.id}`) ??
          credUpdates.get(cred.id);
        if (update) {
          needsUpdate = true;
          return {
            ...cred,
            passwordHint: update.passwordHint,
            passwordHintIv: update.passwordHintIv,
            passwordHintDekEncrypted: update.passwordHintDekEncrypted,
            passwordHintDekIv: update.passwordHintDekIv,
          };
        }
        return cred;
      });

      if (record.familyId !== targetFamilyId || needsUpdate) {
        await ctx.db.patch(record._id, {
          familyId: targetFamilyId,
          credentials: newCredentials,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(user._id, { familyId: targetFamilyId });

    const approvedReq =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", targetFamilyId).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .first()) ||
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_userId", (q) =>
          q.eq("familyId", targetFamilyId).eq("userId", user.userId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("accountId"), undefined),
          ),
        )
        .first());

    if (approvedReq) {
      await ctx.db.delete(approvedReq._id);
    }

    if (user.familyId && user.familyId !== targetFamilyId) {
      await reconcileAdminsOnLeave(ctx, user.familyId, user._id);

      const remainingUsers = await ctx.db
        .query("users")
        .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
        .collect();

      // serviceRecords が旧 Family に残っていないことも確認
      const remainingRecord = await ctx.db
        .query("serviceRecords")
        .withIndex("by_family_sortKey", (q) => q.eq("familyId", user.familyId))
        .first();

      if (remainingUsers.length === 0 && !remainingRecord) {
        await ctx.db.delete(user.familyId);
      }
    }

    await ctx.db.patch(migrationId, { status: "COMPLETED" });

    const targetFamily = await ctx.db.get(targetFamilyId);
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: user.email,
        payload: {
          template: "familyMigrationCompleted",
          props: {
            displayName: user.displayName || "メンバー",
            familyName: targetFamily?.name || "",
            ctaUrl: `${appUrl}/family`,
          },
        },
      },
    );

    return { success: true, familyId: targetFamilyId };
  },
});

export const getFamilyPublicInfo = authenticatedQuery({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    return {
      id: family._id,
      name: family.name,
    };
  },
});

export const createJoinRequest = authenticatedMutation({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    if (user.familyId === family._id) {
      throw new Error("You are already a member of this family");
    }

    // Check if there is any pending request by this user/account for ANY family
    const anyPendingRequest =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_accountId_status", (q) =>
          q.eq("accountId", user._id).eq("status", "pending"),
        )
        .first()) ||
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", user.userId).eq("status", "pending"),
        )
        .filter((q) => q.eq(q.field("accountId"), undefined))
        .first());

    if (anyPendingRequest) {
      throw new Error(
        "You already have a pending join request for another family. Please cancel it first.",
      );
    }

    // Check if there is already an active (approved) request for this family & account
    const existingApproved =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", family._id).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .first()) ||
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_userId", (q) =>
          q.eq("familyId", family._id).eq("userId", user.userId),
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "approved"),
            q.eq(q.field("accountId"), undefined),
          ),
        )
        .first());

    if (existingApproved) {
      return existingApproved._id;
    }

    // Delete any rejected requests for this family and account first
    const rejectedRequests =
      (await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", family._id).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "rejected"))
        .collect()) || [];

    for (const r of rejectedRequests) {
      await ctx.db.delete(r._id);
    }

    const requestId = await ctx.db.insert("joinRequests", {
      familyId: family._id,
      userId: user.userId,
      accountId: user._id,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Send email to all existing family members
    const familyMembers = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("familyId"), family._id))
      .collect();

    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    for (const member of familyMembers) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: member.email,
          payload: {
            template: "joinRequestReceived",
            props: {
              displayName: member.displayName || "メンバー",
              familyName: family.name,
              applicantDisplayName: user.displayName || "名無し",
              applicantEmail: user.email,
              ctaUrl: `${appUrl}/family`,
            },
          },
        },
      );
    }

    return requestId;
  },
});

export const cancelJoinRequest = authenticatedMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");

    if (
      request.userId !== user.userId &&
      (!request.accountId || request.accountId !== user._id)
    ) {
      throw new Error("Unauthorized: This is not your request");
    }

    if (request.status !== "pending") {
      throw new Error("Only pending requests can be cancelled");
    }

    await ctx.db.delete(request._id);
    return { success: true };
  },
});

export const getMyJoinRequest = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    // 申請元アカウントに紐づくリクエストを優先検索
    let request = await ctx.db
      .query("joinRequests")
      .withIndex("by_accountId_status", (q) =>
        q.eq("accountId", user._id).eq("status", "pending"),
      )
      .first();

    if (!request) {
      request = await ctx.db
        .query("joinRequests")
        .withIndex("by_accountId_status", (q) =>
          q.eq("accountId", user._id).eq("status", "approved"),
        )
        .first();
    }

    if (!request) {
      request = await ctx.db
        .query("joinRequests")
        .withIndex("by_userId_status", (q) => q.eq("userId", user.userId))
        .filter((q) =>
          q.and(
            q.or(
              q.eq(q.field("status"), "pending"),
              q.eq(q.field("status"), "approved"),
            ),
            q.eq(q.field("accountId"), undefined),
          ),
        )
        .first();
    }

    if (!request) {
      const rejected =
        (await ctx.db
          .query("joinRequests")
          .withIndex("by_accountId_status", (q) =>
            q.eq("accountId", user._id).eq("status", "rejected"),
          )
          .first()) ||
        (await ctx.db
          .query("joinRequests")
          .withIndex("by_userId_status", (q) =>
            q.eq("userId", user.userId).eq("status", "rejected"),
          )
          .filter((q) => q.eq(q.field("accountId"), undefined))
          .first());
      if (rejected) {
        const family = await ctx.db.get(rejected.familyId);
        return {
          id: rejected._id,
          familyId: rejected.familyId,
          familyName: family?.name || "未知の家族",
          status: "rejected" as const,
        };
      }
      return null;
    }

    const family = await ctx.db.get(request.familyId);
    return {
      id: request._id,
      familyId: request.familyId,
      familyName: family?.name || "未知の家族",
      status: request.status,
    };
  },
});

export const dismissRejectedRequest = authenticatedMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (
      request.userId !== user.userId &&
      (!request.accountId || request.accountId !== user._id)
    ) {
      throw new Error("Unauthorized");
    }
    if (request.status !== "rejected") {
      throw new Error("Only rejected requests can be dismissed");
    }

    await ctx.db.delete(request._id);
    return { success: true };
  },
});

export const getPendingRequests = familyBoundQuery({
  args: {},
  handler: async (ctx) => {
    const { familyId } = ctx;

    const pendingRequests = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_status", (q) =>
        q.eq("familyId", familyId).eq("status", "pending"),
      )
      .collect();

    const results = [];
    for (const req of pendingRequests) {
      const user = req.accountId
        ? await ctx.db.get(req.accountId)
        : await ctx.db
            .query("users")
            .withIndex("by_userId", (q) => q.eq("userId", req.userId))
            .first();
      results.push({
        id: req._id,
        userId: req.userId,
        accountId: req.accountId,
        status: req.status,
        createdAt: req.createdAt,
        displayName: user?.displayName || "名無し",
        email: user?.email || "",
      });
    }

    return results;
  },
});

export const approveJoinRequest = familyBoundMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { familyId } = ctx;

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.familyId !== familyId) {
      throw new Error("Unauthorized: Request does not belong to your family");
    }
    if (request.status !== "pending") {
      throw new Error("Only pending requests can be approved");
    }

    const applicant = request.accountId
      ? await ctx.db.get(request.accountId)
      : await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", request.userId))
          .first();
    if (!applicant) throw new Error("Applicant not found");

    if (!applicant.familyId) {
      // migrate serviceRecords to family before changing familyId
      const applicantRecords = await ctx.db
        .query("serviceRecords")
        .withIndex("by_accountId", (q) => q.eq("accountId", applicant._id))
        .collect();
      for (const record of applicantRecords) {
        if (!record.familyId) {
          await ctx.db.patch(record._id, { familyId });
        }
      }

      await ctx.db.patch(applicant._id, { familyId });
      await ctx.db.patch(request._id, {
        status: "approved",
        updatedAt: Date.now(),
      });

      const family = await ctx.db.get(familyId);
      const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: applicant.email,
          payload: {
            template: "joinApproved",
            props: {
              displayName: applicant.displayName || "メンバー",
              familyName: family?.name || "",
              variant: "join",
              ctaUrl: `${appUrl}/family`,
            },
          },
        },
      );
    } else {
      await ctx.db.patch(request._id, {
        status: "approved",
        updatedAt: Date.now(),
      });

      const family = await ctx.db.get(familyId);
      const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: applicant.email,
          payload: {
            template: "joinApproved",
            props: {
              displayName: applicant.displayName || "メンバー",
              familyName: family?.name || "",
              variant: "migration",
              ctaUrl: `${appUrl}/family`,
            },
          },
        },
      );
    }

    return { success: true };
  },
});

export const rejectJoinRequest = familyBoundMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { familyId } = ctx;

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.familyId !== familyId) throw new Error("Unauthorized");
    if (request.status !== "pending") {
      throw new Error("Only pending requests can be rejected");
    }

    await ctx.db.patch(request._id, {
      status: "rejected",
      updatedAt: Date.now(),
    });

    const applicant = request.accountId
      ? await ctx.db.get(request.accountId)
      : await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", request.userId))
          .first();

    if (applicant) {
      const family = await ctx.db.get(familyId);
      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: applicant.email,
          payload: {
            template: "joinRequestRejected",
            props: {
              displayName: applicant.displayName || "メンバー",
              familyName: family?.name || "",
            },
          },
        },
      );
    }

    return { success: true };
  },
});

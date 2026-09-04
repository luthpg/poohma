import { v } from "convex/values";
import { RotatePasscodeInputSchema } from "../src/utils/schemas";
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
import {
  deleteCredentialsForRecord,
  getCredentialsForRecord,
} from "./records";

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

  // 残存メンバーがいない場合、管理者不在・メンバー不在となった孤立共有レコードをクリーンアップ
  if (remainingAccountIds.length === 0) {
    for (const record of sharedRecords) {
      await deleteCredentialsForRecord(ctx, record._id);
      await ctx.db.delete(record._id);
    }
    return;
  }

  for (const record of sharedRecords) {
    const currentAdmins = record.admins ?? [];
    const validRemainingAdmins = currentAdmins.filter(
      (id) => id !== leavingAccountId && remainingAccountIds.includes(id),
    );

    const newAdmins =
      validRemainingAdmins.length === 0
        ? remainingAccountIds
        : validRemainingAdmins;

    const hasChanged =
      newAdmins.length !== currentAdmins.length ||
      newAdmins.some((id, idx) => id !== currentAdmins[idx]);

    if (hasChanged) {
      await ctx.db.patch(record._id, {
        admins: newAdmins,
        updatedAt: Date.now(),
      });
    }
  }
}

/**
 * 家族削除時に紐づく招待コードをカスケード削除するヘルパー
 */
export async function deleteFamilyInvites(
  ctx: { db: MutationCtx["db"] },
  familyId: Id<"families">,
) {
  const invites = await ctx.db
    .query("familyInvites")
    .withIndex("by_familyId", (q) => q.eq("familyId", familyId))
    .collect();
  for (const inv of invites) {
    await ctx.db.delete(inv._id);
  }
}

/**
 * ユーザーの個人レコードを取得するヘルパー
 */
async function getPersonalRecordsForUser(
  ctx: { db: MutationCtx["db"] | QueryCtx["db"] },
  accountId: Id<"users">,
) {
  const records = await ctx.db
    .query("serviceRecords")
    .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
    .collect();
  return records.filter((r) => r.ownerType === "user");
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

const MIN_KDF_ITERATIONS = 100_000;
const MAX_KDF_ITERATIONS = 2_000_000;
const SUPPORTED_KDF_VERSIONS = new Set([1]);
const LEGACY_PBKDF2_ITERATIONS = 300_000;

function resolveKdfParams(iterations?: number, version?: number) {
  const resolvedVersion = version ?? 1;
  if (!SUPPORTED_KDF_VERSIONS.has(resolvedVersion)) {
    throw new Error(`Unsupported cryptoVersion: ${resolvedVersion}`);
  }
  const resolvedIterations = iterations ?? LEGACY_PBKDF2_ITERATIONS;
  if (!Number.isSafeInteger(resolvedIterations)) {
    throw new Error("kdfIterations must be a safe integer");
  }
  if (
    resolvedIterations < MIN_KDF_ITERATIONS ||
    resolvedIterations > MAX_KDF_ITERATIONS
  ) {
    throw new Error(
      `kdfIterations is out of the allowed range (${MIN_KDF_ITERATIONS}-${MAX_KDF_ITERATIONS})`,
    );
  }
  return { kdfIterations: resolvedIterations, cryptoVersion: resolvedVersion };
}

export const createFamily = authenticatedMutation({
  args: {
    name: v.string(),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    kdfIterations: v.optional(v.number()),
    cryptoVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const { kdfIterations, cryptoVersion } = resolveKdfParams(
      args.kdfIterations,
      args.cryptoVersion,
    );

    const familyId = await ctx.db.insert("families", {
      name: args.name,
      masterKeyEncrypted: args.masterKeyEncrypted,
      masterKeyIv: args.masterKeyIv,
      masterKeySalt: args.masterKeySalt,
      kdfIterations,
      cryptoVersion,
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
    familyId: v.id("families"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const family = await ctx.db.get(args.familyId);
    if (!family) throw new Error("Invalid family ID");

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

export const getFamilyInfoByFamilyId = authenticatedQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const family = await ctx.db.get(args.familyId);
    if (!family) throw new Error("Invalid family ID");

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
      kdfIterations: family.kdfIterations,
      cryptoVersion: family.cryptoVersion,
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
        await deleteFamilyInvites(ctx, migration.targetFamilyId);
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
      return { success: true };
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
      await deleteFamilyInvites(ctx, migration.targetFamilyId);
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
    kdfIterations: v.optional(v.number()),
    cryptoVersion: v.optional(v.number()),
    familyId: v.optional(v.id("families")),
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
        await deleteFamilyInvites(ctx, stale.targetFamilyId);
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
      const { kdfIterations, cryptoVersion } = resolveKdfParams(
        args.kdfIterations,
        args.cryptoVersion,
      );
      targetFamilyId = await ctx.db.insert("families", {
        name: args.name,
        masterKeyEncrypted: args.masterKeyEncrypted,
        masterKeyIv: args.masterKeyIv,
        masterKeySalt: args.masterKeySalt,
        kdfIterations,
        cryptoVersion,
        updatedAt: Date.now(),
      });
    } else {
      if (!args.familyId) throw new Error("Missing family ID");
      const family = await ctx.db.get(args.familyId);
      if (!family) throw new Error("Invalid family ID");

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

    const userRecords = await getPersonalRecordsForUser(ctx, user._id);

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
    const isOwner = migration ? migration.accountId === user._id : false;
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
    const currentRecords = await getPersonalRecordsForUser(ctx, user._id);

    const recordsWithCreds = await Promise.all(
      currentRecords.map(async (record) => {
        const creds = await getCredentialsForRecord(ctx, record._id);
        const filtered = creds
          .filter((c) => c.passwordHint && c.passwordHintIv)
          .map((c) => ({
            id: c._id as string,
            passwordHint: c.passwordHint as string,
            passwordHintIv: c.passwordHintIv as string,
            passwordHintDekEncrypted: c.passwordHintDekEncrypted,
            passwordHintDekIv: c.passwordHintDekIv,
          }));
        return {
          _id: record._id,
          id: record._id,
          credentials: filtered,
        };
      }),
    );

    return {
      migrationId: migration._id,
      sourceFamilyId: migration.sourceFamilyId,
      targetFamilyId: migration.targetFamilyId,
      records: recordsWithCreds.filter((r) => r.credentials.length > 0),
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
    const isOwner = migration ? migration.accountId === user._id : false;
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
    const currentRecords = await getPersonalRecordsForUser(ctx, user._id);

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

    const now = Date.now();
    for (const record of currentRecords) {
      const creds = await getCredentialsForRecord(ctx, record._id);
      for (const cred of creds) {
        if (cred.passwordHint && cred.passwordHintIv) {
          const update =
            credUpdates.get(`${record._id}:${cred._id}`) ??
            credUpdates.get(cred._id);
          if (!update) {
            throw new Error(
              `Missing re-encrypted credential update for record ${record._id}, credential ${cred._id}`,
            );
          }
          await ctx.db.patch(cred._id, {
            passwordHint: update.passwordHint,
            passwordHintIv: update.passwordHintIv,
            passwordHintDekEncrypted: update.passwordHintDekEncrypted,
            passwordHintDekIv: update.passwordHintDekIv,
            updatedAt: now,
          });
        }
      }

      await ctx.db.patch(record._id, {
        familyId: migration.targetFamilyId,
        updatedAt: now,
      });
    }

    await ctx.db.patch(user._id, { familyId: migration.targetFamilyId });

    const approvedRequest = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_accountId", (q) =>
        q.eq("familyId", migration.targetFamilyId).eq("accountId", user._id),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .first();

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
        await deleteFamilyInvites(ctx, migration.sourceFamilyId);
        await ctx.db.delete(migration.sourceFamilyId);
      }
    }

    await ctx.db.patch(migration._id, { status: "COMPLETED" });

    const pendingVault = await ctx.db
      .query("pendingExportVaults")
      .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
      .first();
    if (pendingVault) {
      await ctx.db.delete(pendingVault._id);
    }

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

    const records = await getPersonalRecordsForUser(ctx, user._id);

    const recordsWithCreds = await Promise.all(
      records.map(async (record) => {
        const creds = await getCredentialsForRecord(ctx, record._id);
        return {
          _id: record._id,
          id: record._id,
          credentials: creds
            .filter((c) => c.passwordHint && c.passwordHintIv)
            .map((c) => ({
              id: c._id as string,
              passwordHint: c.passwordHint as string,
              passwordHintIv: c.passwordHintIv as string,
              passwordHintDekEncrypted: c.passwordHintDekEncrypted,
              passwordHintDekIv: c.passwordHintDekIv,
            })),
        };
      }),
    );

    return recordsWithCreds.filter((record) => record.credentials.length > 0);
  },
});

export const changeFamily = authenticatedMutation({
  args: {
    action: v.union(v.literal("create"), v.literal("join")),
    name: v.optional(v.string()),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    kdfIterations: v.optional(v.number()),
    cryptoVersion: v.optional(v.number()),
    familyId: v.optional(v.id("families")),
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
      const { kdfIterations, cryptoVersion } = resolveKdfParams(
        args.kdfIterations,
        args.cryptoVersion,
      );
      targetFamilyId = await ctx.db.insert("families", {
        name: args.name,
        masterKeyEncrypted: args.masterKeyEncrypted,
        masterKeyIv: args.masterKeyIv,
        masterKeySalt: args.masterKeySalt,
        kdfIterations,
        cryptoVersion,
        updatedAt: Date.now(),
      });
    } else {
      if (!args.familyId) throw new Error("Missing family ID");
      const family = await ctx.db.get(args.familyId);
      if (!family) throw new Error("Invalid family ID");

      const approvedRequest = await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_accountId", (q) =>
          q.eq("familyId", family._id).eq("accountId", user._id),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .first();

      if (!approvedRequest) {
        throw new Error(
          "Access denied: You must be approved to join this family",
        );
      }

      targetFamilyId = family._id;
    }

    const migrationId = await ctx.db.insert("familyMigrations", {
      userId: user.userId,
      accountId: user._id,
      sourceFamilyId: user.familyId,
      targetFamilyId,
      serviceRecordIds: [],
      status: "PREPARED",
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    const userRecords = await getPersonalRecordsForUser(ctx, user._id);

    const credUpdates = new Map(
      args.credentials.map((c) => [
        c.recordId ? `${c.recordId}:${c.id}` : c.id,
        c,
      ]),
    );

    const now = Date.now();
    for (const record of userRecords) {
      const creds = await getCredentialsForRecord(ctx, record._id);
      for (const cred of creds) {
        const update =
          credUpdates.get(`${record._id}:${cred._id}`) ??
          credUpdates.get(cred._id);
        if (update) {
          await ctx.db.patch(cred._id, {
            passwordHint: update.passwordHint,
            passwordHintIv: update.passwordHintIv,
            passwordHintDekEncrypted: update.passwordHintDekEncrypted,
            passwordHintDekIv: update.passwordHintDekIv,
            updatedAt: now,
          });
        }
      }

      if (record.familyId !== targetFamilyId) {
        await ctx.db.patch(record._id, {
          familyId: targetFamilyId,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(user._id, { familyId: targetFamilyId });

    const approvedReq = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_accountId", (q) =>
        q.eq("familyId", targetFamilyId).eq("accountId", user._id),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .first();

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
        await deleteFamilyInvites(ctx, user.familyId);
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

export const rotatePasscode = familyBoundMutation({
  args: {
    previousMasterKeyEncrypted: v.string(),
    masterKeyEncrypted: v.string(),
    masterKeyIv: v.string(),
    masterKeySalt: v.string(),
    kdfIterations: v.optional(v.number()),
    cryptoVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { familyId } = ctx;

    const parsed = RotatePasscodeInputSchema.safeParse({
      previousMasterKeyEncrypted: args.previousMasterKeyEncrypted,
      masterKeyEncrypted: args.masterKeyEncrypted,
      masterKeyIv: args.masterKeyIv,
      masterKeySalt: args.masterKeySalt,
      kdfIterations: args.kdfIterations,
      cryptoVersion: args.cryptoVersion,
    });
    if (!parsed.success) {
      throw new Error(
        `Invalid key material: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const family = await ctx.db.get(familyId);
    if (!family) throw new Error("Family not found");

    if (
      !family.masterKeyEncrypted ||
      !family.masterKeyIv ||
      !family.masterKeySalt
    ) {
      throw new Error("Family encryption is not initialized yet");
    }

    if (family.masterKeyEncrypted !== args.previousMasterKeyEncrypted) {
      throw new Error(
        "CONFLICT: 家族の暗号鍵情報が他の操作により更新されています。最新の状態を取得してやり直してください。",
      );
    }

    const { kdfIterations, cryptoVersion } = resolveKdfParams(
      args.kdfIterations ?? family.kdfIterations,
      args.cryptoVersion ?? family.cryptoVersion,
    );

    await ctx.db.patch(familyId, {
      masterKeyEncrypted: args.masterKeyEncrypted,
      masterKeyIv: args.masterKeyIv,
      masterKeySalt: args.masterKeySalt,
      kdfIterations,
      cryptoVersion,
      updatedAt: Date.now(),
    });

    const members = await ctx.db
      .query("users")
      .withIndex("by_familyId", (q) => q.eq("familyId", familyId))
      .collect();
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    for (const member of members) {
      if (member._id === ctx.user._id) continue;
      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: member.email,
          payload: {
            template: "passcodeRotated",
            props: {
              displayName: member.displayName || "メンバー",
              familyName: family.name,
              ctaUrl: `${appUrl}/family`,
            },
          },
        },
      );
    }

    return { success: true };
  },
});

export const createFamilyInvite = familyBoundMutation({
  args: {
    ttlMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user, familyId } = ctx;
    const DEFAULT_TTL_MINUTES = 7 * 24 * 60; // 7日 (10080分)
    const MIN_TTL_MINUTES = 15; // 15分
    const MAX_TTL_MINUTES = 30 * 24 * 60; // 30日 (43200分)

    const rawTtl = args.ttlMinutes ?? DEFAULT_TTL_MINUTES;
    if (!Number.isFinite(rawTtl) || !Number.isInteger(rawTtl)) {
      throw new Error("ttlMinutes must be a finite integer");
    }
    const clampedTtl = Math.min(
      Math.max(rawTtl, MIN_TTL_MINUTES),
      MAX_TTL_MINUTES,
    );

    const code = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + clampedTtl * 60 * 1000;

    const inviteId = await ctx.db.insert("familyInvites", {
      familyId,
      code,
      createdBy: user.userId,
      createdAt: now,
      expiresAt,
      useCount: 0,
    });

    return {
      _id: inviteId,
      code,
      expiresAt,
      familyId,
    };
  },
});

export const revokeFamilyInvite = familyBoundMutation({
  args: {
    inviteId: v.id("familyInvites"),
  },
  handler: async (ctx, args) => {
    const { familyId } = ctx;
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.familyId !== familyId) {
      throw new Error("Invite not found or access denied");
    }
    if (invite.revokedAt != null) {
      return { success: true };
    }
    await ctx.db.patch(invite._id, {
      revokedAt: Date.now(),
    });
    return { success: true };
  },
});

export const getFamilyInvites = familyBoundQuery({
  args: {},
  handler: async (ctx) => {
    const { familyId } = ctx;
    const now = Date.now();
    const invites = await ctx.db
      .query("familyInvites")
      .withIndex("by_familyId", (q) => q.eq("familyId", familyId))
      .collect();

    // 作成日時の新しい順
    invites.sort((a, b) => b.createdAt - a.createdAt);

    return invites.map((inv) => {
      let status: "active" | "expired" | "revoked" = "active";
      if (inv.revokedAt != null) {
        status = "revoked";
      } else if (inv.expiresAt < now) {
        status = "expired";
      }
      return {
        ...inv,
        status,
      };
    });
  },
});

export const cleanupExpiredFamilyInvitesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30日
    const cutoff = Date.now() - RETENTION_MS;
    // 1回のcron実行あたり最大100件を処理（Convexトランザクション上限への配慮）
    const invites = await ctx.db.query("familyInvites").take(100);

    for (const invite of invites) {
      const isRevokedOld =
        invite.revokedAt != null && invite.revokedAt < cutoff;
      const isExpiredOld = invite.expiresAt < cutoff;
      if (isRevokedOld || isExpiredOld) {
        // 参加申請（監査証跡）から参照されていないかインデックスでチェック
        const referenced = await ctx.db
          .query("joinRequests")
          .withIndex("by_invitedByCode", (q) =>
            q.eq("invitedByCode", invite._id),
          )
          .first();
        if (!referenced) {
          await ctx.db.delete(invite._id);
        }
      }
    }
  },
});

export const getFamilyPublicInfo = authenticatedQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("familyInvites")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!invite) {
      throw new Error("Invalid invite code");
    }
    if (invite.revokedAt != null) {
      throw new Error("This invite link has been revoked");
    }
    if (invite.expiresAt < Date.now()) {
      throw new Error("This invite link has expired");
    }

    const family = await ctx.db.get(invite.familyId);
    if (!family) {
      throw new Error("Family not found");
    }

    return {
      id: family._id,
      name: family.name,
      expiresAt: invite.expiresAt,
    };
  },
});

export const createJoinRequest = authenticatedMutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const invite = await ctx.db
      .query("familyInvites")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();

    if (!invite) {
      throw new Error("Invalid invite code");
    }
    if (invite.revokedAt != null) {
      throw new Error("This invite link has been revoked");
    }
    if (invite.expiresAt < Date.now()) {
      throw new Error("This invite link has expired");
    }

    const family = await ctx.db.get(invite.familyId);
    if (!family) {
      throw new Error("Family not found");
    }

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

    // Increment useCount on the invite
    await ctx.db.patch(invite._id, {
      useCount: invite.useCount + 1,
    });

    const requestId = await ctx.db.insert("joinRequests", {
      familyId: family._id,
      userId: user.userId,
      accountId: user._id,
      invitedByCode: invite._id,
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

export const backfillKdfMetadataInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allFamilies = await ctx.db.query("families").collect();
    let patched = 0;
    for (const family of allFamilies) {
      if (
        family.kdfIterations === undefined ||
        family.cryptoVersion === undefined
      ) {
        await ctx.db.patch(family._id, {
          kdfIterations: family.kdfIterations ?? LEGACY_PBKDF2_ITERATIONS,
          cryptoVersion: family.cryptoVersion ?? 1,
        });
        patched++;
      }
    }
    return { patched, total: allFamilies.length };
  },
});

const EXPORT_VAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

/**
 * 家族メンバーをグループからキック（削除）するMutation
 * - 被キックユーザーの家族所属を解除
 * - 旧家族マスターキー情報をpendingExportVaultsに30日間退避
 * - 共有レコードのadminsを調停（reconcileAdminsOnLeave）
 * - 被キックユーザーへ通知メールを送信
 */
export const kickMember = familyBoundMutation({
  args: {
    targetAccountId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { user, familyId } = ctx;

    const targetUser = await ctx.db.get(args.targetAccountId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    if (targetUser._id === user._id || targetUser.userId === user.userId) {
      throw new Error(
        "Cannot kick yourself. Use family migration to leave voluntarily.",
      );
    }

    if (targetUser.familyId !== familyId) {
      throw new Error("Target user is not a member of your family");
    }

    const family = await ctx.db.get(familyId);
    if (!family) {
      throw new Error("Family not found");
    }

    // 1. 旧家族マスターキー情報をExport Vaultへ退避
    if (
      family.masterKeyEncrypted &&
      family.masterKeyIv &&
      family.masterKeySalt
    ) {
      const existingVault = await ctx.db
        .query("pendingExportVaults")
        .withIndex("by_accountId", (q) => q.eq("accountId", targetUser._id))
        .first();
      if (existingVault) {
        await ctx.db.delete(existingVault._id);
      }

      await ctx.db.insert("pendingExportVaults", {
        accountId: targetUser._id,
        userId: targetUser.userId,
        oldFamilyId: familyId,
        oldFamilyName: family.name,
        masterKeyEncrypted: family.masterKeyEncrypted,
        masterKeyIv: family.masterKeyIv,
        masterKeySalt: family.masterKeySalt,
        kdfIterations: family.kdfIterations,
        cryptoVersion: family.cryptoVersion,
        createdAt: Date.now(),
        expiresAt: Date.now() + EXPORT_VAULT_TTL_MS,
      });
    }

    // 2. 被キックユーザーがadminsに含まれる共有レコードの管理者リストを調停
    await reconcileAdminsOnLeave(ctx, familyId, targetUser._id);

    // 3. 家族所属を解除（個人所有レコードはownerUserId・暗号化スコープとも維持される）
    await ctx.db.patch(targetUser._id, { familyId: undefined });

    // 4. 通知メールをスケジュール送信
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: targetUser.email,
        payload: {
          template: "memberKicked",
          props: {
            displayName: targetUser.displayName || "メンバー",
            familyName: family.name,
            ctaUrl: `${appUrl}/family`,
            expiresInDays: 30,
          },
        },
      },
    );

    return { success: true };
  },
});

/**
 * 自身の有効なExport Vaultを取得するQuery
 */
export const getMyPendingExportVault = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const vault = await ctx.db
      .query("pendingExportVaults")
      .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
      .first();

    if (!vault || vault.expiresAt < Date.now()) {
      return null;
    }

    return vault;
  },
});

/**
 * 自身のExport Vaultを破棄（持ち出しを放棄）するMutation
 */
export const abandonPendingExportVault = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const vault = await ctx.db
      .query("pendingExportVaults")
      .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
      .first();

    if (vault) {
      await ctx.db.delete(vault._id);
    }

    return { success: true };
  },
});

/**
 * 期限切れExport Vaultを定期削除する内部Mutation
 */
export const cleanupExpiredExportVaultsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const allVaults = await ctx.db.query("pendingExportVaults").collect();
    for (const vault of allVaults) {
      if (vault.expiresAt < now) {
        await ctx.db.delete(vault._id);
      }
    }
  },
});

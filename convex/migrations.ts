import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";

/**
 * サービスレコードのバッチマイグレーション用 Mutation
 * accountId が未設定の serviceRecords に対し、userId から対応する users._id を特定して設定する
 */
export const migrateServiceRecordsBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const paginationResult = await ctx.db
      .query("serviceRecords")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let updatedCount = 0;
    let skippedCount = 0;
    let missingUserCount = 0;

    for (const record of paginationResult.page) {
      // 既存レコードで accountId が未設定の場合
      const rec = record as unknown as { accountId?: string };
      if (!rec.accountId) {
        const users = await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", record.userId))
          .collect();

        if (users.length > 0) {
          // familyId が設定されている場合は同じ familyId を持つアカウントを優先、なければ先頭アカウント
          const matchedAccount =
            (record.familyId
              ? users.find((u) => u.familyId === record.familyId)
              : null) || users[0];

          await ctx.db.patch(record._id, {
            accountId: matchedAccount._id,
          });
          updatedCount++;
        } else {
          console.warn(
            `[Migration] No user found for userId: ${record.userId} on serviceRecord: ${record._id}`,
          );
          missingUserCount++;
        }
      } else {
        skippedCount++;
      }
    }

    return {
      continueCursor: paginationResult.continueCursor,
      isDone: paginationResult.isDone,
      updatedCount,
      skippedCount,
      missingUserCount,
    };
  },
});

/**
 * joinRequests のバッチマイグレーション用 Mutation
 * accountId が未設定の joinRequests に対し、userId から対応する users._id を特定して設定する
 */
export const migrateJoinRequestsBatch = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const paginationResult = await ctx.db
      .query("joinRequests")
      .paginate({ cursor: args.cursor ?? null, numItems: batchSize });

    let updatedCount = 0;
    let skippedCount = 0;
    let missingUserCount = 0;

    for (const request of paginationResult.page) {
      if (!request.accountId) {
        const users = await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", request.userId))
          .collect();

        if (users.length > 0) {
          await ctx.db.patch(request._id, {
            accountId: users[0]._id,
          });
          updatedCount++;
        } else {
          missingUserCount++;
        }
      } else {
        skippedCount++;
      }
    }

    return {
      continueCursor: paginationResult.continueCursor,
      isDone: paginationResult.isDone,
      updatedCount,
      skippedCount,
      missingUserCount,
    };
  },
});

/**
 * serviceRecords に accountId を補完する単発マイグレーション Action
 */
export const migrateServiceRecordsAccountId = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let isDone = false;
    let cursor: string | null = null;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalMissingUsers = 0;
    let batchNumber = 1;

    console.log("[Migration] Starting serviceRecords accountId migration...");

    while (!isDone) {
      const result = (await ctx.runMutation(
        internal.migrations.migrateServiceRecordsBatch,
        {
          cursor: cursor || undefined,
          batchSize: args.batchSize ?? 100,
        },
      )) as {
        continueCursor: string;
        isDone: boolean;
        updatedCount: number;
        skippedCount: number;
        missingUserCount: number;
      };

      totalUpdated += result.updatedCount;
      totalSkipped += result.skippedCount;
      totalMissingUsers += result.missingUserCount;
      cursor = result.continueCursor;
      isDone = result.isDone;

      console.log(
        `[Migration] Batch ${batchNumber} complete. Updated: ${result.updatedCount}, Skipped: ${result.skippedCount}, MissingUsers: ${result.missingUserCount}`,
      );
      batchNumber++;
    }

    console.log(
      `[Migration] Finished serviceRecords migration! Total Updated: ${totalUpdated}, Total Skipped: ${totalSkipped}, Total Missing Users: ${totalMissingUsers}`,
    );

    return {
      success: true,
      totalUpdated,
      totalSkipped,
      totalMissingUsers,
    };
  },
});

/**
 * joinRequests に accountId を補完する単発マイグレーション Action
 */
export const migrateJoinRequestsAccountId = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let isDone = false;
    let cursor: string | null = null;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalMissingUsers = 0;

    console.log("[Migration] Starting joinRequests accountId migration...");

    while (!isDone) {
      const result = (await ctx.runMutation(
        internal.migrations.migrateJoinRequestsBatch,
        {
          cursor: cursor || undefined,
          batchSize: args.batchSize ?? 100,
        },
      )) as {
        continueCursor: string;
        isDone: boolean;
        updatedCount: number;
        skippedCount: number;
        missingUserCount: number;
      };

      totalUpdated += result.updatedCount;
      totalSkipped += result.skippedCount;
      totalMissingUsers += result.missingUserCount;
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    console.log(
      `[Migration] Finished joinRequests migration! Total Updated: ${totalUpdated}, Total Skipped: ${totalSkipped}, Total Missing Users: ${totalMissingUsers}`,
    );

    return {
      success: true,
      totalUpdated,
      totalSkipped,
      totalMissingUsers,
    };
  },
});

/**
 * 全マイグレーション（serviceRecords + joinRequests）を一括実行する Action
 */
export const runAllMultiAccountMigrations = internalAction({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recordsResult = (await ctx.runAction(
      internal.migrations.migrateServiceRecordsAccountId,
      {
        batchSize: args.batchSize,
      },
    )) as {
      success: boolean;
      totalUpdated: number;
      totalSkipped: number;
      totalMissingUsers: number;
    };

    const requestsResult = (await ctx.runAction(
      internal.migrations.migrateJoinRequestsAccountId,
      {
        batchSize: args.batchSize,
      },
    )) as {
      success: boolean;
      totalUpdated: number;
      totalSkipped: number;
      totalMissingUsers: number;
    };

    return {
      success: true,
      records: recordsResult,
      joinRequests: requestsResult,
    };
  },
});

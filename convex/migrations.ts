import { computeSortKey } from "../src/utils/index-group";
import { mutation } from "./_generated/server";

/**
 * サービスレコードの Drive 型 ACL 所有権モデル（ownerType, admins, sortKey, ownerFamilyId）へのバックフィル用マイグレーション
 * Convex WebUI または内部スクリプトから実行可能
 */
export const backfillOwnershipModel = mutation({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("serviceRecords").collect();
    let patchedCount = 0;

    for (const record of records) {
      const recordAny = record as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if (!record.sortKey) {
        updates.sortKey = computeSortKey({
          titleReading: record.titleReading,
          title: record.title,
        });
      }

      if (!record.ownerType) {
        const oldVisibility = recordAny.visibility;
        if (oldVisibility === "SHARED") {
          updates.ownerType = "family";
          updates.ownerFamilyId = record.familyId;
          updates.admins = [record.accountId];
        } else {
          updates.ownerType = "user";
          updates.ownerFamilyId = undefined;
          updates.admins = [];
        }
      }

      // 旧フィールド visibility をドキュメントから物理削除
      if (recordAny.visibility !== undefined) {
        updates.visibility = undefined;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(record._id, updates);
        patchedCount++;
      }
    }

    return {
      total: records.length,
      patched: patchedCount,
    };
  },
});

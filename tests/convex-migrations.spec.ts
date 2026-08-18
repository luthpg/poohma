import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("Convex Migrations Tests", () => {
  it("accountId が未設定の serviceRecords に対応する user._id が正しく補完されること", async () => {
    const t = convexTest(schema, modules);

    let userAId!: Id<"users">;
    let userBId!: Id<"users">;
    let record1Id!: Id<"serviceRecords">;
    let record2Id!: Id<"serviceRecords">;
    let record3Id!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      userAId = await ctx.db.insert("users", {
        userId: "legacy_user_a",
        email: "a@example.com",
        updatedAt: Date.now(),
      });

      userBId = await ctx.db.insert("users", {
        userId: "legacy_user_b",
        email: "b@example.com",
        updatedAt: Date.now(),
      });

      // accountId なしのレガシーレコードを作成
      record1Id = await ctx.db.insert("serviceRecords", {
        userId: "legacy_user_a",
        title: "Record 1",
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      } as unknown as {
        userId: string;
        accountId: Id<"users">;
        title: string;
        visibility: "PRIVATE" | "SHARED";
        credentials: [];
        tags: [];
        updatedAt: number;
      });

      record2Id = await ctx.db.insert("serviceRecords", {
        userId: "legacy_user_b",
        title: "Record 2",
        visibility: "SHARED",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      } as unknown as {
        userId: string;
        accountId: Id<"users">;
        title: string;
        visibility: "PRIVATE" | "SHARED";
        credentials: [];
        tags: [];
        updatedAt: number;
      });

      // 既に accountId が設定されているレコード
      record3Id = await ctx.db.insert("serviceRecords", {
        userId: "legacy_user_a",
        accountId: userAId,
        title: "Record 3 (Already Migrated)",
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    // バッチマイグレーションを実行
    const result = await t.mutation(
      internal.migrations.migrateServiceRecordsBatch,
      { batchSize: 10 },
    );

    expect(result.updatedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.missingUserCount).toBe(0);

    // 補完結果を確認
    await t.run(async (ctx) => {
      const rec1 = await ctx.db.get(record1Id);
      expect(rec1?.accountId).toBe(userAId);

      const rec2 = await ctx.db.get(record2Id);
      expect(rec2?.accountId).toBe(userBId);

      const rec3 = await ctx.db.get(record3Id);
      expect(rec3?.accountId).toBe(userAId);
    });
  });

  it("accountId が未設定の joinRequests に対応する user._id が正しく補完されること", async () => {
    const t = convexTest(schema, modules);

    let userAId!: Id<"users">;
    let familyId!: Id<"families">;
    let reqId!: Id<"joinRequests">;

    await t.run(async (ctx) => {
      userAId = await ctx.db.insert("users", {
        userId: "applicant_user",
        email: "app@example.com",
        updatedAt: Date.now(),
      });

      familyId = await ctx.db.insert("families", {
        name: "Target Family",
        updatedAt: Date.now(),
      });

      reqId = await ctx.db.insert("joinRequests", {
        familyId,
        userId: "applicant_user",
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.mutation(
      internal.migrations.migrateJoinRequestsBatch,
      { batchSize: 10 },
    );

    expect(result.updatedCount).toBe(1);

    await t.run(async (ctx) => {
      const req = await ctx.db.get(reqId);
      expect(req?.accountId).toBe(userAId);
    });
  });

  it("internalAction migrateServiceRecordsAccountId が全レコードを漏れなく移行すること", async () => {
    const t = convexTest(schema, modules);

    let userAId!: Id<"users">;
    let recordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      userAId = await ctx.db.insert("users", {
        userId: "action_test_user",
        email: "action@example.com",
        updatedAt: Date.now(),
      });

      recordId = await ctx.db.insert("serviceRecords", {
        userId: "action_test_user",
        title: "Action Test Record",
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      } as unknown as {
        userId: string;
        accountId: Id<"users">;
        title: string;
        visibility: "PRIVATE" | "SHARED";
        credentials: [];
        tags: [];
        updatedAt: number;
      });
    });

    const result = await t.action(
      internal.migrations.migrateServiceRecordsAccountId,
      { batchSize: 2 },
    );

    expect(result.success).toBe(true);
    expect(result.totalUpdated).toBe(1);

    await t.run(async (ctx) => {
      const rec = await ctx.db.get(recordId);
      expect(rec?.accountId).toBe(userAId);
    });
  });
});

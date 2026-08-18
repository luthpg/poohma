import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("4. セキュリティ/アーキテクチャ特化テスト (Convex 認証・認可検証)", () => {
  describe("4.1. 認証チェックの検証", () => {
    it("未認証で getRecords を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.records.getRecords, {})).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("未認証で getRecordDetail を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);

      let recordId!: Id<"serviceRecords">;
      await t.run(async (ctx) => {
        recordId = await ctx.db.insert("serviceRecords", {
          userId: "some_user",
          title: "Dummy",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      await expect(
        t.query(api.records.getRecordDetail, { id: recordId }),
      ).rejects.toThrow("Unauthenticated");
    });

    it("未認証で createRecord を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.records.createRecord, {
          title: "Test",
          visibility: "PRIVATE" as const,
          credentials: [],
          tags: [],
        }),
      ).rejects.toThrow("Unauthenticated");
    });
  });

  describe("4.2. クロスユーザー・クロスファミリー認可の検証 (RLS)", () => {
    it("他ユーザー of PRIVATE レコードに対して getRecordDetail を実行した場合、アクセス拒否されること", async () => {
      const t = convexTest(schema, modules);

      let recordAId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
        // ユーザーA と B
        await ctx.db.insert("users", {
          userId: "user_a",
          email: "a@example.com",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_b",
          email: "b@example.com",
          updatedAt: Date.now(),
        });

        // ユーザーAの PRIVATE レコード
        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_a",
          title: "User A Private",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      // ユーザーBがユーザーAのPRIVATEレコードにアクセスを試みる
      const userB = t.withIdentity({
        subject: "user_b",
        email: "b@example.com",
      });

      await expect(
        userB.query(api.records.getRecordDetail, { id: recordAId }),
      ).rejects.toThrow("Access denied");
    });

    it("他人のレコードを updateRecord で更新しようとした場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);

      let recordAId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Test Family",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_a",
          email: "a@example.com",
          familyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_b",
          email: "b@example.com",
          familyId,
          updatedAt: Date.now(),
        });

        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_a",
          familyId,
          title: "User A Record",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      // ユーザーBがユーザーAのレコード更新を試みる
      const userB = t.withIdentity({
        subject: "user_b",
        email: "b@example.com",
      });

      await expect(
        userB.mutation(api.records.updateRecord, {
          id: recordAId,
          data: {
            title: "Hacked!",
            visibility: "PRIVATE" as const,
            credentials: [],
            tags: [],
          },
        }),
      ).rejects.toThrow("Access denied");
    });

    it("他人のレコードを deleteRecord で削除しようとした場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);

      let recordAId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Test Family",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_a",
          email: "a@example.com",
          familyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_b",
          email: "b@example.com",
          familyId,
          updatedAt: Date.now(),
        });

        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_a",
          familyId,
          title: "User A Record",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      // ユーザーBがユーザーAのレコード削除を試みる
      const userB = t.withIdentity({
        subject: "user_b",
        email: "b@example.com",
      });

      await expect(
        userB.mutation(api.records.deleteRecord, { id: recordAId }),
      ).rejects.toThrow("Access denied");
    });

    it("同一ファミリー内のSHAREDレコードは他のメンバーからも取得できること", async () => {
      const t = convexTest(schema, modules);
      let recordAId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Shared Family",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_a",
          email: "a@example.com",
          familyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_b",
          email: "b@example.com",
          familyId,
          updatedAt: Date.now(),
        });

        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_a",
          familyId,
          title: "Shared Record",
          visibility: "SHARED",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      const userB = t.withIdentity({
        subject: "user_b",
        email: "b@example.com",
      });

      const detail = await userB.query(api.records.getRecordDetail, {
        id: recordAId,
      });
      expect(detail.title).toBe("Shared Record");
    });

    it("異なるファミリーに属するレコードに対してはアクセス拒否されること", async () => {
      const t = convexTest(schema, modules);
      let recordAId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
        const family1 = await ctx.db.insert("families", {
          name: "Family 1",
          updatedAt: Date.now(),
        });
        const family2 = await ctx.db.insert("families", {
          name: "Family 2",
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "user_f1",
          email: "f1@example.com",
          familyId: family1,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_f2",
          email: "f2@example.com",
          familyId: family2,
          updatedAt: Date.now(),
        });

        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_f1",
          familyId: family1,
          title: "Family 1 Secret",
          visibility: "SHARED",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      const userF2 = t.withIdentity({
        subject: "user_f2",
        email: "f2@example.com",
      });

      await expect(
        userF2.query(api.records.getRecordDetail, { id: recordAId }),
      ).rejects.toThrow("Access denied");
    });
  });
});

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

        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_a",
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
      ).rejects.toThrow("Only the owner can update");
    });

    it("他人のレコードを deleteRecord で削除しようとした場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);

      let recordAId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
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

        recordAId = await ctx.db.insert("serviceRecords", {
          userId: "user_a",
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
      ).rejects.toThrow("Only the owner can delete");
    });
  });
});

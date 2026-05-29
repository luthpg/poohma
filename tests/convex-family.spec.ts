import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("2.1 家族管理とE2EE鍵ローテーションの統合テスト (Convex版)", () => {
  describe("2.1.1 家族の作成と所属ユーザーの更新", () => {
    it("家族作成時にトランザクションが機能し、作成したユーザーのfamilyIdが紐づくこと", async () => {
      const t = convexTest(schema, modules);

      // シードデータ（ユーザー）
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          userId: "user_a",
          email: "a@example.com",
          updatedAt: Date.now(),
        });
      });

      const userA = t.withIdentity({
        subject: "user_a",
        email: "a@example.com",
      });

      const payload = {
        name: "田中家",
        masterKeyEncrypted: "SGVsbG9Xb3JsZA==",
        masterKeyIv: "SGVsbG9Xb3JsZA==",
        masterKeySalt: "SGVsbG9Xb3JsZA==",
      };

      const familyId = await userA.mutation(api.families.createFamily, payload);

      expect(familyId).toBeDefined();

      const user = await t.run(async (ctx) => {
        return await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", "user_a"))
          .unique();
      });

      expect(user?.familyId).toBe(familyId);
    });
  });

  describe("2.1.2 家族グループ変更時のレコード再暗号化（IDOR対策の検証）", () => {
    it("自分が所有するレコードのみが更新され、他人のレコードIDを混入させてもスキップされること", async () => {
      const t = convexTest(schema, modules);

      let family1Id!: Id<"families">;
      const credAId = "cred_a";
      const credBId = "cred_b";

      // 1. 初期シードデータのインサート
      await t.run(async (ctx) => {
        // 初期家族
        family1Id = await ctx.db.insert("families", {
          name: "F1",
          masterKeyEncrypted: "SGVsbG9Xb3JsZA==",
          masterKeyIv: "SGVsbG9Xb3JsZA==",
          masterKeySalt: "SGVsbG9Xb3JsZA==",
          updatedAt: Date.now(),
        });

        // ユーザーA と ユーザーB
        await ctx.db.insert("users", {
          userId: "ua",
          email: "a@a.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "ub",
          email: "b@b.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });

        // ユーザーAのサービスレコードとクレデンシャル
        await ctx.db.insert("serviceRecords", {
          userId: "ua",
          familyId: family1Id,
          title: "RA",
          visibility: "PRIVATE",
          credentials: [
            {
              id: credAId,
              label: "LabelA",
              loginId: "LoginA",
              passwordHint: "SGVsbG9Xb3JsZA==",
              passwordHintIv: "SGVsbG9Xb3JsZA==",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });

        // ユーザーBのサービスレコードとクレデンシャル
        await ctx.db.insert("serviceRecords", {
          userId: "ub",
          familyId: family1Id,
          title: "RB",
          visibility: "PRIVATE",
          credentials: [
            {
              id: credBId,
              label: "LabelB",
              loginId: "LoginB",
              passwordHint: "SGVsbG9Xb3JsZA==",
              passwordHintIv: "SGVsbG9Xb3JsZA==",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      const userA = t.withIdentity({
        subject: "ua",
        email: "a@a.com",
      });

      // 【悪意のあるペイロード】 他人(ub)のデータを含める
      const maliciousPayload = {
        action: "create" as const,
        name: "新しい家族2",
        masterKeyEncrypted: "SGVsbG9Xb3JsZA==",
        masterKeyIv: "SGVsbG9Xb3JsZA==",
        masterKeySalt: "SGVsbG9Xb3JsZA==",
        credentials: [
          {
            id: credAId,
            passwordHint: "TmV3SGludEE=",
            passwordHintIv: "SGVsbG9Xb3JsZA==",
          },
          {
            id: credBId,
            passwordHint: "TmV3SGludEI=",
            passwordHintIv: "SGVsbG9Xb3JsZA==",
          },
        ],
      };

      const result = await userA.mutation(
        api.families.changeFamily,
        maliciousPayload,
      );

      expect(result.success).toBe(true);
      expect(result.familyId).toBeDefined();

      // DBの検証
      await t.run(async (ctx) => {
        // ユーザーAの家族IDが新家族のものに更新されていること
        const updatedUserA = await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", "ua"))
          .unique();
        expect(updatedUserA?.familyId).toBe(result.familyId);

        // Aのクレデンシャルは新しいものに更新されていること
        const recordA = await ctx.db
          .query("serviceRecords")
          .withIndex("by_userId", (q) => q.eq("userId", "ua"))
          .unique();
        expect(recordA?.credentials[0].passwordHint).toBe("TmV3SGludEE=");

        // Bのクレデンシャルは影響を受けず、古いまま(B64_VALID)であること
        const recordB = await ctx.db
          .query("serviceRecords")
          .withIndex("by_userId", (q) => q.eq("userId", "ub"))
          .unique();
        expect(recordB?.credentials[0].passwordHint).toBe("SGVsbG9Xb3JsZA==");
      });
    });
  });
});

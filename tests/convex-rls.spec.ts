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
      let someUserId!: Id<"users">;
      await t.run(async (ctx) => {
        someUserId = await ctx.db.insert("users", {
          userId: "some_user",
          email: "some@example.com",
          updatedAt: Date.now(),
        });
        recordId = await ctx.db.insert("serviceRecords", {
          userId: "some_user",
          accountId: someUserId,
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

    it("自分が所有するPRIVATEレコードは getRecordDetail で正常に取得できること", async () => {
      const t = convexTest(schema, modules);
      let recordId!: Id<"serviceRecords">;
      let userAId!: Id<"users">;
      await t.run(async (ctx) => {
        userAId = await ctx.db.insert("users", {
          userId: "user_owner",
          email: "owner@example.com",
          updatedAt: Date.now(),
        });
        recordId = await ctx.db.insert("serviceRecords", {
          userId: "user_owner",
          accountId: userAId,
          title: "My Private Record",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });
      const owner = t.withIdentity({
        subject: "user_owner",
        email: "owner@example.com",
      });
      const detail = await owner.query(api.records.getRecordDetail, {
        id: recordId,
      });
      expect(detail.title).toBe("My Private Record");
    });
  });

  describe("4.2. クロスユーザー・クロスファミリー認可の検証 (RLS)", () => {
    it("他ユーザー of PRIVATE レコードに対して getRecordDetail を実行した場合、アクセス拒否されること", async () => {
      const t = convexTest(schema, modules);

      let recordAId!: Id<"serviceRecords">;
      let userAId!: Id<"users">;

      await t.run(async (ctx) => {
        // ユーザーA と B
        userAId = await ctx.db.insert("users", {
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
          accountId: userAId,
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
      let userAId!: Id<"users">;

      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Test Family",
          updatedAt: Date.now(),
        });
        userAId = await ctx.db.insert("users", {
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
          accountId: userAId,
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
      let userAId!: Id<"users">;

      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Test Family",
          updatedAt: Date.now(),
        });
        userAId = await ctx.db.insert("users", {
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
          accountId: userAId,
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
      let userAId!: Id<"users">;

      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Shared Family",
          updatedAt: Date.now(),
        });
        userAId = await ctx.db.insert("users", {
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
          accountId: userAId,
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
      let userF1Id!: Id<"users">;

      await t.run(async (ctx) => {
        const family1 = await ctx.db.insert("families", {
          name: "Family 1",
          updatedAt: Date.now(),
        });
        const family2 = await ctx.db.insert("families", {
          name: "Family 2",
          updatedAt: Date.now(),
        });

        userF1Id = await ctx.db.insert("users", {
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
          accountId: userF1Id,
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

    it("異なるFamilyのSHAREDレコード(暗号化データを含む)が getRecords の一覧結果に一切含まれないこと", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const family1 = await ctx.db.insert("families", {
          name: "Family 1",
          updatedAt: Date.now(),
        });
        const family2 = await ctx.db.insert("families", {
          name: "Family 2",
          updatedAt: Date.now(),
        });
        const userF1Id = await ctx.db.insert("users", {
          userId: "user_leak_f1",
          email: "leakf1@example.com",
          familyId: family1,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_leak_f2",
          email: "leakf2@example.com",
          familyId: family2,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("serviceRecords", {
          userId: "user_leak_f1",
          accountId: userF1Id,
          familyId: family1,
          title: "Family1の秘密レコード",
          visibility: "SHARED",
          credentials: [
            {
              id: "cred_secret",
              label: "secret label",
              passwordHint: "encrypted_hint_blob",
              passwordHintIv: "encrypted_iv_blob",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });
      });
      const userF2 = t.withIdentity({
        subject: "user_leak_f2",
        email: "leakf2@example.com",
      });
      const records = await userF2.query(api.records.getRecords, {});
      expect(records).toHaveLength(0);
      expect(JSON.stringify(records)).not.toContain("encrypted_hint_blob");
    });
  });

  describe("4.3 一括操作(bulk mutation)の認可検証", () => {
    it("他人が所有するPRIVATEレコードを含むdeleteRecordsは、そのレコードでアクセス拒否され、何も削除されないこと", async () => {
      const t = convexTest(schema, modules);
      let family1Id!: Id<"families">;
      let ownRecordId!: Id<"serviceRecords">;
      let othersPrivateId!: Id<"serviceRecords">;
      await t.run(async (ctx) => {
        family1Id = await ctx.db.insert("families", {
          name: "Family 1",
          updatedAt: Date.now(),
        });
        const userAId = await ctx.db.insert("users", {
          userId: "user_bulk_a",
          email: "bulka@example.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });
        const userBId = await ctx.db.insert("users", {
          userId: "user_bulk_b",
          email: "bulkb@example.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });
        ownRecordId = await ctx.db.insert("serviceRecords", {
          userId: "user_bulk_b",
          accountId: userBId,
          familyId: family1Id,
          title: "Bの自分のレコード",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
        othersPrivateId = await ctx.db.insert("serviceRecords", {
          userId: "user_bulk_a",
          accountId: userAId,
          familyId: family1Id,
          title: "AのPRIVATEレコード",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });
      const userB = t.withIdentity({
        subject: "user_bulk_b",
        email: "bulkb@example.com",
      });

      await expect(
        userB.mutation(api.records.deleteRecords, {
          ids: [ownRecordId, othersPrivateId],
        }),
      ).rejects.toThrow("Access denied");

      await t.run(async (ctx) => {
        expect(await ctx.db.get(ownRecordId)).not.toBeNull();
        expect(await ctx.db.get(othersPrivateId)).not.toBeNull();
      });
    });

    it("同一FamilyのSHAREDレコードは、所有者以外のメンバーでもdeleteRecordsで削除できること(仕様通りの許可系)", async () => {
      const t = convexTest(schema, modules);
      let sharedRecordId!: Id<"serviceRecords">;
      await t.run(async (ctx) => {
        const familyId = await ctx.db.insert("families", {
          name: "Family Shared",
          updatedAt: Date.now(),
        });
        const userAId = await ctx.db.insert("users", {
          userId: "user_bulk_owner",
          email: "bulkowner@example.com",
          familyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "user_bulk_member",
          email: "bulkmember@example.com",
          familyId,
          updatedAt: Date.now(),
        });
        sharedRecordId = await ctx.db.insert("serviceRecords", {
          userId: "user_bulk_owner",
          accountId: userAId,
          familyId,
          title: "共有レコード",
          visibility: "SHARED",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });
      const userMember = t.withIdentity({
        subject: "user_bulk_member",
        email: "bulkmember@example.com",
      });

      await userMember.mutation(api.records.deleteRecords, {
        ids: [sharedRecordId],
      });

      await t.run(async (ctx) => {
        expect(await ctx.db.get(sharedRecordId)).toBeNull();
      });
    });
  });
});

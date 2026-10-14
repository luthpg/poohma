import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { mockCryptoMaterials } from "./test-helpers";

const modules = import.meta.glob("../convex/**/*.ts");

describe("クレデンシャル個別追加・更新 API (createCredential / updateCredential)", () => {
  it("createCredential: 正常系および expectedRevision とヒント完全性の検証", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;
    let userId!: Id<"users">;
    let recordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        ...mockCryptoMaterials,
        name: "Test Family",
        updatedAt: Date.now(),
      });
      userId = await ctx.db.insert("users", {
        createdAt: Date.now(),
        familyRole: "admin",
        userId: "test_user_uid",
        email: "test@example.com",
        familyId,
        updatedAt: Date.now(),
      });
      recordId = await ctx.db.insert("serviceRecords", {
        accountId: userId,
        admins: [],
        familyId,
        isArchived: false,
        ownerType: "user",
        revision: 0,
        sortKey: "a",
        stableId: "rec-stable-1",
        tags: [],
        title: "Test Service",
        updatedAt: Date.now(),
        updatedByAccountId: userId,
        userId: "test_user_uid",
      });
    });

    const userClient = t.withIdentity({ subject: "test_user_uid" });

    // 1. ヒント一部欠落時のエラー検証 (hint と iv のみで dek がない)
    await expect(
      userClient.mutation(api.records.createCredential, {
        recordId,
        label: "Google ID",
        loginId: "user@gmail.com",
        passwordHint: "hint-encrypted",
        passwordHintIv: "hint-iv",
      }),
    ).rejects.toThrow("InvalidCredentialError");

    // 2. expectedRevision 不一致時のエラー検証
    await expect(
      userClient.mutation(api.records.createCredential, {
        recordId,
        label: "Google ID",
        loginId: "user@gmail.com",
        expectedRevision: 999, // 不一致
      }),
    ).rejects.toThrow("ConflictError");

    // 3. 正常系: クレデンシャル追加と revision インクリメント
    const credId = await userClient.mutation(api.records.createCredential, {
      recordId,
      label: "Google ID",
      loginId: "user@gmail.com",
      passwordHint: "hint-enc",
      passwordHintIv: "hint-iv",
      passwordHintDekEncrypted: "dek-enc",
      passwordHintDekIv: "dek-iv",
      expectedRevision: 0, // 一致
    });

    expect(credId).toBeDefined();

    // レコードの revision が 1 に更新されていることを確認
    await t.run(async (ctx) => {
      const rec = await ctx.db.get(recordId);
      expect(rec?.revision).toBe(1);

      const cred = await ctx.db.get(credId);
      expect(cred?.label).toBe("Google ID");
      expect(cred?.loginId).toBe("user@gmail.com");
      expect(cred?.passwordHint).toBe("hint-enc");
    });
  });

  it("updateCredential: 未指定フィールドの保持と expectedRevision 競合防止", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;
    let userId!: Id<"users">;
    let recordId!: Id<"serviceRecords">;
    let credId!: Id<"credentials">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        ...mockCryptoMaterials,
        name: "Test Family",
        updatedAt: Date.now(),
      });
      userId = await ctx.db.insert("users", {
        createdAt: Date.now(),
        familyRole: "admin",
        userId: "test_user_uid",
        email: "test@example.com",
        familyId,
        updatedAt: Date.now(),
      });
      recordId = await ctx.db.insert("serviceRecords", {
        accountId: userId,
        admins: [],
        familyId,
        isArchived: false,
        ownerType: "user",
        revision: 1,
        sortKey: "a",
        stableId: "rec-stable-1",
        tags: [],
        title: "Test Service",
        updatedAt: Date.now(),
        updatedByAccountId: userId,
        userId: "test_user_uid",
      });
      credId = await ctx.db.insert("credentials", {
        recordId,
        stableId: "cred-stable-1",
        label: "Old Label",
        loginId: "existing@gmail.com",
        passwordHint: "old-hint",
        passwordHintIv: "old-iv",
        passwordHintDekEncrypted: "old-dek-enc",
        passwordHintDekIv: "old-dek-iv",
        order: 0,
        updatedAt: Date.now(),
      });
    });

    const userClient = t.withIdentity({ subject: "test_user_uid" });

    // 1. expectedRevision 不一致時の競合エラー
    await expect(
      userClient.mutation(api.records.updateCredential, {
        id: credId,
        label: "New Label",
        expectedRevision: 0, // 実際は 1
      }),
    ).rejects.toThrow("ConflictError");

    // 2. ヒント更新時の一部欠落エラー
    await expect(
      userClient.mutation(api.records.updateCredential, {
        id: credId,
        passwordHint: "new-hint",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("InvalidCredentialError");

    // 3. 部分更新 (ヒントのみ更新、loginId は未指定で維持)
    await userClient.mutation(api.records.updateCredential, {
      id: credId,
      passwordHint: "new-hint",
      passwordHintIv: "new-iv",
      passwordHintDekEncrypted: "new-dek-enc",
      passwordHintDekIv: "new-dek-iv",
      expectedRevision: 1,
    });

    await t.run(async (ctx) => {
      const cred = await ctx.db.get(credId);
      // 未指定だった label と loginId が保持されていること (消去されていないこと)
      expect(cred?.label).toBe("Old Label");
      expect(cred?.loginId).toBe("existing@gmail.com");
      // ヒントが更新されていること
      expect(cred?.passwordHint).toBe("new-hint");
      expect(cred?.passwordHintIv).toBe("new-iv");

      // レコードの revision がインクリメントされていること
      const rec = await ctx.db.get(recordId);
      expect(rec?.revision).toBe(2);
    });
  });
});

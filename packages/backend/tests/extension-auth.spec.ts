import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { mockCryptoMaterials } from "./test-helpers";

const modules = import.meta.glob("../convex/**/*.ts");

describe("拡張機能連携認証 API (extensionAuth: issueSyncToken / redeemSyncToken)", () => {
  it("正常系: issueSyncToken でコードを発行し、redeemSyncToken で検証・即時消費できること", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;
    let userId!: Id<"users">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        ...mockCryptoMaterials,
        name: "Test Family",
        updatedAt: Date.now(),
      });
      userId = await ctx.db.insert("users", {
        createdAt: Date.now(),
        familyRole: "admin",
        userId: "firebase_uid_123",
        email: "test@example.com",
        displayName: "テストユーザー",
        familyId,
        updatedAt: Date.now(),
      });
    });

    const userClient = t.withIdentity({ subject: "firebase_uid_123" });

    // 1. issueSyncToken: 短命コード発行
    const nonce = "test-nonce-uuid-1";
    const issueRes = await userClient.mutation(
      api.extensionAuth.issueSyncToken,
      {
        nonce,
      },
    );

    expect(issueRes.success).toBe(true);
    expect(typeof issueRes.code).toBe("string");
    expect(issueRes.code.length).toBeGreaterThan(0);
    expect(issueRes.expiresAt).toBeGreaterThan(Date.now());

    // 2. redeemSyncToken: 未認証クライアントから検証・消費
    const redeemRes = await t.mutation(api.extensionAuth.redeemSyncToken, {
      nonce,
      code: issueRes.code,
    });

    expect(redeemRes.success).toBe(true);
    expect(redeemRes.user._id).toBe(userId);
    expect(redeemRes.user.userId).toBe("firebase_uid_123");
    expect(redeemRes.user.displayName).toBe("テストユーザー");
    expect(redeemRes.user.email).toBe("test@example.com");
    expect(redeemRes.user.familyId).toBe(familyId);
    expect(Array.isArray(redeemRes.accounts)).toBe(true);
    expect(redeemRes.accounts.length).toBe(1);
    expect(redeemRes.accounts[0]?._id).toBe(userId);
    expect(redeemRes.family).not.toBeNull();
    expect(redeemRes.family?.masterKeyEncrypted).toBe(
      mockCryptoMaterials.masterKeyEncrypted,
    );

    // 3. 即時物理削除（再送防止）の検証: 同一コードで再 redeem するとエラー
    await expect(
      t.mutation(api.extensionAuth.redeemSyncToken, {
        nonce,
        code: issueRes.code,
      }),
    ).rejects.toThrow("Invalid or expired sync code");
  });

  it("異常系: 不正な nonce や無効な code は拒否されること", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        createdAt: Date.now(),
        familyRole: "admin",
        userId: "firebase_uid_456",
        email: "user2@example.com",
        updatedAt: Date.now(),
      });
    });

    const userClient = t.withIdentity({ subject: "firebase_uid_456" });
    const issueRes = await userClient.mutation(
      api.extensionAuth.issueSyncToken,
      {
        nonce: "correct-nonce",
      },
    );

    // 異なる nonce では失敗
    await expect(
      t.mutation(api.extensionAuth.redeemSyncToken, {
        nonce: "wrong-nonce",
        code: issueRes.code,
      }),
    ).rejects.toThrow("Invalid or expired sync code");

    // 存在しない code では失敗
    await expect(
      t.mutation(api.extensionAuth.redeemSyncToken, {
        nonce: "correct-nonce",
        code: "non-existent-code",
      }),
    ).rejects.toThrow("Invalid or expired sync code");
  });

  it("期限切れ検証: 期限が切れたコードは redeem 時に拒否・削除されること", async () => {
    const t = convexTest(schema, modules);

    let userId!: Id<"users">;

    await t.run(async (ctx) => {
      userId = await ctx.db.insert("users", {
        createdAt: Date.now(),
        familyRole: "admin",
        userId: "firebase_uid_expired",
        email: "expired@example.com",
        updatedAt: Date.now(),
      });

      // 過去の expiresAt で直接挿入
      await ctx.db.insert("extensionSyncCodes", {
        accountId: userId,
        nonce: "expired-nonce",
        code: "expired-code",
        expiresAt: Date.now() - 1000, // すでに失効
      });
    });

    await expect(
      t.mutation(api.extensionAuth.redeemSyncToken, {
        nonce: "expired-nonce",
        code: "expired-code",
      }),
    ).rejects.toThrow("Sync code has expired");

    // クリーンアップジョブで削除されることの検証
    await t.mutation(internal.extensionAuth.cleanupExpiredSyncCodes, {});
    await t.run(async (ctx) => {
      const remaining = await ctx.db
        .query("extensionSyncCodes")
        .withIndex("by_code_nonce", (q) =>
          q.eq("code", "expired-code").eq("nonce", "expired-nonce"),
        )
        .first();
      expect(remaining).toBeNull();
    });
  });
});

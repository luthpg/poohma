import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("users.ts / 認証・認可・セキュリティ境界の検証", () => {
  describe("未認証アクセスの拒否", () => {
    it("未認証で syncUser を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.users.syncUser, { displayName: "x" }),
      ).rejects.toThrow("Unauthenticated");
    });

    it("未認証で createAccount を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.users.createAccount, { name: "x" }),
      ).rejects.toThrow("Unauthenticated");
    });

    it("未認証で getAccounts を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.users.getAccounts, {})).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("未認証で updateProfile を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.users.updateProfile, { displayName: "x" }),
      ).rejects.toThrow("Unauthenticated");
    });

    it("未認証で deleteAccount を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.users.deleteAccount, {})).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("未認証で deleteAllAccounts を実行した場合、例外がスローされること", async () => {
      const t = convexTest(schema, modules);
      await expect(t.mutation(api.users.deleteAllAccounts, {})).rejects.toThrow(
        "Unauthenticated",
      );
    });
  });

  it("syncUserはidentity由来のuid/emailのみを使用し、引数に紛れ込ませた偽装値を受け入れないこと", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({
      subject: "real_uid_123",
      email: "real@example.com",
      emailVerified: true,
    });

    // 未知の引数(userId, email)を渡そうとするとConvexのバリデーション層により拒否されること
    await expect(
      user.mutation(api.users.syncUser, {
        displayName: "Real User",
        userId: "spoofed_admin_uid",
        email: "spoofed@example.com",
      } as never),
    ).rejects.toThrow();

    // 正常な呼び出しでidentity由来の正しい値でDBに登録されること
    await user.mutation(api.users.syncUser, { displayName: "Real User" });

    await t.run(async (ctx) => {
      const spoofed = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", "spoofed_admin_uid"))
        .first();
      expect(spoofed).toBeNull();

      const real = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", "real_uid_123"))
        .first();
      expect(real).not.toBeNull();
      expect(real?.email).toBe("real@example.com");
      expect(real?.userId).toBe("real_uid_123");
    });
  });

  it("emailVerifiedがfalseの場合、syncUserとcreateAccountが拒否され、DBに書き込まれないこと", async () => {
    const t = convexTest(schema, modules);
    const unverified = t.withIdentity({
      subject: "unverified_uid",
      email: "unverified@example.com",
      emailVerified: false,
    });
    await expect(
      unverified.mutation(api.users.syncUser, { displayName: "Unverified" }),
    ).rejects.toThrow("Email is required");
    await expect(
      unverified.mutation(api.users.createAccount, {
        name: "Unverified Account",
      }),
    ).rejects.toThrow("Email is required");
    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", "unverified_uid"))
        .first();
      expect(stored).toBeNull();
    });
  });

  it("getAccountsは呼び出し元のidentity.subjectに紐づくアカウントのみを返し、他ユーザー(他Family)のアカウントを含まないこと", async () => {
    const t = convexTest(schema, modules);
    const userX = t.withIdentity({
      subject: "cross_user_x",
      email: "x@example.com",
      emailVerified: true,
    });
    const userY = t.withIdentity({
      subject: "cross_user_y",
      email: "y@example.com",
      emailVerified: true,
    });
    await userX.mutation(api.users.syncUser, { displayName: "User X" });
    await userY.mutation(api.users.syncUser, { displayName: "User Y" });
    await userX.mutation(api.users.createAccount, { name: "User X Sub" });

    const accountsX = await userX.query(api.users.getAccounts, {});
    const accountsY = await userY.query(api.users.getAccounts, {});

    expect(accountsX).toHaveLength(2);
    expect(accountsX.every((a) => a.userId === "cross_user_x")).toBe(true);
    expect(accountsY).toHaveLength(1);
    expect(accountsY[0].userId).toBe("cross_user_y");
  });

  it("Familyに他メンバーが残っている場合、deleteAccountは共有Familyや他メンバーの所有物を破壊しないこと", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let userBAccountId!: Id<"users">;
    let sharedRecordId!: Id<"serviceRecords">;
    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "共有家族",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "leave_user_a",
        email: "leavea@example.com",
        familyId,
        updatedAt: Date.now(),
      });
      userBAccountId = await ctx.db.insert("users", {
        userId: "leave_user_b",
        email: "leaveb@example.com",
        familyId,
        updatedAt: Date.now(),
      });
      sharedRecordId = await ctx.db.insert("serviceRecords", {
        userId: "leave_user_b",
        accountId: userBAccountId,
        familyId,
        title: "Bの共有レコード",
        visibility: "SHARED",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });
    const userA = t.withIdentity({
      subject: "leave_user_a",
      email: "leavea@example.com",
      emailVerified: true,
    });

    await userA.mutation(api.users.deleteAccount, {});

    await t.run(async (ctx) => {
      expect(await ctx.db.get(familyId)).not.toBeNull();
      expect(await ctx.db.get(sharedRecordId)).not.toBeNull();
      expect(await ctx.db.get(userBAccountId)).not.toBeNull();
      const removedA = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", "leave_user_a"))
        .first();
      expect(removedA).toBeNull();
    });
  });

  it("getUserByFirebaseUid/getUserById は internal 関数であり、クライアント公開apiオブジェクトに含まれないこと", () => {
    // internal関数はクライアント向け api オブジェクトには定義されず、境界が保護されていることを確認
    const hasGetUserByFirebaseUid = "getUserByFirebaseUid" in api.users;
    const hasGetUserById = "getUserById" in api.users;
    expect(hasGetUserByFirebaseUid).toBe(false);
    expect(hasGetUserById).toBe(false);
  });
});

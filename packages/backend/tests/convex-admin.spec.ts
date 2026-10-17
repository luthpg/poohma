import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function setupTest() {
  return convexTest(schema, modules);
}

describe("Convex Admin API & System Admin Authorization", () => {
  const originalAdminEmails = process.env.ADMIN_EMAILS;

  beforeEach(() => {
    process.env.ADMIN_EMAILS = "admin@poohma.app,owner@example.com";
  });

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
  });

  describe("管理者認可ガード (assertSystemAdmin)", () => {
    it("未ログイン時は Unauthenticated エラーで拒否されること", async () => {
      const t = setupTest();

      await expect(t.query(api.admin.stats.getSystemStats, {})).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("メールアドレス未確認（emailVerified: false）の場合は拒否されること", async () => {
      const t = setupTest();
      const unverifiedT = t.withIdentity({
        subject: "user_unverified",
        email: "admin@poohma.app",
        emailVerified: false,
      });

      await expect(
        unverifiedT.query(api.admin.stats.getSystemStats, {}),
      ).rejects.toThrow("Unauthenticated");
    });

    it("ADMIN_EMAILS に含まれない一般ユーザーは Forbidden で拒否されること", async () => {
      const t = setupTest();
      const regularUserT = t.withIdentity({
        subject: "regular_user",
        email: "regular@gmail.com",
        emailVerified: true,
      });

      await expect(
        regularUserT.query(api.admin.stats.getSystemStats, {}),
      ).rejects.toThrow("Forbidden");
    });

    it("ADMIN_EMAILS が未設定または空の場合はフェイルセーフで拒否されること", async () => {
      process.env.ADMIN_EMAILS = "";
      const t = setupTest();
      const adminT = t.withIdentity({
        subject: "admin_user",
        email: "admin@poohma.app",
        emailVerified: true,
      });

      await expect(
        adminT.query(api.admin.stats.getSystemStats, {}),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("管理者向け機能 (Contacts / Stats / Users)", () => {
    it("許可された管理者はシステム全体統計を取得できること", async () => {
      const t = setupTest();
      const adminT = t.withIdentity({
        subject: "admin_1",
        email: "admin@poohma.app",
        emailVerified: true,
      });

      // データをシード
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          userId: "user_1",
          email: "user1@example.com",
          familyRole: "viewer",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.insert("families", {
          name: "田中家",
          masterKeyEncrypted: "enc",
          masterKeyIv: "iv",
          masterKeySalt: "salt",
          kdfIterations: 300000,
          cryptoVersion: 1,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("contacts", {
          name: "問い合わせ太郎",
          email: "inquiry@example.com",
          category: "要望",
          message: "テストメッセージです",
          createdAt: Date.now(),
          status: "UNREAD",
        });
      });

      const stats = await adminT.query(api.admin.stats.getSystemStats, {});
      expect(stats.totalUsers).toBe(1);
      expect(stats.totalFamilies).toBe(1);
      expect(stats.unreadContacts).toBe(1);
      expect(stats.newUsersLast7Days).toBe(1);
    });

    it("許可された管理者はお問い合わせ一覧の取得とステータス更新を行えること", async () => {
      const t = setupTest();
      const adminT = t.withIdentity({
        subject: "admin_1",
        email: "admin@poohma.app",
        emailVerified: true,
      });

      let contactId: Id<"contacts"> | undefined;
      await t.run(async (ctx) => {
        contactId = await ctx.db.insert("contacts", {
          name: "鈴木 一郎",
          email: "suzuki@example.com",
          category: "不具合報告",
          message: "ログインができません",
          createdAt: Date.now(),
          status: "UNREAD",
        });
      });

      // お問い合わせ一覧取得
      const contacts = await adminT.query(api.admin.contacts.getContacts, {});
      expect(contacts.length).toBe(1);
      expect(contacts[0]?.name).toBe("鈴木 一郎");
      expect(contacts[0]?.status).toBe("UNREAD");

      // 統計取得
      const contactStats = await adminT.query(
        api.admin.contacts.getContactStats,
        {},
      );
      expect(contactStats.total).toBe(1);
      expect(contactStats.unread).toBe(1);
      expect(contactStats.read).toBe(0);

      expect(contactId).toBeDefined();
      if (!contactId) throw new Error("contactId is required");
      const targetContactId = contactId;

      // ステータス更新（READ）
      await adminT.mutation(api.admin.contacts.updateContactStatus, {
        id: targetContactId,
        status: "READ",
      });

      await t.run(async (ctx) => {
        const updated = await ctx.db.get(targetContactId);
        expect(updated?.status).toBe("READ");
      });
    });

    it("許可された管理者はユーザー一覧・ファミリー一覧を取得でき、検索できること", async () => {
      const t = setupTest();
      const adminT = t.withIdentity({
        subject: "admin_1",
        email: "admin@poohma.app",
        emailVerified: true,
      });

      await t.run(async (ctx) => {
        const famId = await ctx.db.insert("families", {
          name: "佐藤家",
          masterKeyEncrypted: "enc",
          masterKeyIv: "iv",
          masterKeySalt: "salt",
          kdfIterations: 300000,
          cryptoVersion: 1,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "user_sato",
          email: "sato@example.com",
          displayName: "佐藤 次郎",
          familyId: famId,
          familyRole: "admin",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });

      // ユーザー一覧（キーワード検索）
      const users = await adminT.query(api.admin.users.getUsersList, {
        search: "sato",
      });
      expect(users.length).toBe(1);
      expect(users[0]?.email).toBe("sato@example.com");
      expect(users[0]?.displayName).toBe("佐藤 次郎");
      expect(users[0]?.familyName).toBe("佐藤家");

      // ユーザー一覧（メール完全一致）
      const exactEmailUsers = await adminT.query(api.admin.users.getUsersList, {
        search: "sato@example.com",
      });
      expect(exactEmailUsers.length).toBe(1);
      expect(exactEmailUsers[0]?.email).toBe("sato@example.com");

      // ユーザー一覧（同一ドメインの存在しないメアドで誤一致しないこと）
      const noMatchUsers = await adminT.query(api.admin.users.getUsersList, {
        search: "nonexistent@example.com",
      });
      expect(noMatchUsers.length).toBe(0);

      // ファミリー一覧
      const families = await adminT.query(api.admin.users.getFamiliesList, {});
      expect(families.length).toBe(1);
      expect(families[0]?.name).toBe("佐藤家");
      expect(families[0]?.memberCount).toBe(1);
    });

    it("許可された管理者はシステム全体監査ログを照会できること", async () => {
      const t = setupTest();
      const adminT = t.withIdentity({
        subject: "admin_1",
        email: "admin@poohma.app",
        emailVerified: true,
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("auditLogs", {
          action: "ACCOUNT_DELETE",
          userId: "admin_1",
          actorDisplayName: "管理者1",
          ownerType: "user",
          createdAt: Date.now(),
        });
      });

      const logs = await adminT.query(api.admin.system.getSystemAuditLogs, {
        limit: 10,
      });
      expect(logs.length).toBe(1);
      expect(logs[0]?.action).toBe("ACCOUNT_DELETE");
    });

    it("内部pingクエリが正常に応答すること", async () => {
      const t = setupTest();
      const ping = await t.query(internal.admin.system.pingDbInternal, {});
      expect(ping.ok).toBe(true);
      expect(ping.timestamp).toBeGreaterThan(0);
    });

    it("microCMS未設定時は configured: false を返すこと", async () => {
      const t = setupTest();
      const adminT = t.withIdentity({
        subject: "admin_1",
        email: "admin@poohma.app",
        emailVerified: true,
      });

      // 環境変数未設定
      delete process.env.MICROCMS_SERVICE_DOMAIN;
      delete process.env.MICROCMS_API_KEY;

      const infoRes = await adminT.action(api.admin.cms.getCmsInfoList, {});
      expect(infoRes.configured).toBe(false);
      expect(infoRes.contents).toEqual([]);

      const faqRes = await adminT.action(api.admin.cms.getCmsFaqList, {});
      expect(faqRes.configured).toBe(false);
      expect(faqRes.contents).toEqual([]);

      const legalRes = await adminT.action(api.admin.cms.getCmsLegal, {});
      expect(legalRes.configured).toBe(false);
      expect(legalRes.data).toBeNull();
    });
  });
});

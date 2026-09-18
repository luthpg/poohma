import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { computeSortKey } from "../src/utils/index-group";

const modules = import.meta.glob("../convex/**/*.ts");

describe("監査ログ (Audit Log) & 閲覧履歴 (View Log) の統合テスト", () => {
  // 1. 暗号化境界テスト (Zero-Knowledge)
  it("暗号化境界: レコード作成・更新・閲覧時に auditLogs / viewLogs に平文ヒントや暗号資材が保存されないこと", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Security Family",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_audit_actor",
        email: "actor@example.com",
        displayName: "監査アクター",
        familyId,
        updatedAt: Date.now(),
      });
    });

    const actorClient = t.withIdentity({
      subject: "user_audit_actor",
      email: "actor@example.com",
    });

    const secretPlainHint = "ThisIsUltraSecretHint123";
    const dummyCipher = "bW9ja0VuY3J5cHRlZEJhc2U2NA==";
    const dummyIv = "bW9ja0l2MTIzNDbJ";

    // 作成実行
    const recordId = await actorClient.mutation(api.records.createRecord, {
      title: "Secret Vault",
      ownerType: "family",
      credentials: [
        {
          label: "Master Account",
          loginId: "admin",
          passwordHint: secretPlainHint,
          passwordHintIv: dummyIv,
          passwordHintDekEncrypted: dummyCipher,
          passwordHintDekIv: dummyIv,
        },
      ],
      tags: ["security"],
    });

    // 更新実行
    await actorClient.mutation(api.records.updateRecord, {
      id: recordId,
      revision: 0,
      data: {
        title: "Secret Vault (Updated)",
        ownerType: "family",
        credentials: [
          {
            label: "Master Account",
            loginId: "admin_updated",
            passwordHint: secretPlainHint,
            passwordHintIv: dummyIv,
            passwordHintDekEncrypted: dummyCipher,
            passwordHintDekIv: dummyIv,
          },
        ],
        tags: ["security", "updated"],
      },
    });

    // ヒント閲覧実行
    await actorClient.mutation(api.records.logRecordHintView, { recordId });

    // auditLogs 全件取得して走査（変更系のみ2件）
    await t.run(async (ctx) => {
      const logs = await ctx.db.query("auditLogs").collect();
      expect(logs).toHaveLength(2);

      for (const log of logs) {
        const serialized = JSON.stringify(log);
        expect(serialized).not.toContain(secretPlainHint);
        expect(serialized).not.toContain(dummyCipher);
        expect(serialized).not.toContain(dummyIv);

        if (log.action === "RECORD_UPDATE") {
          expect(log.metadata?.changedFields).toBeDefined();
          expect(Array.isArray(log.metadata?.changedFields)).toBe(true);
        }
      }
    });

    // viewLogs 全件取得して走査（閲覧系1件）
    await t.run(async (ctx) => {
      const vLogs = await ctx.db.query("viewLogs").collect();
      expect(vLogs).toHaveLength(1);

      for (const log of vLogs) {
        const serialized = JSON.stringify(log);
        expect(serialized).not.toContain(secretPlainHint);
        expect(serialized).not.toContain(dummyCipher);
        expect(serialized).not.toContain(dummyIv);
        expect(log.recordId).toBe(recordId);
      }
    });
  });

  // 2. 認可分離 & 責務分離テスト (AUDIT-02, AUDIT-03)
  it("認可・責務分離: 監査ログUIには変更系のみが表示され、閲覧ログは分離されてIDOR保護されること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let otherFamilyId!: Id<"families">;
    let userAId!: Id<"users">;
    let personalRecordId!: Id<"serviceRecords">;
    let sharedRecordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Shared Family",
        updatedAt: Date.now(),
      });
      otherFamilyId = await ctx.db.insert("families", {
        name: "Attacker Family",
        updatedAt: Date.now(),
      });
      userAId = await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_a",
        email: "a@example.com",
        displayName: "ユーザーA",
        familyId,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_b",
        email: "b@example.com",
        displayName: "ユーザーB",
        familyId,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_c_attacker",
        email: "c@example.com",
        displayName: "他家族C",
        familyId: otherFamilyId,
        updatedAt: Date.now(),
      });

      // 個人レコード作成
      personalRecordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "A's Private Bank",
        sortKey: computeSortKey("A's Private Bank"),
        userId: "user_a",
        accountId: userAId,
        familyId,
        ownerType: "user",
        admins: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // 家族共有レコード作成
      sharedRecordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Family Wi-Fi",
        sortKey: computeSortKey("Family Wi-Fi"),
        userId: "user_a",
        accountId: userAId,
        familyId,
        ownerType: "family",
        ownerFamilyId: familyId,
        admins: [userAId],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const clientA = t.withIdentity({
      subject: "user_a",
      email: "a@example.com",
    });
    const clientB = t.withIdentity({
      subject: "user_b",
      email: "b@example.com",
    });
    const clientC = t.withIdentity({
      subject: "user_c_attacker",
      email: "c@example.com",
    });

    // A が共有レコードを更新（変更系イベント）
    await clientA.mutation(api.records.updateRecord, {
      id: sharedRecordId,
      revision: 0,
      data: {
        title: "Family Wi-Fi (Updated)",
        ownerType: "family",
        credentials: [],
        tags: [],
      },
    });

    // A が個人レコードと共有レコードのヒントを閲覧（閲覧系イベント）
    await clientA.mutation(api.records.logRecordHintView, {
      recordId: personalRecordId,
    });
    await clientA.mutation(api.records.logRecordHintView, {
      recordId: sharedRecordId,
    });

    // 同一家族の B がレコード別履歴（UI向け）を取得
    const sharedLogsForB = await clientB.query(api.records.getRecordAuditLogs, {
      recordId: sharedRecordId,
    });
    // 変更系（RECORD_UPDATE）のみが含まれ、HINT_VIEW は含まれないこと
    expect(sharedLogsForB).toHaveLength(1);
    expect(sharedLogsForB[0].actorDisplayName).toBe("ユーザーA");
    expect(sharedLogsForB[0].action).toBe("RECORD_UPDATE");

    // B が A の個人レコードの履歴を取得しようとすると拒否されること
    await expect(
      clientB.query(api.records.getRecordAuditLogs, {
        recordId: personalRecordId,
      }),
    ).rejects.toThrow("Access denied");

    // 他家族の C が共有レコードの履歴を取得しようとすると拒否されること
    await expect(
      clientC.query(api.records.getRecordAuditLogs, {
        recordId: sharedRecordId,
      }),
    ).rejects.toThrow("Access denied");

    // 家族アクティビティ一覧（UI向け）に閲覧ログが含まれず、変更系のみ含まれること
    const familyLogs = await clientB.query(api.records.getFamilyAuditLogs, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(familyLogs.page).toHaveLength(1);
    expect(familyLogs.page[0].action).toBe("RECORD_UPDATE");
    expect(familyLogs.page[0].recordId).toBe(sharedRecordId);

    // 閲覧履歴クエリ (getRecordViewLogs) の認可検証
    const sharedViewsForB = await clientB.query(api.records.getRecordViewLogs, {
      recordId: sharedRecordId,
    });
    expect(sharedViewsForB).toHaveLength(1);
    expect(sharedViewsForB[0].actorDisplayName).toBe("ユーザーA");

    // 個人レコードの閲覧履歴は他メンバー B から拒否されること (IDOR防止)
    await expect(
      clientB.query(api.records.getRecordViewLogs, {
        recordId: personalRecordId,
      }),
    ).rejects.toThrow("Access denied");
  });

  // 3. 参照切れフォールバックテスト
  it("参照切れ耐性: ユーザーが退会・アカウント削除された後でも、auditLogs / viewLogs が例外を起こさず表示名を維持すること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let deletedUserAccountId!: Id<"users">;
    let remainingUserAccountId!: Id<"users">;
    let sharedRecordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Fallback Test Family",
        updatedAt: Date.now(),
      });
      deletedUserAccountId = await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_to_be_deleted",
        email: "deleted@example.com",
        displayName: "退会予定パパ",
        familyId,
        updatedAt: Date.now(),
      });
      remainingUserAccountId = await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_remaining",
        email: "remaining@example.com",
        displayName: "残存ママ",
        familyId,
        updatedAt: Date.now(),
      });

      sharedRecordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Shared Account",
        sortKey: computeSortKey("Shared Account"),
        userId: "user_to_be_deleted",
        accountId: deletedUserAccountId,
        familyId,
        ownerType: "family",
        ownerFamilyId: familyId,
        admins: [deletedUserAccountId, remainingUserAccountId],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const deletedClient = t.withIdentity({
      subject: "user_to_be_deleted",
      email: "deleted@example.com",
    });
    const remainingClient = t.withIdentity({
      subject: "user_remaining",
      email: "remaining@example.com",
    });

    // 退会予定ユーザーが変更系ログを生成
    await deletedClient.mutation(api.records.updateRecord, {
      id: sharedRecordId,
      revision: 0,
      data: {
        title: "Shared Account (Updated by Papa)",
        ownerType: "family",
        credentials: [],
        tags: [],
      },
    });

    // 退会予定ユーザーが閲覧ログを生成
    await deletedClient.mutation(api.records.logRecordHintView, {
      recordId: sharedRecordId,
    });

    // ユーザーが退会（deleteAccount）
    await deletedClient.mutation(api.users.deleteAccount, {});

    // 残存ユーザーが家族アクティビティを取得
    const familyLogs = await remainingClient.query(
      api.records.getFamilyAuditLogs,
      {
        paginationOpts: { numItems: 10, cursor: null },
      },
    );

    expect(familyLogs.page.length).toBeGreaterThan(0);
    const targetLog = familyLogs.page.find(
      (l) => l.recordId === sharedRecordId,
    );
    expect(targetLog).toBeDefined();
    // 参照切れ時でもスナップショットされた表示名が返却されること
    expect(targetLog?.actorDisplayName).toBe("退会予定パパ");

    // 残存ユーザーが閲覧履歴を取得
    const viewLogs = await remainingClient.query(
      api.records.getRecordViewLogs,
      {
        recordId: sharedRecordId,
      },
    );
    expect(viewLogs.length).toBeGreaterThan(0);
    expect(viewLogs[0].actorDisplayName).toBe("退会予定パパ");

    // 退会ユーザー自身の監査ログ（ACCOUNT_DELETE）が記録され、UIDで追跡可能なこと
    await t.run(async (ctx) => {
      const userLogs = await ctx.db
        .query("auditLogs")
        .withIndex("by_userId_createdAt", (q) =>
          q.eq("userId", "user_to_be_deleted"),
        )
        .collect();
      const deleteLog = userLogs.find((l) => l.action === "ACCOUNT_DELETE");
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.metadata?.detail).toContain(
        "アカウント削除: 退会予定パパ",
      );
      expect(deleteLog?.metadata?.detail).toContain("家族脱退");
    });
  });

  // 3b. 退会ユーザーの問い合わせ対応テスト: 家族解散を伴う最後の1人の退会および単独ユーザー退会でも ACCOUNT_DELETE が記録され追跡可能なこと
  it("退会ユーザーの問い合わせ対応: 家族消滅・単独退会でも ACCOUNT_DELETE が記録され by_userId_createdAt で追跡できること", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    // パターンA: 家族最後の1人（家族も同時解散）
    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert("families", {
        name: "Solo Family",
        updatedAt: now,
      });
      await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_solo_family",
        email: "solo_family@example.com",
        displayName: "最後の一人",
        familyId,
        updatedAt: now,
      });
    });

    const soloFamilyClient = t.withIdentity({
      subject: "user_solo_family",
      issuer: "https://auth.poohma.test",
    });

    await soloFamilyClient.mutation(api.users.deleteAccount, {});

    // 家族が消滅していること、かつ ACCOUNT_DELETE 監査ログが UID で追跡できること
    await t.run(async (ctx) => {
      const families = await ctx.db.query("families").collect();
      expect(families.length).toBe(0);

      const logs = await ctx.db
        .query("auditLogs")
        .withIndex("by_userId_createdAt", (q) =>
          q.eq("userId", "user_solo_family"),
        )
        .collect();
      const deleteLog = logs.find((l) => l.action === "ACCOUNT_DELETE");
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.metadata?.detail).toContain(
        "アカウント削除: 最後の一人",
      );
      expect(deleteLog?.metadata?.detail).toContain("家族も同時解散");
    });

    // パターンB: 家族未所属の単独ユーザー
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        familyRole: "viewer",
        userId: "user_no_family",
        email: "no_family@example.com",
        displayName: "単独利用ユーザー",
        updatedAt: now,
      });
    });

    const noFamilyClient = t.withIdentity({
      subject: "user_no_family",
      issuer: "https://auth.poohma.test",
    });

    await noFamilyClient.mutation(api.users.deleteAccount, {});

    await t.run(async (ctx) => {
      const logs = await ctx.db
        .query("auditLogs")
        .withIndex("by_userId_createdAt", (q) =>
          q.eq("userId", "user_no_family"),
        )
        .collect();
      const deleteLog = logs.find((l) => l.action === "ACCOUNT_DELETE");
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.metadata?.detail).toBe(
        "アカウント削除: 単独利用ユーザー",
      );
    });
  });

  // 4. 長期間未更新レコード抽出テスト (FR-REC-16)
  it("長期間未更新判定: 180日以上更新がないレコードのみが getStaleRecords で抽出されること", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const oneHundredEightyOneDaysAgo = now - 181 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    let userAccountId!: Id<"users">;

    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert("families", {
        name: "Stale Test Family",
        updatedAt: now,
      });
      userAccountId = await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "user_stale",
        email: "stale@example.com",
        familyId,
        updatedAt: now,
      });

      // 181日前の古いレコード
      await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Old Untouched Record",
        sortKey: computeSortKey("Old Untouched Record"),
        userId: "user_stale",
        accountId: userAccountId,
        familyId,
        ownerType: "user",
        admins: [],
        tags: [],
        updatedAt: oneHundredEightyOneDaysAgo,
      });

      // 10日前の新しいレコード
      await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Fresh Record",
        sortKey: computeSortKey("Fresh Record"),
        userId: "user_stale",
        accountId: userAccountId,
        familyId,
        ownerType: "user",
        admins: [],
        tags: [],
        updatedAt: tenDaysAgo,
      });

      // サンプルレコード（抽出対象外）
      await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Sample Old Record",
        sortKey: computeSortKey("Sample Old Record"),
        userId: "user_stale",
        accountId: userAccountId,
        familyId,
        ownerType: "user",
        admins: [],
        tags: [],
        isSample: true,
        updatedAt: oneHundredEightyOneDaysAgo,
      });
    });

    const client = t.withIdentity({
      subject: "user_stale",
      email: "stale@example.com",
    });

    const staleRecords = await client.query(api.records.getStaleRecords, {
      staleDays: 180,
    });

    expect(staleRecords).toHaveLength(1);
    expect(staleRecords[0].title).toBe("Old Untouched Record");
    expect(staleRecords[0].staleDays).toBeGreaterThanOrEqual(180);
  });

  // 5. クリーンアップ Cron テスト
  it("ライフサイクル: 180日以上前の古い監査ログ・閲覧ログが定期削除されること", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const oneHundredEightyOneDaysAgo = now - 181 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    let oldAuditLogId!: Id<"auditLogs">;
    let recentAuditLogId!: Id<"auditLogs">;
    let oldViewLogId!: Id<"viewLogs">;
    let recentViewLogId!: Id<"viewLogs">;

    await t.run(async (ctx) => {
      // 監査ログ
      oldAuditLogId = await ctx.db.insert("auditLogs", {
        userId: "test_user",
        actorDisplayName: "テストアクター",
        ownerType: "family",
        action: "RECORD_UPDATE",
        createdAt: oneHundredEightyOneDaysAgo,
      });
      recentAuditLogId = await ctx.db.insert("auditLogs", {
        userId: "test_user",
        actorDisplayName: "テストアクター",
        ownerType: "family",
        action: "RECORD_UPDATE",
        createdAt: tenDaysAgo,
      });

      const dummyAccountId = await ctx.db.insert("users", {
        userId: "test_user",
        email: "test@example.com",
        familyRole: "admin",
        updatedAt: now,
      });

      // 閲覧ログ用レコード
      const recordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Test Record",
        sortKey: computeSortKey("Test Record"),
        userId: "test_user",
        accountId: dummyAccountId,
        ownerType: "user",
        admins: [],
        tags: [],
        updatedAt: now,
      });

      // 閲覧ログ
      oldViewLogId = await ctx.db.insert("viewLogs", {
        userId: "test_user",
        actorDisplayName: "テストアクター",
        recordId,
        createdAt: oneHundredEightyOneDaysAgo,
      });
      recentViewLogId = await ctx.db.insert("viewLogs", {
        userId: "test_user",
        actorDisplayName: "テストアクター",
        recordId,
        createdAt: tenDaysAgo,
      });
    });

    // 定期クリーンアップ実行
    await t.mutation(internal.records.cleanupOldAuditLogsInternal, {});
    await t.mutation(internal.records.cleanupOldViewLogsInternal, {});

    await t.run(async (ctx) => {
      // 監査ログの検証
      expect(await ctx.db.get(oldAuditLogId)).toBeNull();
      expect(await ctx.db.get(recentAuditLogId)).not.toBeNull();

      // 閲覧ログの検証
      expect(await ctx.db.get(oldViewLogId)).toBeNull();
      expect(await ctx.db.get(recentViewLogId)).not.toBeNull();
    });
  });

  // 6. AUDIT-04: lastViewedAt / lastViewedByAccountId 更新検証
  it("AUDIT-04: ヒント閲覧時に serviceRecords の lastViewedAt と lastViewedByAccountId が更新されること", async () => {
    const t = convexTest(schema, modules);
    let userAccountId!: Id<"users">;
    let recordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert("families", {
        name: "Viewer Family",
        updatedAt: Date.now(),
      });

      userAccountId = await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "viewer_user",
        email: "viewer@example.com",
        displayName: "閲覧者太郎",
        familyId,
        updatedAt: Date.now(),
      });

      recordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Viewer Target",
        sortKey: computeSortKey("Viewer Target"),
        userId: "viewer_user",
        accountId: userAccountId,
        familyId,
        ownerType: "user",
        admins: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const client = t.withIdentity({
      subject: "viewer_user",
      email: "viewer@example.com",
    });

    const beforeView = Date.now();
    const result = await client.mutation(api.records.logRecordHintView, {
      recordId,
    });

    expect(result.success).toBe(true);
    expect(result.viewedAt).toBeGreaterThanOrEqual(beforeView);

    await t.run(async (ctx) => {
      const record = await ctx.db.get(recordId);
      expect(record?.lastViewedAt).toBe(result.viewedAt);
      expect(record?.lastViewedByAccountId).toBe(userAccountId);
    });
  });

  // 7. CSVエクスポート用マージクエリ検証 (getFamilyAuditAndViewsForExport)
  it("エクスポート: includeViews オプションに応じて変更系のみ、または閲覧系を含む全ログが取得できること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let recordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Export Test Family",
        updatedAt: Date.now(),
      });
      const userId = await ctx.db.insert("users", {
        familyRole: "admin",
        userId: "export_user",
        email: "export@example.com",
        displayName: "エクスポート担当",
        familyId,
        updatedAt: Date.now(),
      });

      recordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Shared Bank",
        sortKey: computeSortKey("Shared Bank"),
        userId: "export_user",
        accountId: userId,
        familyId,
        ownerType: "family",
        ownerFamilyId: familyId,
        admins: [userId],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const client = t.withIdentity({
      subject: "export_user",
      email: "export@example.com",
    });

    // 変更操作
    await client.mutation(api.records.updateRecord, {
      id: recordId,
      revision: 0,
      data: {
        title: "Shared Bank (Updated)",
        ownerType: "family",
        credentials: [],
        tags: [],
      },
    });

    // 閲覧操作
    await client.mutation(api.records.logRecordHintView, { recordId });

    // 1. includeViews: false (デフォルト)
    const auditOnly = await client.query(
      api.records.getFamilyAuditAndViewsForExport,
      { includeViews: false },
    );
    expect(auditOnly).toHaveLength(1);
    expect(auditOnly[0].category).toBe("audit");
    expect(auditOnly[0].action).toBe("RECORD_UPDATE");

    // 2. includeViews: true
    const allLogs = await client.query(
      api.records.getFamilyAuditAndViewsForExport,
      { includeViews: true },
    );
    expect(allLogs).toHaveLength(2);
    const categories = allLogs.map((l) => l.category);
    expect(categories).toContain("audit");
    expect(categories).toContain("view");
    // 新しい順にソートされていること
    expect(allLogs[0].createdAt).toBeGreaterThanOrEqual(allLogs[1].createdAt);
  });

  // 8. マイグレーションテスト (migrateHintViewsToViewLogsInternal)
  it("マイグレーション: 過去の auditLogs 内の HINT_VIEW レコードが viewLogs へ移行され、auditLogs から削除されること", async () => {
    const legacySchema = defineSchema({
      ...schema.tables,
      auditLogs: defineTable({
        ...schema.tables.auditLogs.validator.fields,
        action: v.union(
          v.literal("RECORD_CREATE"),
          v.literal("RECORD_UPDATE"),
          v.literal("RECORD_DELETE"),
          v.literal("HINT_VIEW"),
          v.literal("SHARE_SETTING_CHANGED"),
          v.literal("ADMIN_CHANGED"),
        ),
      }),
    });
    const t = convexTest(legacySchema, modules);
    let recordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      const accountId = await ctx.db.insert("users", {
        userId: "user_mig",
        email: "mig@example.com",
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      recordId = await ctx.db.insert("serviceRecords", {
        stableId: crypto.randomUUID(),
        title: "Mig Target",
        sortKey: computeSortKey("Mig Target"),
        userId: "user_mig",
        accountId,
        ownerType: "user",
        admins: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // 過去形式の HINT_VIEW を直接挿入（テスト用バイパス）
      await ctx.db.insert("auditLogs", {
        userId: "user_mig",
        actorDisplayName: "過去の閲覧者",
        recordId,
        ownerType: "user",
        // biome-ignore lint/suspicious/noExplicitAny: 旧形式ドキュメントシミュレーションのため一時的にany許容
        action: "HINT_VIEW" as any,
        createdAt: 1000,
      });

      // 通常の変更系ログも挿入
      await ctx.db.insert("auditLogs", {
        userId: "user_mig",
        actorDisplayName: "過去の作成者",
        recordId,
        ownerType: "user",
        action: "RECORD_CREATE",
        createdAt: 2000,
      });
    });

    // マイグレーション実行
    const result = await t.mutation(
      internal.records.migrateHintViewsToViewLogsInternal,
      {},
    );
    expect(result.migratedCount).toBe(1);

    await t.run(async (ctx) => {
      // auditLogs には RECORD_CREATE のみが残り、HINT_VIEW は削除されていること
      const remainingAudit = await ctx.db.query("auditLogs").collect();
      expect(remainingAudit).toHaveLength(1);
      expect(remainingAudit[0].action).toBe("RECORD_CREATE");

      // viewLogs に HINT_VIEW が移行されていること
      const views = await ctx.db.query("viewLogs").collect();
      expect(views).toHaveLength(1);
      expect(views[0].actorDisplayName).toBe("過去の閲覧者");
      expect(views[0].recordId).toBe(recordId);
      expect(views[0].createdAt).toBe(1000);
    });
  });
});

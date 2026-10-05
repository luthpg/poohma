import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { computeSortKey } from "../src/utils/index-group";
import {
  createTestFamilyData,
  createTestRecordData,
  createTestUserData,
} from "./test-helpers";

const modules = import.meta.glob("../convex/**/*.ts");

describe("監査ログ (Audit Log) & 閲覧履歴 (View Log) の統合テスト", () => {
  // 1. 暗号化境界テスト (Zero-Knowledge)
  it("暗号化境界: レコード作成・更新・閲覧時に auditLogs / viewLogs に平文ヒントや暗号資材が保存されないこと", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Security Family"),
      );
      await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_audit_actor",
          email: "actor@example.com",
          displayName: "監査アクター",
          familyId,
        }),
      );
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
      familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Shared Family"),
      );
      otherFamilyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Attacker Family"),
      );
      userAId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_a",
          email: "a@example.com",
          displayName: "ユーザーA",
          familyId,
        }),
      );
      await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_b",
          email: "b@example.com",
          displayName: "ユーザーB",
          familyId,
        }),
      );
      await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_c_attacker",
          email: "c@example.com",
          displayName: "他家族C",
          familyId: otherFamilyId,
        }),
      );

      // 個人レコード作成
      personalRecordId = await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "A's Private Bank",
          sortKey: computeSortKey("A's Private Bank"),
          userId: "user_a",
          accountId: userAId,
          familyId,
          ownerType: "user",
        }),
      );

      // 家族共有レコード作成
      sharedRecordId = await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Family Wi-Fi",
          sortKey: computeSortKey("Family Wi-Fi"),
          userId: "user_a",
          accountId: userAId,
          familyId,
          ownerType: "family",
          ownerFamilyId: familyId,
          admins: [userAId],
        }),
      );
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
    expect(sharedLogsForB[0]?.actorDisplayName).toBe("ユーザーA");
    expect(sharedLogsForB[0]?.action).toBe("RECORD_UPDATE");

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
    expect(familyLogs.page[0]?.action).toBe("RECORD_UPDATE");
    expect(familyLogs.page[0]?.recordId).toBe(sharedRecordId);

    // 閲覧履歴クエリ (getRecordViewLogs) の認可検証
    const sharedViewsForB = await clientB.query(api.records.getRecordViewLogs, {
      recordId: sharedRecordId,
    });
    expect(sharedViewsForB).toHaveLength(1);
    expect(sharedViewsForB[0]?.actorDisplayName).toBe("ユーザーA");

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
      familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Fallback Test Family"),
      );
      deletedUserAccountId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_to_be_deleted",
          email: "deleted@example.com",
          displayName: "退会予定パパ",
          familyId,
        }),
      );
      remainingUserAccountId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_remaining",
          email: "remaining@example.com",
          displayName: "残存ママ",
          familyId,
        }),
      );

      sharedRecordId = await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Shared Account",
          sortKey: computeSortKey("Shared Account"),
          userId: "user_to_be_deleted",
          accountId: deletedUserAccountId,
          familyId,
          ownerType: "family",
          ownerFamilyId: familyId,
          admins: [deletedUserAccountId, remainingUserAccountId],
        }),
      );
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
    expect(viewLogs[0]?.actorDisplayName).toBe("退会予定パパ");

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

    // パターンA: 家族最後の1人（家族も同時解散）
    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Solo Family"),
      );
      await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_solo_family",
          email: "solo_family@example.com",
          displayName: "最後の一人",
          familyId,
        }),
      );
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
      await ctx.db.insert(
        "users",
        createTestUserData({
          familyRole: "viewer",
          userId: "user_no_family",
          email: "no_family@example.com",
          displayName: "単独利用ユーザー",
        }),
      );
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
      const familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Stale Test Family"),
      );
      userAccountId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "user_stale",
          email: "stale@example.com",
          familyId,
        }),
      );

      // 181日前の古いレコード
      await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Old Untouched Record",
          sortKey: computeSortKey("Old Untouched Record"),
          userId: "user_stale",
          accountId: userAccountId,
          familyId,
          ownerType: "user",
          updatedAt: oneHundredEightyOneDaysAgo,
        }),
      );

      // 10日前の新しいレコード
      await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Fresh Record",
          sortKey: computeSortKey("Fresh Record"),
          userId: "user_stale",
          accountId: userAccountId,
          familyId,
          ownerType: "user",
          updatedAt: tenDaysAgo,
        }),
      );

      // サンプルレコード（抽出対象外）
      await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Sample Old Record",
          sortKey: computeSortKey("Sample Old Record"),
          userId: "user_stale",
          accountId: userAccountId,
          familyId,
          ownerType: "user",
          isSample: true,
          updatedAt: oneHundredEightyOneDaysAgo,
        }),
      );
    });

    const client = t.withIdentity({
      subject: "user_stale",
      email: "stale@example.com",
    });

    const staleRecords = await client.query(api.records.getStaleRecords, {
      staleDays: 180,
    });

    expect(staleRecords).toHaveLength(1);
    expect(staleRecords[0]?.title).toBe("Old Untouched Record");
    expect(staleRecords[0]?.staleDays).toBeGreaterThanOrEqual(180);
  });

  // 5. クリーンアップ Cron テスト
  it("ライフサイクル: 180日以上前の古い閲覧ログ、および3年以上前の古い監査ログが定期削除されること", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const threeYearsAndOneDayAgo = now - (3 * 365 + 1) * 24 * 60 * 60 * 1000;
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const oneHundredEightyOneDaysAgo = now - 181 * 24 * 60 * 60 * 1000;
    const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

    let oldAuditLogId!: Id<"auditLogs">;
    let recentAuditLogId!: Id<"auditLogs">;
    let oldViewLogId!: Id<"viewLogs">;
    let recentViewLogId!: Id<"viewLogs">;

    await t.run(async (ctx) => {
      // 監査ログ（3年超のものが削除対象、1年前などの3年未満は保持）
      oldAuditLogId = await ctx.db.insert("auditLogs", {
        userId: "test_user",
        actorDisplayName: "テストアクター",
        ownerType: "family",
        action: "RECORD_UPDATE",
        createdAt: threeYearsAndOneDayAgo,
      });
      recentAuditLogId = await ctx.db.insert("auditLogs", {
        userId: "test_user",
        actorDisplayName: "テストアクター",
        ownerType: "family",
        action: "RECORD_UPDATE",
        createdAt: oneYearAgo,
      });

      const testFamilyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Cleanup Test Family"),
      );

      const dummyAccountId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "test_user",
          email: "test@example.com",
          familyId: testFamilyId,
        }),
      );

      // 閲覧ログ用レコード
      const recordId = await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Test Record",
          sortKey: computeSortKey("Test Record"),
          userId: "test_user",
          accountId: dummyAccountId,
          familyId: testFamilyId,
          ownerType: "user",
        }),
      );

      // 閲覧ログ
      oldViewLogId = await ctx.db.insert("viewLogs", {
        accountId: dummyAccountId,
        userId: "test_user",
        actorDisplayName: "テストアクター",
        recordId,
        createdAt: oneHundredEightyOneDaysAgo,
      });
      recentViewLogId = await ctx.db.insert("viewLogs", {
        accountId: dummyAccountId,
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
      const familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Viewer Family"),
      );

      userAccountId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "viewer_user",
          email: "viewer@example.com",
          displayName: "閲覧者太郎",
          familyId,
        }),
      );

      recordId = await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Viewer Target",
          sortKey: computeSortKey("Viewer Target"),
          userId: "viewer_user",
          accountId: userAccountId,
          familyId,
          ownerType: "user",
        }),
      );
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
      familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Export Test Family"),
      );
      const userId = await ctx.db.insert(
        "users",
        createTestUserData({
          userId: "export_user",
          email: "export@example.com",
          displayName: "エクスポート担当",
          familyId,
        }),
      );

      recordId = await ctx.db.insert(
        "serviceRecords",
        createTestRecordData({
          title: "Shared Bank",
          sortKey: computeSortKey("Shared Bank"),
          userId: "export_user",
          accountId: userId,
          familyId,
          ownerType: "family",
          ownerFamilyId: familyId,
          admins: [userId],
        }),
      );
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
    expect(auditOnly[0]?.category).toBe("audit");
    expect(auditOnly[0]?.action).toBe("RECORD_UPDATE");

    // 2. includeViews: true
    const allLogs = await client.query(
      api.records.getFamilyAuditAndViewsForExport,
      { includeViews: true },
    );
    expect(allLogs).toHaveLength(2);
    const categories = allLogs.map((l) => l.category);
    expect(categories).toContain("view");
    // 新しい順にソートされていること
    expect(allLogs[0]?.createdAt).toBeGreaterThanOrEqual(
      allLogs[1]?.createdAt ?? 0,
    );
  });

  it("一般メンバー（viewer）が getFamilyAuditAndViewsForExport を呼び出した場合、Access denied で拒否されること", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert(
        "families",
        createTestFamilyData("Viewer Audit Family"),
      );

      await ctx.db.insert(
        "users",
        createTestUserData({
          familyRole: "viewer",
          userId: "viewer_user",
          email: "viewer@example.com",
          displayName: "一般メンバー",
          familyId,
        }),
      );
    });

    const viewerClient = t.withIdentity({
      subject: "viewer_user",
      email: "viewer@example.com",
    });

    await expect(
      viewerClient.query(api.records.getFamilyAuditAndViewsForExport, {}),
    ).rejects.toThrow("Access denied: Admin role required");
  });

  describe("exportFamilyAuditLogs のテスト", () => {
    it("年指定フィルタおよび全期間取得が正しく機能し、他家族のログは漏洩しないこと（IDOR防止）", async () => {
      const t = convexTest(schema, modules);
      let familyAId!: Id<"families">;
      let familyBId!: Id<"families">;

      await t.run(async (ctx) => {
        familyAId = await ctx.db.insert(
          "families",
          createTestFamilyData("Family A"),
        );
        familyBId = await ctx.db.insert(
          "families",
          createTestFamilyData("Family B"),
        );

        await ctx.db.insert(
          "users",
          createTestUserData({
            familyRole: "viewer",
            userId: "user_a",
            email: "user_a@example.com",
            displayName: "ユーザーA",
            familyId: familyAId,
          }),
        );

        // 2025年のログ (JST 2025-06-01)
        await ctx.db.insert("auditLogs", {
          familyId: familyAId,
          userId: "user_a",
          actorDisplayName: "ユーザーA",
          ownerType: "family",
          action: "RECORD_CREATE",
          metadata: { targetTitle: "2025年レコード" },
          createdAt: new Date("2025-06-01T00:00:00Z").getTime(),
        });

        // 2026年のログ (JST 2026-06-01)
        await ctx.db.insert("auditLogs", {
          familyId: familyAId,
          userId: "user_a",
          actorDisplayName: "ユーザーA",
          ownerType: "family",
          action: "RECORD_UPDATE",
          metadata: { targetTitle: "2026年レコード" },
          createdAt: new Date("2026-06-01T00:00:00Z").getTime(),
        });

        // 別家族 (Family B) の2026年のログ
        await ctx.db.insert("auditLogs", {
          familyId: familyBId,
          userId: "user_b",
          actorDisplayName: "ユーザーB",
          ownerType: "family",
          action: "RECORD_CREATE",
          metadata: { targetTitle: "Family B レコード" },
          createdAt: new Date("2026-06-01T00:00:00Z").getTime(),
        });
      });

      const clientA = t.withIdentity({
        subject: "user_a",
        email: "user_a@example.com",
      });

      // 1. 2026年指定で取得
      const logs2026 = await clientA.query(
        api.auditLogs.exportFamilyAuditLogs,
        {
          year: 2026,
        },
      );
      expect(logs2026).toHaveLength(1);
      expect(logs2026[0]?.targetTitle).toBe("2026年レコード");
      expect(logs2026[0]?.action).toBe("RECORD_UPDATE");

      // 2. 2025年指定で取得
      const logs2025 = await clientA.query(
        api.auditLogs.exportFamilyAuditLogs,
        {
          year: 2025,
        },
      );
      expect(logs2025).toHaveLength(1);
      expect(logs2025[0]?.targetTitle).toBe("2025年レコード");
      expect(logs2025[0]?.action).toBe("RECORD_CREATE");

      // 3. 全期間指定（year: undefined）で取得
      const allLogs = await clientA.query(
        api.auditLogs.exportFamilyAuditLogs,
        {},
      );
      expect(allLogs).toHaveLength(2);
      // Family B のデータは含まれないこと（IDOR防止）
      expect(allLogs.some((l) => l.targetTitle === "Family B レコード")).toBe(
        false,
      );
    });

    it("家族未所属ユーザーが呼び出した場合、エラーになること", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert(
          "users",
          createTestUserData({
            familyRole: "viewer",
            userId: "user_unattached",
            email: "unattached@example.com",
            displayName: "未所属ユーザー",
          }),
        );
      });

      const client = t.withIdentity({
        subject: "user_unattached",
        email: "unattached@example.com",
      });

      await expect(
        client.query(api.auditLogs.exportFamilyAuditLogs, {}),
      ).rejects.toThrow("User does not belong to a family");
    });
  });
});

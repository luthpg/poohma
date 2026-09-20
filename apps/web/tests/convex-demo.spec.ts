import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("デモファミリー定期リセット機能 (convex/demo.ts)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("環境変数が未設定の場合、例外がスローされること", async () => {
    const t = convexTest(schema, modules);
    delete process.env.DEMO_FAMILY_ID;
    delete process.env.DEMO_ADMIN_USER_IDS;
    delete process.env.DEMO_ADMIN_USER_ID;

    await expect(
      t.mutation(internal.demo.resetDemoFamilyInternal, {}),
    ).rejects.toThrow(
      "DEMO_FAMILY_ID or DEMO_ADMIN_USER_IDS is not configured in environment variables.",
    );
  });

  it("存在しないデモファミリーIDの場合、例外がスローされること", async () => {
    const t = convexTest(schema, modules);
    let dummyFamilyId!: Id<"families">;
    await t.run(async (ctx) => {
      dummyFamilyId = await ctx.db.insert("families", {
        name: "Temporary",
        updatedAt: Date.now(),
      });
      await ctx.db.delete(dummyFamilyId);
    });

    process.env.DEMO_FAMILY_ID = dummyFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "admin_user_1";

    await expect(
      t.mutation(internal.demo.resetDemoFamilyInternal, {}),
    ).rejects.toThrow("Demo family not found for ID:");
  });

  it("DEMO_ADMIN_USER_IDS に指定されたユーザーがデモ家族に存在しない場合、例外がスローされること", async () => {
    const t = convexTest(schema, modules);
    let demoFamilyId!: Id<"families">;
    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "Demo Family",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "other_user",
        email: "other@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "unmatched_admin_user";

    await expect(
      t.mutation(internal.demo.resetDemoFamilyInternal, {}),
    ).rejects.toThrow(
      'Configured demo admin ID "unmatched_admin_user" is not a member of demo family.',
    );
  });

  it("DEMO_ADMIN_USER_IDS に指定されたユーザーの familyRole が admin ではない（viewer）場合、例外がスローされること", async () => {
    const t = convexTest(schema, modules);
    let demoFamilyId!: Id<"families">;
    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "Demo Family",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "matched_viewer_user",
        email: "viewer@example.com",
        familyId: demoFamilyId,
        familyRole: "viewer", // admin ではない
        updatedAt: Date.now(),
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "matched_viewer_user";

    await expect(
      t.mutation(internal.demo.resetDemoFamilyInternal, {}),
    ).rejects.toThrow(
      'Configured demo admin ID "matched_viewer_user" does not have familyRole "admin".',
    );
  });

  it("複数管理者の指定のうち、1名でも viewer または未所属が含まれる場合、例外がスローされること", async () => {
    const t = convexTest(schema, modules);
    let demoFamilyId!: Id<"families">;
    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "Demo Family",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "valid_admin",
        email: "admin@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "invalid_viewer",
        email: "viewer@example.com",
        familyId: demoFamilyId,
        familyRole: "viewer",
        updatedAt: Date.now(),
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "valid_admin, invalid_viewer";

    await expect(
      t.mutation(internal.demo.resetDemoFamilyInternal, {}),
    ).rejects.toThrow(
      'Configured demo admin ID "invalid_viewer" does not have familyRole "admin".',
    );
  });

  it("familyRole === 'admin' であっても DEMO_ADMIN_USER_IDS に含まれないユーザーはゲストとしてキックされること", async () => {
    const t = convexTest(schema, modules);
    let demoFamilyId!: Id<"families">;
    let legitimateAdminId!: Id<"users">;
    let rogueAdminId!: Id<"users">;

    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "Demo Family",
        updatedAt: Date.now(),
      });
      legitimateAdminId = await ctx.db.insert("users", {
        userId: "legit_admin_uid",
        email: "legit@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });
      // 手違い等で familyRole が admin になっている非管理者
      rogueAdminId = await ctx.db.insert("users", {
        userId: "rogue_admin_uid",
        email: "rogue@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "legit_admin_uid";

    const res = await t.mutation(internal.demo.resetDemoFamilyInternal, {
      force: true,
    });

    expect(res.success).toBe(true);
    expect(res.kickedGuestsCount).toBe(1);

    await t.run(async (ctx) => {
      const legit = await ctx.db.get(legitimateAdminId);
      const rogue = await ctx.db.get(rogueAdminId);
      expect(legit?.familyId).toBe(demoFamilyId);
      expect(rogue?.familyId).toBeUndefined(); // キックされていること
    });
  });

  it("正常系: コホート間データ隔離（レコード・申請・ログ・招待・移行の完全クリーンアップ）が動作すること", async () => {
    const t = convexTest(schema, modules);

    let demoFamilyId!: Id<"families">;
    let admin1Id!: Id<"users">;
    let admin2Id!: Id<"users">;
    let guest1Id!: Id<"users">;
    let guest2Id!: Id<"users">;

    await t.run(async (ctx) => {
      // 1. デモファミリー作成
      demoFamilyId = await ctx.db.insert("families", {
        name: "デモファミリー（毎日リセット）",
        updatedAt: Date.now(),
      });

      // 2. 管理者ユーザー2名作成 (DEMO_ADMIN_USER_IDS に指定)
      admin1Id = await ctx.db.insert("users", {
        userId: "admin_uid_1",
        email: "admin1@example.com",
        displayName: "デモ管理者1",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      admin2Id = await ctx.db.insert("users", {
        userId: "admin_uid_2",
        email: "admin2@example.com",
        displayName: "デモ管理者2",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      // 3. ゲストユーザー2名作成 (デモファミリー所属)
      guest1Id = await ctx.db.insert("users", {
        userId: "guest_uid_1",
        email: "guest1@example.com",
        displayName: "ゲスト閲覧者1",
        familyId: demoFamilyId,
        familyRole: "viewer",
        updatedAt: Date.now(),
      });

      guest2Id = await ctx.db.insert("users", {
        userId: "guest_uid_2",
        email: "guest2@example.com",
        displayName: "ゲスト閲覧者2",
        familyId: demoFamilyId,
        familyRole: "viewer",
        updatedAt: Date.now(),
      });

      // 4. デモファミリーの共有レコードを作成
      const sharedRecordId = await ctx.db.insert("serviceRecords", {
        title: "過去の共有レコード",
        userId: "guest_uid_1",
        accountId: guest1Id,
        familyId: demoFamilyId,
        ownerType: "family",
        ownerFamilyId: demoFamilyId,
        admins: [admin1Id],
        tags: ["テスト"],
        stableId: crypto.randomUUID(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("credentials", {
        recordId: sharedRecordId,
        stableId: crypto.randomUUID(),
        label: "ログイン",
        loginId: "shared@example.com",
        updatedAt: Date.now(),
      });

      // 5. ゲスト1が作成した個人所有レコードを作成 (ownerType: "user")
      const guestPrivateRecordId = await ctx.db.insert("serviceRecords", {
        title: "ゲストの個人レコード",
        userId: "guest_uid_1",
        accountId: guest1Id,
        familyId: demoFamilyId,
        ownerType: "user",
        admins: [],
        tags: ["プライベート"],
        stableId: crypto.randomUUID(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("credentials", {
        recordId: guestPrivateRecordId,
        stableId: crypto.randomUUID(),
        label: "個人ID",
        loginId: "private@example.com",
        updatedAt: Date.now(),
      });

      // 6. 参加申請: ステータス別に作成
      const now = Date.now();

      // pending (10時間前) — 48h未満なので保護対象
      await ctx.db.insert("joinRequests", {
        familyId: demoFamilyId,
        userId: "new_applicant_recent",
        accountId: guest1Id,
        status: "pending",
        createdAt: now - 10 * 60 * 60 * 1000,
        updatedAt: now - 10 * 60 * 60 * 1000,
      });

      // pending (50時間前) — 48h超過なので削除対象
      await ctx.db.insert("joinRequests", {
        familyId: demoFamilyId,
        userId: "old_applicant_stale",
        accountId: guest2Id,
        status: "pending",
        createdAt: now - 50 * 60 * 60 * 1000,
        updatedAt: now - 50 * 60 * 60 * 1000,
      });

      // approved (10時間前) — 判定済みなので無条件削除対象
      await ctx.db.insert("joinRequests", {
        familyId: demoFamilyId,
        userId: "approved_guest",
        accountId: guest1Id,
        status: "approved",
        createdAt: now - 10 * 60 * 60 * 1000,
        updatedAt: now - 10 * 60 * 60 * 1000,
      });

      // rejected (3時間前) — 判定済みなので無条件削除対象
      await ctx.db.insert("joinRequests", {
        familyId: demoFamilyId,
        userId: "rejected_guest",
        accountId: guest2Id,
        status: "rejected",
        createdAt: now - 3 * 60 * 60 * 1000,
        updatedAt: now - 3 * 60 * 60 * 1000,
      });

      // 7. ゲストの exportVault がある場合
      await ctx.db.insert("pendingExportVaults", {
        accountId: guest1Id,
        userId: "guest_uid_1",
        oldFamilyId: demoFamilyId,
        oldFamilyName: "デモファミリー",
        masterKeyEncrypted: "vault_encrypted",
        masterKeyIv: "vault_iv",
        masterKeySalt: "vault_salt",
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });

      // 8. 過去コホートの監査ログ（リセット後に新コホートから見えてはならない）
      await ctx.db.insert("auditLogs", {
        familyId: demoFamilyId,
        accountId: guest1Id,
        userId: "guest_uid_1",
        actorDisplayName: "ゲスト閲覧者1",
        ownerType: "family",
        ownerFamilyId: demoFamilyId,
        action: "RECORD_CREATE",
        metadata: { targetTitle: "過去コホートのレコード" },
        createdAt: now - 2 * 60 * 60 * 1000,
      });
      await ctx.db.insert("auditLogs", {
        familyId: demoFamilyId,
        accountId: admin1Id,
        userId: "admin_uid_1",
        actorDisplayName: "デモ管理者1",
        ownerType: "family",
        ownerFamilyId: demoFamilyId,
        action: "MEMBER_JOIN",
        createdAt: now - 1 * 60 * 60 * 1000,
      });

      // 9. 過去コホートの閲覧ログ
      await ctx.db.insert("viewLogs", {
        familyId: demoFamilyId,
        accountId: guest1Id,
        userId: "guest_uid_1",
        actorDisplayName: "ゲスト閲覧者1",
        recordId: sharedRecordId,
        createdAt: now - 30 * 60 * 1000,
      });

      // 10. ゲストが発行した追加招待コード（デモ固定コード以外）
      await ctx.db.insert("familyInvites", {
        familyId: demoFamilyId,
        code: "guest-extra-invite",
        createdBy: "guest_uid_1",
        createdAt: now - 60 * 60 * 1000,
        expiresAt: now + 24 * 60 * 60 * 1000,
        useCount: 0,
      });

      // 11. ゲストの家族移行データ（PREPARED 状態）
      await ctx.db.insert("familyMigrations", {
        userId: "guest_uid_1",
        accountId: guest1Id,
        sourceFamilyId: demoFamilyId,
        targetFamilyId: demoFamilyId, // ダミー（実際は別ファミリーだが、テスト簡略化のため同一）
        serviceRecordIds: [],
        status: "PREPARED",
        createdAt: now - 10 * 60 * 1000,
        expiresAt: now + 20 * 60 * 1000,
      });
    });

    // 環境変数を設定
    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "admin_uid_1, admin_uid_2";
    process.env.DEMO_INVITE_CODE = "poohma-test-demo";

    // リセット実行 (初回実行)
    const result = await t.mutation(internal.demo.resetDemoFamilyInternal, {
      triggeredBy: "vitest",
      reason: "test run",
      force: true,
    });

    expect(result.success).toBe(true);
    expect(result.kickedGuestsCount).toBe(2);
    expect(result.deletedRecordsCount).toBe(2); // 共有1 + ゲスト個人1
    // approved(1) + rejected(1) + 期限切れpending(1) = 3件削除
    expect(result.deletedJoinRequestsCount).toBe(3);
    expect(result.deletedAuditLogsCount).toBe(2); // 過去コホートの監査ログ2件
    expect(result.deletedViewLogsCount).toBeGreaterThanOrEqual(0); // レコード個別削除で先に消える分があるため0以上
    expect(result.deletedExtraInvitesCount).toBe(1); // guest-extra-invite
    expect(result.deletedMigrationsCount).toBe(1); // PREPARED 移行データ
    expect(result.insertedRecordsCount).toBeGreaterThan(0); // demoRecords.json から再投入
    expect(result.inviteCode).toBe("poohma-test-demo");

    // DB状態の事後検証
    await t.run(async (ctx) => {
      // 1. 管理者は所属維持、ゲストはキックされていること
      const admin1 = await ctx.db.get(admin1Id);
      const admin2 = await ctx.db.get(admin2Id);
      const guest1 = await ctx.db.get(guest1Id);
      const guest2 = await ctx.db.get(guest2Id);

      expect(admin1?.familyId).toBe(demoFamilyId);
      expect(admin2?.familyId).toBe(demoFamilyId);
      expect(guest1?.familyId).toBeUndefined();
      expect(guest2?.familyId).toBeUndefined();

      // 2. 過去の共有レコードおよびゲスト個人レコードが消去されていること
      const remainingRecords = await ctx.db
        .query("serviceRecords")
        .withIndex("by_family_updatedAt", (q) => q.eq("familyId", demoFamilyId))
        .collect();

      // 過去レコードのタイトルが存在しないこと
      expect(
        remainingRecords.some((r) => r.title === "過去の共有レコード"),
      ).toBe(false);
      expect(
        remainingRecords.some((r) => r.title === "ゲストの個人レコード"),
      ).toBe(false);

      // 3. ゲスト所有の個人レコードもゼロであること
      const guestPrivateRecords = await ctx.db
        .query("serviceRecords")
        .withIndex("by_accountId", (q) => q.eq("accountId", guest1Id))
        .collect();
      expect(guestPrivateRecords.length).toBe(0);

      // 4. ゲストの vault も削除されていること
      const guestVaults = await ctx.db
        .query("pendingExportVaults")
        .withIndex("by_accountId", (q) => q.eq("accountId", guest1Id))
        .collect();
      expect(guestVaults.length).toBe(0);

      // 5. 参加申請: pending (10時間前) のみ残存し、approved / rejected / 期限切れ pending は消えていること
      const remainingJoinRequests = await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_status", (q) => q.eq("familyId", demoFamilyId))
        .collect();

      expect(remainingJoinRequests.length).toBe(1);
      expect(remainingJoinRequests[0].userId).toBe("new_applicant_recent");
      expect(remainingJoinRequests[0].status).toBe("pending");

      // 6. デモ用招待コードが 2099 年まで有効に設定され、追加招待は消去されていること
      const allInvites = await ctx.db
        .query("familyInvites")
        .withIndex("by_familyId", (q) => q.eq("familyId", demoFamilyId))
        .collect();
      expect(allInvites.length).toBe(1); // デモ固定コードのみ
      expect(allInvites[0].code).toBe("poohma-test-demo");
      expect(allInvites[0].expiresAt).toBe(4102415999000);
      expect(allInvites[0].useCount).toBe(0);

      // 7. 監査ログ: 過去コホートのログは全パージされ、リセット完了ログ1件のみ残存
      const allAuditLogs = await ctx.db
        .query("auditLogs")
        .withIndex("by_family_createdAt", (q) => q.eq("familyId", demoFamilyId))
        .collect();
      expect(allAuditLogs.length).toBe(1);
      expect(allAuditLogs[0].action).toBe("FAMILY_UPDATE");
      expect(allAuditLogs[0].metadata?.detail).toContain(
        "デモファミリー定期リセット",
      );

      // 8. 閲覧ログ: デモファミリー分は全件削除されていること
      const allViewLogs = await ctx.db
        .query("viewLogs")
        .withIndex("by_family_createdAt", (q) => q.eq("familyId", demoFamilyId))
        .collect();
      expect(allViewLogs.length).toBe(0);

      // 9. 家族移行データ: デモファミリー関連は全件削除されていること
      const guestMigrations = await ctx.db
        .query("familyMigrations")
        .withIndex("by_accountId", (q) => q.eq("accountId", guest1Id))
        .collect();
      expect(guestMigrations.length).toBe(0);
    });
  });

  it("クールダウンガード: 直近10分以内の再リセットはスキップされ、force=true なら実行されること", async () => {
    const t = convexTest(schema, modules);

    let demoFamilyId!: Id<"families">;
    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "デモファミリー",
        updatedAt: Date.now(),
      });

      const adminId = await ctx.db.insert("users", {
        userId: "admin_uid_cool",
        email: "admin_cool@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      // 5分前に実行された監査ログをあらかじめ挿入
      await ctx.db.insert("auditLogs", {
        familyId: demoFamilyId,
        accountId: adminId,
        userId: "admin_uid_cool",
        actorDisplayName: "管理者",
        ownerType: "family",
        ownerFamilyId: demoFamilyId,
        action: "FAMILY_UPDATE",
        metadata: {
          detail: "デモファミリー定期リセット: 実行者=cron",
        },
        createdAt: Date.now() - 5 * 60 * 1000, // 5分前
      });

      // 1分前に別の操作ログ（家族名変更等）が挿入されていても、リセットログがマスクされず検出されること
      await ctx.db.insert("auditLogs", {
        familyId: demoFamilyId,
        accountId: adminId,
        userId: "admin_uid_cool",
        actorDisplayName: "管理者",
        ownerType: "family",
        ownerFamilyId: demoFamilyId,
        action: "FAMILY_UPDATE",
        metadata: {
          detail: "家族名の更新",
        },
        createdAt: Date.now() - 1 * 60 * 1000, // 1分前
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "admin_uid_cool";

    // 通常実行 -> クールダウン中なのでスキップされること
    const skippedRes = await t.mutation(internal.demo.resetDemoFamilyInternal, {
      force: false,
    });
    expect(skippedRes.skipped).toBe(true);
    expect(skippedRes.message).toContain("Cooldown active");

    // force: true -> クールダウンを無視して実行されること
    const forcedRes = await t.mutation(internal.demo.resetDemoFamilyInternal, {
      force: true,
    });
    expect(forcedRes.success).toBe(true);
    expect(forcedRes.skipped).toBeUndefined();
  });

  it("exportDemoRecordsInternal: 対象ファミリーの暗号化済み共有レコードが正しく抽出できること", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;
    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "エクスポート対象ファミリー",
        updatedAt: Date.now(),
      });

      const user1 = await ctx.db.insert("users", {
        userId: "uid_export",
        email: "export@example.com",
        familyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      // 共有レコード (抽出対象)
      const record1 = await ctx.db.insert("serviceRecords", {
        title: "共有サービスA",
        titleReading: "きょうゆうさーびすえー",
        url: "https://example.com/a",
        ogpImage: "https://example.com/ogp-a.png",
        ogpDescription: "サービスAの説明",
        memo: "メモA",
        tags: ["タグ1", "タグ2"],
        ownerType: "family",
        ownerFamilyId: familyId,
        familyId,
        userId: "uid_export",
        accountId: user1,
        stableId: crypto.randomUUID(),
        updatedAt: Date.now(),
      });

      await ctx.db.insert("credentials", {
        recordId: record1,
        stableId: crypto.randomUUID(),
        label: "メイン",
        loginId: "user@example.com",
        passwordHint: "EncryptedHintA",
        passwordHintIv: "IvA",
        passwordHintDekEncrypted: "DekEncryptedA",
        passwordHintDekIv: "DekIvA",
        order: 0,
        updatedAt: Date.now(),
      });

      // 個人レコード (抽出対象外)
      await ctx.db.insert("serviceRecords", {
        title: "個人サービスB",
        ownerType: "user",
        familyId,
        userId: "uid_export",
        accountId: user1,
        stableId: crypto.randomUUID(),
        updatedAt: Date.now(),
        tags: [],
      });
    });

    const exported = await t.query(internal.demo.exportDemoRecordsInternal, {
      familyId,
    });

    expect(exported.length).toBe(1);
    expect(exported[0].title).toBe("共有サービスA");
    expect(exported[0].titleReading).toBe("きょうゆうさーびすえー");
    expect(exported[0].ogpImage).toBe("https://example.com/ogp-a.png");
    expect(exported[0].credentials.length).toBe(1);
    expect(exported[0].credentials[0].label).toBe("メイン");
    expect(exported[0].credentials[0].passwordHint).toBe("EncryptedHintA");
    expect(exported[0].credentials[0].passwordHintDekEncrypted).toBe(
      "DekEncryptedA",
    );
  });

  it("デモ招待コードが既に別ファミリーで使用されている場合、例外がスローされること", async () => {
    const t = convexTest(schema, modules);
    let demoFamilyId!: Id<"families">;
    let otherFamilyId!: Id<"families">;

    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "Demo Family",
        updatedAt: Date.now(),
      });
      otherFamilyId = await ctx.db.insert("families", {
        name: "Other Family",
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "demo_admin",
        email: "admin@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      // 別ファミリーが同じ招待コードを所有
      await ctx.db.insert("familyInvites", {
        familyId: otherFamilyId,
        code: "poohma-demo",
        createdBy: "other_user",
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
        useCount: 0,
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "demo_admin";
    process.env.DEMO_INVITE_CODE = "poohma-demo";

    await expect(
      t.mutation(internal.demo.resetDemoFamilyInternal, {}),
    ).rejects.toThrow(
      'Invite code "poohma-demo" is already used by another family.',
    );
  });

  it("ゲストユーザーが他ファミリーに作成した個人レコードおよびVaultは削除されず保護されること", async () => {
    const t = convexTest(schema, modules);
    let demoFamilyId!: Id<"families">;
    let otherFamilyId!: Id<"families">;
    let guestId!: Id<"users">;
    let demoRecordId!: Id<"serviceRecords">;
    let otherRecordId!: Id<"serviceRecords">;
    let demoVaultId!: Id<"pendingExportVaults">;
    let otherVaultId!: Id<"pendingExportVaults">;

    await t.run(async (ctx) => {
      demoFamilyId = await ctx.db.insert("families", {
        name: "Demo Family",
        updatedAt: Date.now(),
      });
      otherFamilyId = await ctx.db.insert("families", {
        name: "Other Family",
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "demo_admin",
        email: "admin@example.com",
        familyId: demoFamilyId,
        familyRole: "admin",
        updatedAt: Date.now(),
      });

      guestId = await ctx.db.insert("users", {
        userId: "guest_user",
        email: "guest@example.com",
        familyId: demoFamilyId,
        familyRole: "viewer",
        updatedAt: Date.now(),
      });

      // デモファミリー内でゲストが作成した個人レコード
      demoRecordId = await ctx.db.insert("serviceRecords", {
        title: "デモファミリー内の個人レコード",
        accountId: guestId,
        familyId: demoFamilyId,
        userId: "guest_user",
        ownerType: "user",
        tags: [],
        stableId: crypto.randomUUID(),
        updatedAt: Date.now(),
      });

      // 他ファミリーに属する個人レコード（過去データや別所属）
      otherRecordId = await ctx.db.insert("serviceRecords", {
        title: "他ファミリーの個人レコード",
        accountId: guestId,
        familyId: otherFamilyId,
        userId: "guest_user",
        ownerType: "user",
        tags: [],
        stableId: crypto.randomUUID(),
        updatedAt: Date.now(),
      });

      // デモファミリー由来の vault
      demoVaultId = await ctx.db.insert("pendingExportVaults", {
        accountId: guestId,
        userId: "guest_user",
        oldFamilyId: demoFamilyId,
        oldFamilyName: "Demo Family",
        masterKeyEncrypted: "enc",
        masterKeyIv: "iv",
        masterKeySalt: "salt",
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
      });

      // 他ファミリー由来の vault
      otherVaultId = await ctx.db.insert("pendingExportVaults", {
        accountId: guestId,
        userId: "guest_user",
        oldFamilyId: otherFamilyId,
        oldFamilyName: "Other Family",
        masterKeyEncrypted: "enc2",
        masterKeyIv: "iv2",
        masterKeySalt: "salt2",
        createdAt: Date.now(),
        expiresAt: Date.now() + 100000,
      });
    });

    process.env.DEMO_FAMILY_ID = demoFamilyId;
    process.env.DEMO_ADMIN_USER_IDS = "demo_admin";

    await t.mutation(internal.demo.resetDemoFamilyInternal, { force: true });

    // 検証: デモファミリーに属する個人レコードとVaultは削除されるが、他ファミリーのものは残存すること
    await t.run(async (ctx) => {
      const demoRec = await ctx.db.get(demoRecordId);
      const otherRec = await ctx.db.get(otherRecordId);
      const demoVault = await ctx.db.get(demoVaultId);
      const otherVault = await ctx.db.get(otherVaultId);

      expect(demoRec).toBeNull();
      expect(otherRec).not.toBeNull();
      expect(otherRec?.title).toBe("他ファミリーの個人レコード");

      expect(demoVault).toBeNull();
      expect(otherVault).not.toBeNull();
      expect(otherVault?.oldFamilyName).toBe("Other Family");
    });
  });
});

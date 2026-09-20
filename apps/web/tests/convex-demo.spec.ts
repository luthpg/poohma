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

  it("DEMO_ADMIN_USER_IDS に一致するユーザーがデモ家族に存在しない場合、例外がスローされること", async () => {
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
      "No matching admin users found in the specified demo family matching DEMO_ADMIN_USER_IDS.",
    );
  });

  it("DEMO_ADMIN_USER_IDS に一致するユーザーの中に familyRole === 'admin' のメンバーがいない場合、例外がスローされること", async () => {
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
      "No administrator with familyRole 'admin' found among matching demo admin users.",
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

  it("正常系: ゲストキック、ゲスト個人レコード含む完全削除、48時間申請保護、デモレコード再投入、招待コード維持が動作すること", async () => {
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

      // 6. 参加申請: 直近（10時間前）と古い申請（50時間前）を作成
      const now = Date.now();
      await ctx.db.insert("joinRequests", {
        familyId: demoFamilyId,
        userId: "new_applicant_recent",
        accountId: guest1Id,
        status: "pending",
        createdAt: now - 10 * 60 * 60 * 1000, // 10時間前 (保護対象)
        updatedAt: now - 10 * 60 * 60 * 1000,
      });

      await ctx.db.insert("joinRequests", {
        familyId: demoFamilyId,
        userId: "old_applicant_stale",
        accountId: guest2Id,
        status: "pending",
        createdAt: now - 50 * 60 * 60 * 1000, // 50時間前 (削除対象)
        updatedAt: now - 50 * 60 * 60 * 1000,
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
    expect(result.deletedJoinRequestsCount).toBe(1); // 50時間前の申請のみ削除
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

      // 5. 参加申請: 10時間前の申請は残存し、50時間前の申請が消えていること
      const remainingJoinRequests = await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_status", (q) => q.eq("familyId", demoFamilyId))
        .collect();

      expect(remainingJoinRequests.length).toBe(1);
      expect(remainingJoinRequests[0].userId).toBe("new_applicant_recent");

      // 6. デモ用招待コードが 2099 年まで有効に設定されていること
      const invite = await ctx.db
        .query("familyInvites")
        .withIndex("by_code", (q) => q.eq("code", "poohma-test-demo"))
        .first();
      expect(invite).not.toBeNull();
      expect(invite?.familyId).toBe(demoFamilyId);
      expect(invite?.expiresAt).toBe(4102415999000);
      expect(invite?.useCount).toBe(0);

      // 7. 監査ログが記録されていること
      const audit = await ctx.db
        .query("auditLogs")
        .withIndex("by_family_createdAt", (q) => q.eq("familyId", demoFamilyId))
        .order("desc")
        .first();
      expect(audit?.action).toBe("FAMILY_UPDATE");
      expect(audit?.metadata?.detail).toContain("デモファミリー定期リセット");
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
});

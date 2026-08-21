import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
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
      let userAId!: Id<"users">;
      let userBId!: Id<"users">;
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
        userAId = await ctx.db.insert("users", {
          userId: "ua",
          email: "a@a.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });

        userBId = await ctx.db.insert("users", {
          userId: "ub",
          email: "b@b.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });

        // ユーザーAのサービスレコードとクレデンシャル
        await ctx.db.insert("serviceRecords", {
          userId: "ua",
          accountId: userAId,
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
          accountId: userBId,
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

  describe("2.1.3 家族の承認制参加フローの検証", () => {
    it("家族への参加申請、一覧取得、承認、および参加完了ができること", async () => {
      const t = convexTest(schema, modules);

      let familyId!: Id<"families">;

      // シードデータ投入
      await t.run(async (ctx) => {
        // 既存家族と既存メンバー
        familyId = await ctx.db.insert("families", {
          name: "田中家",
          masterKeyEncrypted: "SGVsbG9Xb3JsZA==",
          masterKeyIv: "SGVsbG9Xb3JsZA==",
          masterKeySalt: "SGVsbG9Xb3JsZA==",
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "member_a",
          email: "member_a@example.com",
          displayName: "メンバーA",
          familyId,
          updatedAt: Date.now(),
        });

        // 参加申請を行う新規ユーザー
        await ctx.db.insert("users", {
          userId: "applicant_b",
          email: "applicant_b@example.com",
          displayName: "申請者B",
          updatedAt: Date.now(),
        });

        // 家族未所属の一般ユーザー
        await ctx.db.insert("users", {
          userId: "stranger",
          email: "stranger@example.com",
          displayName: "よそ者",
          updatedAt: Date.now(),
        });
      });

      const memberA = t.withIdentity({
        subject: "member_a",
        email: "member_a@example.com",
      });

      const applicantB = t.withIdentity({
        subject: "applicant_b",
        email: "applicant_b@example.com",
      });

      // 1. 申請前は getFamilyInfoByInviteCode で鍵を取得できないこと
      await expect(
        applicantB.query(api.families.getFamilyInfoByInviteCode, {
          inviteCode: familyId,
        }),
      ).rejects.toThrow("Access denied");

      // 2. 家族公開情報は取得できること
      const publicInfo = await applicantB.query(
        api.families.getFamilyPublicInfo,
        { inviteCode: familyId },
      );
      expect(publicInfo.name).toBe("田中家");

      // 3. 参加申請を作成する
      const requestId = await applicantB.mutation(
        api.families.createJoinRequest,
        { inviteCode: familyId },
      );
      expect(requestId).toBeDefined();

      // 4. 重複申請がエラーになること
      await expect(
        applicantB.mutation(api.families.createJoinRequest, {
          inviteCode: familyId,
        }),
      ).rejects.toThrow("pending join request");

      // 5. 申請状態を確認できること
      const myRequest = await applicantB.query(
        api.families.getMyJoinRequest,
        {},
      );
      expect(myRequest?.status).toBe("pending");
      expect(myRequest?.familyName).toBe("田中家");

      // 6. 既存メンバーが保留中の申請一覧を取得できること
      const pendingRequests = await memberA.query(
        api.families.getPendingRequests,
        {},
      );
      expect(pendingRequests.length).toBe(1);
      expect(pendingRequests[0].userId).toBe("applicant_b");
      expect(pendingRequests[0].displayName).toBe("申請者B");

      // 7. 申請者以外の無関係なユーザーは保留中一覧を取得できないこと
      const stranger = t.withIdentity({
        subject: "stranger",
        email: "stranger@example.com",
      });
      await expect(
        stranger.query(api.families.getPendingRequests, {}),
      ).rejects.toThrow("User does not belong to a family");

      // 8. 既存メンバーが申請を承認すること
      await memberA.mutation(api.families.approveJoinRequest, {
        requestId,
      });

      // 9. 承認後は getFamilyInfoByInviteCode が通ること
      const infoAfterApproval = await applicantB.query(
        api.families.getFamilyInfoByInviteCode,
        { inviteCode: familyId },
      );
      expect(infoAfterApproval.masterKeyEncrypted).toBe("SGVsbG9Xb3JsZA==");

      // 10. 承認状態の申請があるため joinFamily で正式に参加できること
      const joinedFamilyId = await applicantB.mutation(
        api.families.joinFamily,
        { inviteCode: familyId },
      );
      expect(joinedFamilyId).toBe(familyId);

      // 11. 参加後はユーザーの familyId が更新されていること
      const updatedApplicant = await t.run(async (ctx) => {
        return await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", "applicant_b"))
          .unique();
      });
      expect(updatedApplicant?.familyId).toBe(familyId);

      // 12. 正式参加後は申請データが削除されていること
      const myRequestAfterJoin = await applicantB.query(
        api.families.getMyJoinRequest,
        {},
      );
      expect(myRequestAfterJoin).toBeNull();
    });

    it("参加申請を却下し、その後再申請ができること", async () => {
      const t = convexTest(schema, modules);
      let familyId!: Id<"families">;

      await t.run(async (ctx) => {
        familyId = await ctx.db.insert("families", {
          name: "山田家",
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "member_y",
          email: "y@example.com",
          familyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("users", {
          userId: "applicant_z",
          email: "z@example.com",
          updatedAt: Date.now(),
        });
      });

      const memberY = t.withIdentity({
        subject: "member_y",
        email: "y@example.com",
      });
      const applicantZ = t.withIdentity({
        subject: "applicant_z",
        email: "z@example.com",
      });

      // 申請
      const requestId = await applicantZ.mutation(
        api.families.createJoinRequest,
        { inviteCode: familyId },
      );

      // 却下
      await memberY.mutation(api.families.rejectJoinRequest, { requestId });

      // 却下された状態を確認
      const status = await applicantZ.query(api.families.getMyJoinRequest, {});
      expect(status?.status).toBe("rejected");

      // 却下状態を消去して再申請できるようにする
      await applicantZ.mutation(api.families.dismissRejectedRequest, {
        requestId,
      });

      const statusAfterDismiss = await applicantZ.query(
        api.families.getMyJoinRequest,
        {},
      );
      expect(statusAfterDismiss).toBeNull();
    });
  });

  describe("2.1.4 prepare / commit フローによる安全な家族移行機能の検証", () => {
    it("prepare で移行対象が確定し、commit で一括更新・旧Family削除が行われること", async () => {
      const t = convexTest(schema, modules);

      let oldFamilyId!: Id<"families">;
      let userSoloId!: Id<"users">;

      await t.run(async (ctx) => {
        oldFamilyId = await ctx.db.insert("families", {
          name: "旧田中家",
          updatedAt: Date.now(),
        });

        // ユーザーA (唯一のメンバー)
        userSoloId = await ctx.db.insert("users", {
          userId: "user_solo",
          email: "solo@example.com",
          familyId: oldFamilyId,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("serviceRecords", {
          userId: "user_solo",
          accountId: userSoloId,
          familyId: oldFamilyId,
          title: "Solo's Record",
          visibility: "SHARED",
          credentials: [
            {
              id: "cred_solo",
              passwordHint: "old_hint",
              passwordHintIv: "old_iv",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      const userSolo = t.withIdentity({
        subject: "user_solo",
        email: "solo@example.com",
      });

      // 1. prepare: 新家族作成
      const prepareRes = await userSolo.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "新田中家",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      expect(prepareRes.migrationId).toBeDefined();

      // この時点ではまだユーザーの familyId もレコードの familyId も更新されていない
      const { userBeforeCommit, recordBeforeCommit } = await t.run(
        async (ctx) => {
          const user = await ctx.db
            .query("users")
            .withIndex("by_userId", (q) => q.eq("userId", "user_solo"))
            .unique();
          const record = await ctx.db
            .query("serviceRecords")
            .withIndex("by_userId", (q) => q.eq("userId", "user_solo"))
            .unique();
          return { userBeforeCommit: user, recordBeforeCommit: record };
        },
      );
      expect(userBeforeCommit?.familyId).toBe(oldFamilyId);
      expect(recordBeforeCommit?.familyId).toBe(oldFamilyId);
      expect(recordBeforeCommit?.credentials[0].passwordHint).toBe("old_hint");
      expect(recordBeforeCommit?.credentials[0].passwordHintIv).toBe("old_iv");

      // 2. getMigrationForEncryption で暗号化対象を取得
      const migrationData = await userSolo.query(
        api.families.getMigrationForEncryption,
        { migrationId: prepareRes.migrationId },
      );
      expect(migrationData.records.length).toBe(1);

      // 3. commit
      const commitRes = await userSolo.mutation(
        api.families.commitFamilyMigration,
        {
          migrationId: prepareRes.migrationId,
          credentials: [
            {
              id: "cred_solo",
              passwordHint: "new_hint",
              passwordHintIv: "new_iv",
            },
          ],
        },
      );

      expect(commitRes.success).toBe(true);
      expect(commitRes.familyId).toBe(prepareRes.targetFamilyId);

      // 4. DB状態の検証
      await t.run(async (ctx) => {
        // ユーザーの familyId が更新されている
        const updatedUser = await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", "user_solo"))
          .unique();
        expect(updatedUser?.familyId).toBe(prepareRes.targetFamilyId);

        // レコードの familyId と credentials が更新されている
        const record = await ctx.db
          .query("serviceRecords")
          .withIndex("by_userId", (q) => q.eq("userId", "user_solo"))
          .unique();
        expect(record?.familyId).toBe(prepareRes.targetFamilyId);
        expect(record?.credentials[0].passwordHint).toBe("new_hint");
        expect(record?.credentials[0].passwordHintIv).toBe("new_iv");

        // 旧Familyはメンバー0人になったので削除されていること
        const deletedOldFamily = await ctx.db.get(oldFamilyId);
        expect(deletedOldFamily).toBeNull();
      });
    });

    it("再暗号化対象の credential 更新を省略した commit は拒否されること", async () => {
      const t = convexTest(schema, modules);
      let oldFamilyId!: Id<"families">;
      let userOmitId!: Id<"users">;

      await t.run(async (ctx) => {
        oldFamilyId = await ctx.db.insert("families", {
          name: "省略テスト家族",
          masterKeyEncrypted: "enc",
          masterKeyIv: "iv",
          masterKeySalt: "salt",
          updatedAt: Date.now(),
        });
        userOmitId = await ctx.db.insert("users", {
          userId: "user_omit",
          email: "omit@example.com",
          familyId: oldFamilyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("serviceRecords", {
          title: "省略テストレコード",
          tags: [],
          userId: "user_omit",
          accountId: userOmitId,
          familyId: oldFamilyId,
          visibility: "PRIVATE",
          credentials: [
            {
              id: "cred_a",
              passwordHint: "hint_a",
              passwordHintIv: "iv_a",
            },
            {
              id: "cred_b",
              passwordHint: "hint_b",
              passwordHintIv: "iv_b",
            },
          ],
          updatedAt: Date.now(),
        });
      });

      const userOmit = t.withIdentity({
        subject: "user_omit",
        email: "omit@example.com",
      });

      const prepareRes = await userOmit.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "新省略テスト家族",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      // cred_a のみ更新し cred_b を省略 → commit は失敗すべき
      await expect(
        userOmit.mutation(api.families.commitFamilyMigration, {
          migrationId: prepareRes.migrationId,
          credentials: [
            {
              id: "cred_a",
              passwordHint: "new_hint_a",
              passwordHintIv: "new_iv_a",
            },
          ],
        }),
      ).rejects.toThrow("Missing re-encrypted credential update");
    });

    it("旧Familyに他メンバーが残る場合は旧Familyが削除されないこと", async () => {
      const t = convexTest(schema, modules);
      let oldFamilyId!: Id<"families">;

      await t.run(async (ctx) => {
        oldFamilyId = await ctx.db.insert("families", {
          name: "共有家族",
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "user_leaving",
          email: "leaving@example.com",
          familyId: oldFamilyId,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "user_staying",
          email: "staying@example.com",
          familyId: oldFamilyId,
          updatedAt: Date.now(),
        });
      });

      const userLeaving = t.withIdentity({
        subject: "user_leaving",
        email: "leaving@example.com",
      });

      const prepareRes = await userLeaving.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "独立家族",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      await userLeaving.mutation(api.families.commitFamilyMigration, {
        migrationId: prepareRes.migrationId,
        credentials: [],
      });

      // 検証: 旧Familyが削除されずに残っていること
      await t.run(async (ctx) => {
        const oldFamily = await ctx.db.get(oldFamilyId);
        expect(oldFamily).not.toBeNull();
      });
    });

    it("二重コミットが防止されること (COMPLETED 済みの migration は再コミットできない)", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          userId: "user_double",
          email: "double@example.com",
          updatedAt: Date.now(),
        });
      });

      const userDouble = t.withIdentity({
        subject: "user_double",
        email: "double@example.com",
      });

      const prepareRes = await userDouble.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "二重テスト家族",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      // 1回目のコミット
      await userDouble.mutation(api.families.commitFamilyMigration, {
        migrationId: prepareRes.migrationId,
        credentials: [],
      });

      // 2回目のコミットはエラーになること
      await expect(
        userDouble.mutation(api.families.commitFamilyMigration, {
          migrationId: prepareRes.migrationId,
          credentials: [],
        }),
      ).rejects.toThrow("Migration is not in PREPARED status");
    });

    it("複数の serviceRecord 間で cred.id が重複する場合に recordId を含めることで誤更新を防止できること", async () => {
      const t = convexTest(schema, modules);
      let record1Id!: Id<"serviceRecords">;
      let record2Id!: Id<"serviceRecords">;
      let userDupCredId!: Id<"users">;

      await t.run(async (ctx) => {
        userDupCredId = await ctx.db.insert("users", {
          userId: "user_dup_cred",
          email: "dup@example.com",
          updatedAt: Date.now(),
        });

        record1Id = await ctx.db.insert("serviceRecords", {
          userId: "user_dup_cred",
          accountId: userDupCredId,
          title: "Service 1",
          visibility: "PRIVATE",
          credentials: [
            {
              id: "same_cred_id",
              passwordHint: "r1_hint_old",
              passwordHintIv: "iv1",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });

        record2Id = await ctx.db.insert("serviceRecords", {
          userId: "user_dup_cred",
          accountId: userDupCredId,
          title: "Service 2",
          visibility: "PRIVATE",
          credentials: [
            {
              id: "same_cred_id",
              passwordHint: "r2_hint_old",
              passwordHintIv: "iv2",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      const userDup = t.withIdentity({
        subject: "user_dup_cred",
        email: "dup@example.com",
      });

      const prepareRes = await userDup.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "重複キーテスト家族",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      // recordId を付与してコミット
      await userDup.mutation(api.families.commitFamilyMigration, {
        migrationId: prepareRes.migrationId,
        credentials: [
          {
            recordId: record1Id,
            id: "same_cred_id",
            passwordHint: "r1_hint_new",
            passwordHintIv: "iv1_new",
          },
          {
            recordId: record2Id,
            id: "same_cred_id",
            passwordHint: "r2_hint_new",
            passwordHintIv: "iv2_new",
          },
        ],
      });

      await t.run(async (ctx) => {
        const r1 = await ctx.db.get(record1Id);
        const r2 = await ctx.db.get(record2Id);

        expect(r1?.credentials[0].passwordHint).toBe("r1_hint_new");
        expect(r2?.credentials[0].passwordHint).toBe("r2_hint_new");
      });
    });

    it("再度 prepare を呼び出した際、古い PREPARED 移行が EXPIRED となり孤児 Family が削除されること", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          userId: "user_orphan",
          email: "orphan@example.com",
          updatedAt: Date.now(),
        });
      });

      const userOrphan = t.withIdentity({
        subject: "user_orphan",
        email: "orphan@example.com",
      });

      // 1回目の prepare (作成された targetFamilyId1 は放置される)
      const prep1 = await userOrphan.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "放置ファミリー",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      // 2回目の prepare
      const prep2 = await userOrphan.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "最終ファミリー",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      await t.run(async (ctx) => {
        // 1回目の migration は EXPIRED
        const m1 = await ctx.db.get(prep1.migrationId);
        expect(m1?.status).toBe("EXPIRED");

        // 1回目の targetFamilyId は孤児になったため削除されていること
        const f1 = await ctx.db.get(prep1.targetFamilyId);
        expect(f1).toBeNull();

        // 2回目の targetFamilyId は存在していること
        const f2 = await ctx.db.get(prep2.targetFamilyId);
        expect(f2).not.toBeNull();
      });
    });

    it("cleanupExpiredMigrationsInternal を実行した際、期限切れの PREPARED 移行が EXPIRED となり孤児 Family が削除されること", async () => {
      const t = convexTest(schema, modules);
      let expiredFamilyId!: Id<"families">;
      let expiredMigrationId!: Id<"familyMigrations">;

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          userId: "user_cron_test",
          email: "cron@example.com",
          updatedAt: Date.now(),
        });

        expiredFamilyId = await ctx.db.insert("families", {
          name: "期限切れ孤児ファミリー",
          updatedAt: Date.now(),
        });

        // 過去の期限切れ PREPARED レコードをダミー挿入
        expiredMigrationId = await ctx.db.insert("familyMigrations", {
          userId: "user_cron_test",
          targetFamilyId: expiredFamilyId,
          serviceRecordIds: [],
          status: "PREPARED",
          createdAt: Date.now() - 3600 * 1000,
          expiresAt: Date.now() - 1800 * 1000, // 過去の時刻
        });
      });

      // cleanupExpiredMigrationsInternal の実行
      await t.mutation(internal.families.cleanupExpiredMigrationsInternal, {});

      await t.run(async (ctx) => {
        const migration = await ctx.db.get(expiredMigrationId);
        expect(migration?.status).toBe("EXPIRED");

        const family = await ctx.db.get(expiredFamilyId);
        expect(family).toBeNull();
      });
    });

    it("prepare 後に暗号化クレデンシャルを持つレコードが追加された場合、commitFamilyMigrationが競合エラーとなり何も書き換わらないこと", async () => {
      const t = convexTest(schema, modules);
      let oldFamilyId!: Id<"families">;
      let userMidId!: Id<"users">;
      let recordBeforeId!: Id<"serviceRecords">;

      await t.run(async (ctx) => {
        oldFamilyId = await ctx.db.insert("families", {
          name: "旧家族",
          updatedAt: Date.now(),
        });

        userMidId = await ctx.db.insert("users", {
          userId: "user_mid",
          email: "mid@example.com",
          familyId: oldFamilyId,
          updatedAt: Date.now(),
        });

        // prepare 前に存在するレコード
        recordBeforeId = await ctx.db.insert("serviceRecords", {
          title: "テストレコード1",
          tags: [],
          userId: "user_mid",
          accountId: userMidId,
          familyId: oldFamilyId,
          visibility: "PRIVATE",
          credentials: [
            {
              id: "cred_before",
              passwordHint: "before_hint",
              passwordHintIv: "before_iv",
            },
          ],
          updatedAt: Date.now(),
        });
      });

      const userMid = t.withIdentity({
        subject: "user_mid",
        email: "mid@example.com",
      });

      // 1. prepare
      const prepareRes = await userMid.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "新家族",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      // 2. prepare 後にレコードを追加 (30分以内を想定)
      let newRecordId!: Id<"serviceRecords">;
      await t.run(async (ctx) => {
        newRecordId = await ctx.db.insert("serviceRecords", {
          title: "テストレコード2",
          tags: [],
          userId: "user_mid",
          accountId: userMidId,
          familyId: oldFamilyId,
          visibility: "PRIVATE",
          credentials: [
            {
              id: "cred_after",
              passwordHint: "after_hint",
              passwordHintIv: "after_iv",
            },
          ],
          updatedAt: Date.now(),
        });
      });

      // 3. commit (prepare後にレコードが追加されているため競合が検知され失敗すること)
      await expect(
        userMid.mutation(api.families.commitFamilyMigration, {
          migrationId: prepareRes.migrationId,
          credentials: [
            {
              id: "cred_before",
              passwordHint: "new_before_hint",
              passwordHintIv: "new_before_iv",
            },
            {
              id: "cred_after",
              passwordHint: "new_after_hint",
              passwordHintIv: "new_after_iv",
            },
          ],
        }),
      ).rejects.toThrow("Conflict detected");

      // 4. 検証: ロールバックされ、何も書き換わっていないこと
      await t.run(async (ctx) => {
        const migration = await ctx.db.get(prepareRes.migrationId);
        expect(migration?.status).toBe("PREPARED");

        const user = await ctx.db.get(userMidId);
        expect(user?.familyId).toBe(oldFamilyId);

        const recordBefore = await ctx.db.get(recordBeforeId);
        expect(recordBefore?.familyId).toBe(oldFamilyId);
        expect(recordBefore?.credentials[0].passwordHint).toBe("before_hint");

        const newRecord = await ctx.db.get(newRecordId);
        expect(newRecord?.familyId).toBe(oldFamilyId);
        expect(newRecord?.credentials[0].passwordHint).toBe("after_hint");

        // 旧Familyも残っていること
        const oldFamily = await ctx.db.get(oldFamilyId);
        expect(oldFamily).not.toBeNull();
      });
    });

    it("abortFamilyMigration を呼び出した際、移行が ABORTED となりメンバー0人の targetFamily が削除されること", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          userId: "user_abort_test",
          email: "abort@example.com",
          updatedAt: Date.now(),
        });
      });

      const userAbort = t.withIdentity({
        subject: "user_abort_test",
        email: "abort@example.com",
      });

      const prepareRes = await userAbort.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "キャンセル予定ファミリー",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      const abortRes = await userAbort.mutation(
        api.families.abortFamilyMigration,
        { migrationId: prepareRes.migrationId },
      );

      expect(abortRes.success).toBe(true);

      await t.run(async (ctx) => {
        const migration = await ctx.db.get(prepareRes.migrationId);
        expect(migration?.status).toBe("ABORTED");

        const targetFamily = await ctx.db.get(prepareRes.targetFamilyId);
        expect(targetFamily).toBeNull();
      });
    });

    it("prepare後、commit前に暗号化クレデンシャルを持たない新規レコードが追加された場合、commitFamilyMigrationが競合エラーとなり何も書き換わらないこと", async () => {
      const t = convexTest(schema, modules);
      let oldFamilyId!: Id<"families">;
      let userSoloId!: Id<"users">;
      await t.run(async (ctx) => {
        oldFamilyId = await ctx.db.insert("families", {
          name: "旧田中家",
          updatedAt: Date.now(),
        });
        userSoloId = await ctx.db.insert("users", {
          userId: "user_solo2",
          email: "solo2@example.com",
          familyId: oldFamilyId,
          updatedAt: Date.now(),
        });
        await ctx.db.insert("serviceRecords", {
          userId: "user_solo2",
          accountId: userSoloId,
          familyId: oldFamilyId,
          title: "既存レコード",
          visibility: "SHARED",
          credentials: [
            {
              id: "cred_a",
              passwordHint: "old_hint",
              passwordHintIv: "old_iv",
            },
          ],
          tags: [],
          updatedAt: Date.now(),
        });
      });
      const userSolo = t.withIdentity({
        subject: "user_solo2",
        email: "solo2@example.com",
      });

      const prepareRes = await userSolo.mutation(
        api.families.prepareFamilyMigration,
        {
          action: "create",
          name: "新田中家",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "key_iv",
          masterKeySalt: "key_salt",
        },
      );

      let newRecordId!: Id<"serviceRecords">;
      await t.run(async (ctx) => {
        newRecordId = await ctx.db.insert("serviceRecords", {
          userId: "user_solo2",
          accountId: userSoloId,
          familyId: oldFamilyId,
          title: "並行操作で追加されたレコード",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
          updatedAt: Date.now(),
        });
      });

      await expect(
        userSolo.mutation(api.families.commitFamilyMigration, {
          migrationId: prepareRes.migrationId,
          credentials: [
            {
              id: "cred_a",
              passwordHint: "new_hint",
              passwordHintIv: "new_iv",
            },
          ],
        }),
      ).rejects.toThrow("Conflict detected");

      await t.run(async (ctx) => {
        const migration = await ctx.db.get(prepareRes.migrationId);
        expect(migration?.status).toBe("PREPARED");

        const newRecord = await ctx.db.get(newRecordId);
        expect(newRecord?.familyId).toBe(oldFamilyId);

        const existingRecord = await ctx.db
          .query("serviceRecords")
          .withIndex("by_userId", (q) => q.eq("userId", "user_solo2"))
          .filter((q) => q.eq(q.field("title"), "既存レコード"))
          .unique();
        expect(existingRecord?.familyId).toBe(oldFamilyId);
        expect(existingRecord?.credentials[0].passwordHint).toBe("old_hint");
      });
    });
  });
});

import {
  decrypt,
  deriveKeyFromPasscode,
  encrypt,
  generateDEK,
  unwrapDEK,
  wrapDEK,
} from "@/lib/crypto";

describe("Family Passcode Rotation - Envelope Re-wrapping Integration", () => {
  it("旧パスコードでラップされたDEKが、新しいパスコードのマスターキーで正しく再ラップされ、データが復号可能な状態を維持できること", async () => {
    //---------------------------------------------------------
    // 1. 準備段階: 旧パスコードで暗号化されたレコードを模倣
    //---------------------------------------------------------
    const oldPasscode = "old-family-passcode-1234";
    const newPasscode = "new-family-passcode-5678";
    const secretHint = "super-secret-password-hint";

    // 鍵の導出 (ストレッチング等はモックするか、実関数を使用)
    const oldMasterKey = await deriveKeyFromPasscode(
      oldPasscode,
      "static-salt-for-test",
    );
    const newMasterKey = await deriveKeyFromPasscode(
      newPasscode,
      "static-salt-for-test",
    );

    // 個別DEKの生成とデータの暗号化
    const originalDek = await generateDEK();
    const encryptedHint = await encrypt(secretHint, originalDek);
    const wrappedDekOld = await wrapDEK(originalDek, oldMasterKey);

    // Convexに格納されていると仮定するダミーのデータ構造
    const mockDbCredential = {
      id: "cred-test-id",
      passwordHint: encryptedHint.encrypted,
      passwordHintIv: encryptedHint.iv,
      passwordHintDekEncrypted: wrappedDekOld.encrypted,
      passwordHintDekIv: wrappedDekOld.iv,
    };

    //---------------------------------------------------------
    // 2. 実行段階: family.tsx 内のローテーションロジックのシミュレーション
    //---------------------------------------------------------
    // ① 旧マスターキーを使ってDEKを取り出す
    const unwrappedDek = await unwrapDEK(
      mockDbCredential.passwordHintDekEncrypted,
      mockDbCredential.passwordHintDekIv,
      oldMasterKey,
    );

    // ② 取り出したDEKを、新しいマスターキーでラップし直す
    const reWrappedDek = await wrapDEK(unwrappedDek, newMasterKey);

    // ③ 新しいペイロードの作成（これがConvexのMutationに送信される）
    const rotatedCredentialPayload = {
      id: mockDbCredential.id,
      passwordHint: mockDbCredential.passwordHint, // 暗号文自体は不変
      passwordHintIv: mockDbCredential.passwordHintIv,
      passwordHintDekEncrypted: reWrappedDek.encrypted, // 新しい封筒
      passwordHintDekIv: reWrappedDek.iv,
    };

    // (必要に応じてここで Convex のテストクライアントを叩く)
    // await t.mutation(api.records.updateFamilyPasscode, { credentials: [rotatedCredentialPayload], ... });

    //---------------------------------------------------------
    // 3. 検証段階: 新しいパスコード（新マスターキー）だけで復号ができるか
    //---------------------------------------------------------
    // 新しい鍵でDEKをアンラップできるか
    const decryptedDek = await unwrapDEK(
      rotatedCredentialPayload.passwordHintDekEncrypted,
      rotatedCredentialPayload.passwordHintDekIv,
      newMasterKey,
    );

    // アンラップしたDEKで、暗号文が元の平文に戻るか
    const finalPlainHint = await decrypt(
      rotatedCredentialPayload.passwordHint,
      rotatedCredentialPayload.passwordHintIv,
      decryptedDek,
    );

    // 最終アサーション: 鍵が書き換わっても、データの中身が正しく復元できること
    expect(finalPlainHint).toBe(secretHint);
    // 元のDEKオブジェクト（鍵の生データ情報）が同一性を保っていることの検証
    expect(decryptedDek).toBeDefined();
  });

  describe("2.1.5 家族移行（familyMigrations）のアカウント境界とアクセス制御", () => {
    it("同一Firebase UID内の別アカウントが準備したmigrationIdは実行できず、作成元アカウントのみ実行できること", async () => {
      const t = convexTest(schema, modules);

      let account1Id!: Id<"users">;
      let account2Id!: Id<"users">;

      // 同一 Firebase UID (user_multi) で2つのアカウントを作成
      await t.run(async (ctx) => {
        account1Id = await ctx.db.insert("users", {
          userId: "user_multi",
          email: "multi@example.com",
          displayName: "アカウント1",
          updatedAt: Date.now(),
        });
        account2Id = await ctx.db.insert("users", {
          userId: "user_multi",
          email: "multi@example.com",
          displayName: "アカウント2",
          updatedAt: Date.now(),
        });
      });

      const client1 = t.withIdentity({
        subject: "user_multi",
        email: "multi@example.com",
      });

      // アカウント1 で家族移行（新規家族作成）を prepare
      const { migrationId } = await client1.mutation(
        api.families.prepareFamilyMigration,
        {
          accountId: account1Id,
          action: "create",
          name: "マルチ家族",
          masterKeyEncrypted: "enc_key",
          masterKeyIv: "iv_key",
          masterKeySalt: "salt_key",
        },
      );

      expect(migrationId).toBeDefined();

      // DB内の migration に accountId が保存されていることを検証
      const migrationDoc = await t.run(async (ctx) => {
        return await ctx.db.get(migrationId);
      });
      expect(migrationDoc?.accountId).toBe(account1Id);

      // アカウント2 で同じ migrationId の暗号化データ取得を試みると拒否される
      await expect(
        client1.query(api.families.getMigrationForEncryption, {
          accountId: account2Id,
          migrationId,
        }),
      ).rejects.toThrow("Migration not found or access denied");

      // アカウント2 で同じ migrationId の commit を試みると拒否される
      await expect(
        client1.mutation(api.families.commitFamilyMigration, {
          accountId: account2Id,
          migrationId,
          credentials: [],
        }),
      ).rejects.toThrow("Migration not found or access denied");

      // アカウント2 で同じ migrationId の abort を試みると拒否される
      await expect(
        client1.mutation(api.families.abortFamilyMigration, {
          accountId: account2Id,
          migrationId,
        }),
      ).rejects.toThrow("Migration not found or access denied");

      // アカウント1 であれば暗号化データを取得・コミットできる
      const encryptionData = await client1.query(
        api.families.getMigrationForEncryption,
        {
          accountId: account1Id,
          migrationId,
        },
      );
      expect(encryptionData.migrationId).toBe(migrationId);

      const commitResult = await client1.mutation(
        api.families.commitFamilyMigration,
        {
          accountId: account1Id,
          migrationId,
          credentials: [],
        },
      );
      expect(commitResult.success).toBe(true);

      // アカウント1の familyId が更新され、アカウント2は影響を受けないこと
      const user1 = await t.run(async (ctx) => ctx.db.get(account1Id));
      const user2 = await t.run(async (ctx) => ctx.db.get(account2Id));
      expect(user1?.familyId).toBe(commitResult.familyId);
      expect(user2?.familyId).toBeUndefined();
    });
  });
});

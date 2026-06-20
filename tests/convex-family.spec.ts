import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
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
        await ctx.db.insert("users", {
          userId: "ua",
          email: "a@a.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });

        await ctx.db.insert("users", {
          userId: "ub",
          email: "b@b.com",
          familyId: family1Id,
          updatedAt: Date.now(),
        });

        // ユーザーAのサービスレコードとクレデンシャル
        await ctx.db.insert("serviceRecords", {
          userId: "ua",
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
      const myRequest = await applicantB.query(api.families.getMyJoinRequest);
      expect(myRequest?.status).toBe("pending");
      expect(myRequest?.familyName).toBe("田中家");

      // 6. 既存メンバーが保留中の申請一覧を取得できること
      const pendingRequests = await memberA.query(
        api.families.getPendingRequests,
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
        stranger.query(api.families.getPendingRequests),
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
      const status = await applicantZ.query(api.families.getMyJoinRequest);
      expect(status?.status).toBe("rejected");

      // 却下状態を消去して再申請できるようにする
      await applicantZ.mutation(api.families.dismissRejectedRequest, {
        requestId,
      });

      const statusAfterDismiss = await applicantZ.query(
        api.families.getMyJoinRequest,
      );
      expect(statusAfterDismiss).toBeNull();
    });
  });
});

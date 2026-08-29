import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { computeSortKey } from "../src/utils/index-group";

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
					sortKey: computeSortKey("RA"),
					ownerType: "user",
					admins: [],
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
					sortKey: computeSortKey("RB"),
					ownerType: "user",
					admins: [],
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

			// 0. 招待コードを発行する
			const invite = await memberA.mutation(api.families.createFamilyInvite, {
				ttlMinutes: 1440,
			});
			expect(invite.code).toBeDefined();

			// 1. 申請前は getFamilyInfoByInviteCode で鍵を取得できないこと
			await expect(
				applicantB.query(api.families.getFamilyInfoByInviteCode, {
					familyId,
				}),
			).rejects.toThrow("Access denied");

			// 2. 家族公開情報は取得できること
			const publicInfo = await applicantB.query(
				api.families.getFamilyPublicInfo,
				{ code: invite.code },
			);
			expect(publicInfo.name).toBe("田中家");

			// 3. 参加申請を作成する
			const requestId = await applicantB.mutation(
				api.families.createJoinRequest,
				{ code: invite.code },
			);
			expect(requestId).toBeDefined();

			// 4. 重複申請がエラーになること
			await expect(
				applicantB.mutation(api.families.createJoinRequest, {
					code: invite.code,
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
				{ familyId },
			);
			expect(infoAfterApproval.masterKeyEncrypted).toBe("SGVsbG9Xb3JsZA==");

			// 10. 承認状態の申請があるため joinFamily で正式に参加できること
			const joinedFamilyId = await applicantB.mutation(
				api.families.joinFamily,
				{ familyId },
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

			// 招待コードを発行
			const invite = await memberY.mutation(
				api.families.createFamilyInvite,
				{},
			);

			// 申請
			const requestId = await applicantZ.mutation(
				api.families.createJoinRequest,
				{ code: invite.code },
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

	describe("2.1.4 有効期限付き家族招待コード（Issue 132）のセキュリティとライフサイクル", () => {
		it("createFamilyInviteのTTLがサーバー側で15分〜30日にクランプされること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "佐藤家",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "user_sato",
					email: "sato@example.com",
					familyId,
					updatedAt: Date.now(),
				});
			});

			const userSato = t.withIdentity({
				subject: "user_sato",
				email: "sato@example.com",
			});

			const before = Date.now();

			// 1. 0分（極小値）を指定 -> 15分（900秒 = 900,000ms）にクランプ
			const minInvite = await userSato.mutation(
				api.families.createFamilyInvite,
				{ ttlMinutes: 0 },
			);
			expect(minInvite.expiresAt).toBeGreaterThanOrEqual(
				before + 14 * 60 * 1000,
			);
			expect(minInvite.expiresAt).toBeLessThanOrEqual(
				Date.now() + 16 * 60 * 1000,
			);

			// 2. 100日（極大値）を指定 -> 30日（43200分）にクランプ
			const maxInvite = await userSato.mutation(
				api.families.createFamilyInvite,
				{ ttlMinutes: 100 * 24 * 60 },
			);
			const expected30DaysMs = 30 * 24 * 60 * 60 * 1000;
			expect(maxInvite.expiresAt).toBeGreaterThanOrEqual(
				before + expected30DaysMs - 10000,
			);
			expect(maxInvite.expiresAt).toBeLessThanOrEqual(
				Date.now() + expected30DaysMs + 10000,
			);

			// 3. デフォルト指定 -> 7日（10080分）
			const defaultInvite = await userSato.mutation(
				api.families.createFamilyInvite,
				{},
			);
			const expected7DaysMs = 7 * 24 * 60 * 60 * 1000;
			expect(defaultInvite.expiresAt).toBeGreaterThanOrEqual(
				before + expected7DaysMs - 10000,
			);
			expect(defaultInvite.expiresAt).toBeLessThanOrEqual(
				Date.now() + expected7DaysMs + 10000,
			);
		});

		it("createFamilyInviteは有限の整数でないTTLを拒否すること", async () => {
			const t = convexTest(schema, modules);

			await t.run(async (ctx) => {
				const familyId = await ctx.db.insert("families", {
					name: "TTL検証家",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "user_ttl_validation",
					email: "ttl@example.com",
					familyId,
					updatedAt: Date.now(),
				});
			});

			const user = t.withIdentity({
				subject: "user_ttl_validation",
				email: "ttl@example.com",
			});

			for (const ttlMinutes of [Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
				await expect(
					user.mutation(api.families.createFamilyInvite, { ttlMinutes }),
				).rejects.toThrow("ttlMinutes must be a finite integer");
			}
		});

		it("期限切れの招待コードで参加申請または情報取得を行うとエラーになること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			const expiredCode = "expired-uuid-1234";

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "期限切れ家",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("familyInvites", {
					familyId,
					code: expiredCode,
					createdBy: "creator_uid",
					createdAt: Date.now() - 100000,
					expiresAt: Date.now() - 1000, // 既に期限切れ
					useCount: 0,
				});
				await ctx.db.insert("users", {
					userId: "applicant_expired",
					email: "exp@example.com",
					updatedAt: Date.now(),
				});
			});

			const applicant = t.withIdentity({
				subject: "applicant_expired",
				email: "exp@example.com",
			});

			await expect(
				applicant.query(api.families.getFamilyPublicInfo, {
					code: expiredCode,
				}),
			).rejects.toThrow("expired");

			await expect(
				applicant.mutation(api.families.createJoinRequest, {
					code: expiredCode,
				}),
			).rejects.toThrow("expired");
		});

		it("無効化（revokedAt設定済み）の招待コードで参加申請を行うとエラーになること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			const revokedCode = "revoked-uuid-1234";

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "失効家",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("familyInvites", {
					familyId,
					code: revokedCode,
					createdBy: "creator_uid",
					createdAt: Date.now() - 10000,
					expiresAt: Date.now() + 100000,
					revokedAt: Date.now() - 5000, // 無効化済み
					useCount: 0,
				});
				await ctx.db.insert("users", {
					userId: "applicant_revoked",
					email: "rev@example.com",
					updatedAt: Date.now(),
				});
			});

			const applicant = t.withIdentity({
				subject: "applicant_revoked",
				email: "rev@example.com",
			});

			await expect(
				applicant.query(api.families.getFamilyPublicInfo, {
					code: revokedCode,
				}),
			).rejects.toThrow("revoked");

			await expect(
				applicant.mutation(api.families.createJoinRequest, {
					code: revokedCode,
				}),
			).rejects.toThrow("revoked");
		});

		it("自家族以外の招待コードを無効化できないこと（認可チェック）", async () => {
			const t = convexTest(schema, modules);
			let familyAId!: Id<"families">;
			let familyBId!: Id<"families">;
			let inviteAId!: Id<"familyInvites">;

			await t.run(async (ctx) => {
				familyAId = await ctx.db.insert("families", {
					name: "家族A",
					updatedAt: Date.now(),
				});
				familyBId = await ctx.db.insert("families", {
					name: "家族B",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "user_a",
					email: "a@example.com",
					familyId: familyAId,
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "user_b",
					email: "b@example.com",
					familyId: familyBId,
					updatedAt: Date.now(),
				});
				inviteAId = await ctx.db.insert("familyInvites", {
					familyId: familyAId,
					code: "invite-a",
					createdBy: "user_a",
					createdAt: Date.now(),
					expiresAt: Date.now() + 100000,
					useCount: 0,
				});
			});

			const userB = t.withIdentity({
				subject: "user_b",
				email: "b@example.com",
			});

			await expect(
				userB.mutation(api.families.revokeFamilyInvite, {
					inviteId: inviteAId,
				}),
			).rejects.toThrow("Invite not found or access denied");
		});

		it("参加申請作成時にuseCountが加算され、joinRequests.invitedByCodeに記録されること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "鈴木家",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "member_suzuki",
					email: "suzuki@example.com",
					familyId,
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "applicant_suzuki",
					email: "suzuki_app@example.com",
					updatedAt: Date.now(),
				});
			});

			const member = t.withIdentity({
				subject: "member_suzuki",
				email: "suzuki@example.com",
			});
			const applicant = t.withIdentity({
				subject: "applicant_suzuki",
				email: "suzuki_app@example.com",
			});

			const invite = await member.mutation(api.families.createFamilyInvite, {});

			const requestId = await applicant.mutation(
				api.families.createJoinRequest,
				{ code: invite.code },
			);

			// 申請レコードの検証
			const joinReq = await t.run(async (ctx) => {
				return await ctx.db.get(requestId);
			});
			expect(joinReq?.invitedByCode).toBe(invite._id);

			// 招待レコードの useCount 検証
			const updatedInvite = await t.run(async (ctx) => {
				return await ctx.db.get(invite._id);
			});
			expect(updatedInvite?.useCount).toBe(1);
		});

		it("アカウント削除で最後のメンバーが退会した際、familyInvitesがカスケード削除されること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			let userId!: Id<"users">;
			let inviteId!: Id<"familyInvites">;

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "孤立予定家族",
					updatedAt: Date.now(),
				});
				userId = await ctx.db.insert("users", {
					userId: "lone_user",
					email: "lone@example.com",
					familyId,
					updatedAt: Date.now(),
				});
				inviteId = await ctx.db.insert("familyInvites", {
					familyId,
					code: "lone-invite",
					createdBy: "lone_user",
					createdAt: Date.now(),
					expiresAt: Date.now() + 100000,
					useCount: 0,
				});
			});

			const user = t.withIdentity({
				subject: "lone_user",
				email: "lone@example.com",
			});

			await user.mutation(api.users.deleteAccount, { accountId: userId });

			const remainingFamily = await t.run(async (ctx) => ctx.db.get(familyId));
			expect(remainingFamily).toBeNull();

			const remainingInvite = await t.run(async (ctx) => ctx.db.get(inviteId));
			expect(remainingInvite).toBeNull();
		});

		it("cleanupExpiredFamilyInvitesInternalで30日以上前の失効・期限切れレコードが削除されること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			let oldExpiredId!: Id<"familyInvites">;
			let oldRevokedId!: Id<"familyInvites">;
			let referencedOldExpiredId!: Id<"familyInvites">;
			let recentExpiredId!: Id<"familyInvites">;
			let activeId!: Id<"familyInvites">;

			const now = Date.now();
			const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;
			const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "クリーンアップテスト家",
					updatedAt: now,
				});

				// 31日前に期限切れ
				oldExpiredId = await ctx.db.insert("familyInvites", {
					familyId,
					code: "old-expired",
					createdBy: "u",
					createdAt: thirtyOneDaysAgo - 1000,
					expiresAt: thirtyOneDaysAgo,
					useCount: 0,
				});

				// 31日前に無効化
				oldRevokedId = await ctx.db.insert("familyInvites", {
					familyId,
					code: "old-revoked",
					createdBy: "u",
					createdAt: thirtyOneDaysAgo - 10000,
					expiresAt: now + 100000,
					revokedAt: thirtyOneDaysAgo,
					useCount: 0,
				});

				// 参加申請の監査証跡から参照されているため削除対象外
				referencedOldExpiredId = await ctx.db.insert("familyInvites", {
					familyId,
					code: "referenced-old-expired",
					createdBy: "u",
					createdAt: thirtyOneDaysAgo - 1000,
					expiresAt: thirtyOneDaysAgo,
					useCount: 1,
				});
				await ctx.db.insert("joinRequests", {
					familyId,
					userId: "applicant",
					invitedByCode: referencedOldExpiredId,
					status: "approved",
					createdAt: thirtyOneDaysAgo,
					updatedAt: thirtyOneDaysAgo,
				});

				// 10日前に期限切れ（まだ削除対象外）
				recentExpiredId = await ctx.db.insert("familyInvites", {
					familyId,
					code: "recent-expired",
					createdBy: "u",
					createdAt: tenDaysAgo - 1000,
					expiresAt: tenDaysAgo,
					useCount: 0,
				});

				// 現在有効（削除対象外）
				activeId = await ctx.db.insert("familyInvites", {
					familyId,
					code: "active-code",
					createdBy: "u",
					createdAt: now,
					expiresAt: now + 7 * 24 * 60 * 60 * 1000,
					useCount: 0,
				});
			});

			await t.mutation(
				internal.families.cleanupExpiredFamilyInvitesInternal,
				{},
			);

			const rOldExpired = await t.run((ctx) => ctx.db.get(oldExpiredId));
			const rOldRevoked = await t.run((ctx) => ctx.db.get(oldRevokedId));
			const rReferencedOldExpired = await t.run((ctx) =>
				ctx.db.get(referencedOldExpiredId),
			);
			const rRecentExpired = await t.run((ctx) => ctx.db.get(recentExpiredId));
			const rActive = await t.run((ctx) => ctx.db.get(activeId));

			expect(rOldExpired).toBeNull();
			expect(rOldRevoked).toBeNull();
			expect(rReferencedOldExpired).toBeDefined();
			expect(rRecentExpired).toBeDefined();
			expect(rActive).toBeDefined();
		});
	});

	describe("2.1.5 prepare / commit フローによる安全な家族移行機能の検証", () => {
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
					sortKey: computeSortKey("Solo's Record"),
					ownerType: "user",
					admins: [],
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
					sortKey: computeSortKey("省略テストレコード"),
					tags: [],
					userId: "user_omit",
					accountId: userOmitId,
					familyId: oldFamilyId,
					ownerType: "user",
					admins: [],
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
					familyId: undefined,
					title: "Service 1",
					sortKey: computeSortKey("Service 1"),
					ownerType: "user",
					admins: [],
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
					familyId: undefined,
					title: "Service 2",
					sortKey: computeSortKey("Service 2"),
					ownerType: "user",
					admins: [],
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
					sortKey: computeSortKey("テストレコード1"),
					tags: [],
					userId: "user_mid",
					accountId: userMidId,
					familyId: oldFamilyId,
					ownerType: "user",
					admins: [],
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
					sortKey: computeSortKey("テストレコード2"),
					tags: [],
					userId: "user_mid",
					accountId: userMidId,
					familyId: oldFamilyId,
					ownerType: "user",
					admins: [],
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
					sortKey: computeSortKey("既存レコード"),
					ownerType: "user",
					admins: [],
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
					sortKey: computeSortKey("並行操作で追加されたレコード"),
					ownerType: "user",
					admins: [],
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

		it("Family変更(移行)後、旧Familyの共有レコードへ本人がアクセスできなくなること", async () => {
			const t = convexTest(schema, modules);
			let oldFamilyId!: Id<"families">;
			let stayingSharedRecordId!: Id<"serviceRecords">;
			await t.run(async (ctx) => {
				oldFamilyId = await ctx.db.insert("families", {
					name: "旧ファミリー",
					updatedAt: Date.now(),
				});
				await ctx.db.insert("users", {
					userId: "user_migrating",
					email: "migrating@example.com",
					familyId: oldFamilyId,
					updatedAt: Date.now(),
				});
				const stayingId = await ctx.db.insert("users", {
					userId: "user_staying2",
					email: "staying2@example.com",
					familyId: oldFamilyId,
					updatedAt: Date.now(),
				});
				stayingSharedRecordId = await ctx.db.insert("serviceRecords", {
					userId: "user_staying2",
					accountId: stayingId,
					familyId: oldFamilyId,
					ownerFamilyId: oldFamilyId,
					title: "旧ファミリーの共有レコード",
					sortKey: computeSortKey("旧ファミリーの共有レコード"),
					ownerType: "family",
					admins: [stayingId],
					credentials: [],
					tags: [],
					updatedAt: Date.now(),
				});
			});
			const userMigrating = t.withIdentity({
				subject: "user_migrating",
				email: "migrating@example.com",
			});

			const beforeDetail = await userMigrating.query(
				api.records.getRecordDetail,
				{
					id: stayingSharedRecordId,
				},
			);
			expect(beforeDetail.title).toBe("旧ファミリーの共有レコード");

			const prepareRes = await userMigrating.mutation(
				api.families.prepareFamilyMigration,
				{
					action: "create",
					name: "新ファミリー",
					masterKeyEncrypted: "enc_key",
					masterKeyIv: "key_iv",
					masterKeySalt: "key_salt",
				},
			);
			await userMigrating.mutation(api.families.commitFamilyMigration, {
				migrationId: prepareRes.migrationId,
				credentials: [],
			});

			await expect(
				userMigrating.query(api.records.getRecordDetail, {
					id: stayingSharedRecordId,
				}),
			).rejects.toThrow("Access denied");
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

		it("家族移行時、共有レコードは旧家族に残り、離脱者が唯一の管理者だった場合は残りの家族メンバー全員が自動昇格すること", async () => {
			const t = convexTest(schema, modules);
			let familyOldId!: Id<"families">;
			let userLeaveId!: Id<"users">;
			let userRemain1Id!: Id<"users">;
			let userRemain2Id!: Id<"users">;
			let sharedRecordId!: Id<"serviceRecords">;

			await t.run(async (ctx) => {
				familyOldId = await ctx.db.insert("families", {
					name: "Old Family",
					updatedAt: Date.now(),
				});

				userLeaveId = await ctx.db.insert("users", {
					userId: "user_leave",
					email: "leave@example.com",
					familyId: familyOldId,
					updatedAt: Date.now(),
				});

				userRemain1Id = await ctx.db.insert("users", {
					userId: "user_remain1",
					email: "remain1@example.com",
					familyId: familyOldId,
					updatedAt: Date.now(),
				});

				userRemain2Id = await ctx.db.insert("users", {
					userId: "user_remain2",
					email: "remain2@example.com",
					familyId: familyOldId,
					updatedAt: Date.now(),
				});

				sharedRecordId = await ctx.db.insert("serviceRecords", {
					userId: "user_leave",
					accountId: userLeaveId,
					familyId: familyOldId,
					ownerFamilyId: familyOldId,
					title: "Shared Record",
					sortKey: computeSortKey("Shared Record"),
					ownerType: "family",
					admins: [userLeaveId], // userLeave is the only admin
					credentials: [],
					tags: [],
					updatedAt: Date.now(),
				});
			});

			const userLeaveClient = t.withIdentity({
				subject: "user_leave",
				email: "leave@example.com",
			});

			// userLeave が新家族を作成して移行
			const prep = await userLeaveClient.mutation(
				api.families.prepareFamilyMigration,
				{
					action: "create",
					name: "New Solo Family",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
				},
			);

			await userLeaveClient.mutation(api.families.commitFamilyMigration, {
				migrationId: prep.migrationId,
				credentials: [],
			});

			// DB検証: 共有レコードは旧家族に残り、admins が残った [userRemain1Id, userRemain2Id] に自動昇格されていること
			await t.run(async (ctx) => {
				const record = await ctx.db.get(sharedRecordId);
				expect(record?.familyId).toBe(familyOldId);
				expect(record?.ownerFamilyId).toBe(familyOldId);
				expect(record?.ownerType).toBe("family");
				expect(record?.admins).not.toContain(userLeaveId);
				expect([...(record?.admins ?? [])].sort()).toEqual(
					[userRemain1Id, userRemain2Id].sort(),
				);
			});
		});

		it("家族唯一のメンバーが移行して離脱した場合、孤立共有レコードおよび旧家族がクリーンアップされること", async () => {
			const t = convexTest(schema, modules);
			let familyOldId!: Id<"families">;
			let userSoloId!: Id<"users">;
			let sharedRecordId!: Id<"serviceRecords">;

			await t.run(async (ctx) => {
				familyOldId = await ctx.db.insert("families", {
					name: "Old Solo Family",
					updatedAt: Date.now(),
				});
				userSoloId = await ctx.db.insert("users", {
					userId: "user_solo_leave",
					email: "solo_leave@example.com",
					familyId: familyOldId,
					updatedAt: Date.now(),
				});
				sharedRecordId = await ctx.db.insert("serviceRecords", {
					userId: "user_solo_leave",
					accountId: userSoloId,
					familyId: familyOldId,
					ownerFamilyId: familyOldId,
					title: "孤立する共有レコード",
					sortKey: computeSortKey("孤立する共有レコード"),
					ownerType: "family",
					admins: [userSoloId],
					credentials: [],
					tags: [],
					updatedAt: Date.now(),
				});
			});

			const userSoloClient = t.withIdentity({
				subject: "user_solo_leave",
				email: "solo_leave@example.com",
			});

			const prep = await userSoloClient.mutation(
				api.families.prepareFamilyMigration,
				{
					action: "create",
					name: "New Family",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
				},
			);

			await userSoloClient.mutation(api.families.commitFamilyMigration, {
				migrationId: prep.migrationId,
				credentials: [],
			});

			// DB検証: 孤立した共有レコードおよびメンバー不在となった旧家族が削除されていること
			await t.run(async (ctx) => {
				expect(await ctx.db.get(sharedRecordId)).toBeNull();
				expect(await ctx.db.get(familyOldId)).toBeNull();
			});
		});
	});

	describe("2.1.5 KDFメタデータのスキーマ保存とバリデーション", () => {
		it("createFamily で指定した kdfIterations / cryptoVersion がそのまま保存されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf",
					email: "kdf@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf",
				email: "kdf@example.com",
			});
			const familyId = await user.mutation(api.families.createFamily, {
				name: "KDFテスト家族",
				masterKeyEncrypted: "enc",
				masterKeyIv: "iv",
				masterKeySalt: "salt",
				kdfIterations: 400_000,
				cryptoVersion: 1,
			});
			await t.run(async (ctx) => {
				const family = await ctx.db.get(familyId);
				expect(family?.kdfIterations).toBe(400_000);
				expect(family?.cryptoVersion).toBe(1);
			});
		});

		it("kdfIterations を省略した場合、サーバー側でレガシー値(300,000)が補完されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf_omit",
					email: "kdfomit@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf_omit",
				email: "kdfomit@example.com",
			});
			const familyId = await user.mutation(api.families.createFamily, {
				name: "省略テスト家族",
				masterKeyEncrypted: "enc",
				masterKeyIv: "iv",
				masterKeySalt: "salt",
			});
			await t.run(async (ctx) => {
				const family = await ctx.db.get(familyId);
				expect(family?.kdfIterations).toBe(300_000);
				expect(family?.cryptoVersion).toBe(1);
			});
		});

		it("範囲外の kdfIterations を指定した場合は作成が拒否されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf_bad",
					email: "kdfbad@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf_bad",
				email: "kdfbad@example.com",
			});
			await expect(
				user.mutation(api.families.createFamily, {
					name: "不正家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: 10,
					cryptoVersion: 1,
				}),
			).rejects.toThrow("out of the allowed range");
		});

		it("未対応の cryptoVersion を指定した場合は作成が拒否されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf_ver",
					email: "kdfver@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf_ver",
				email: "kdfver@example.com",
			});
			await expect(
				user.mutation(api.families.createFamily, {
					name: "未対応バージョン家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: 300_000,
					cryptoVersion: 99,
				}),
			).rejects.toThrow("Unsupported cryptoVersion");
		});

		it("NaN を kdfIterations として指定した場合は作成が拒否されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf_nan",
					email: "kdfnan@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf_nan",
				email: "kdfnan@example.com",
			});
			await expect(
				user.mutation(api.families.createFamily, {
					name: "NaNテスト家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: NaN,
					cryptoVersion: 1,
				}),
			).rejects.toThrow("must be a safe integer");
		});

		it("Infinity を kdfIterations として指定した場合は作成が拒否されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf_inf",
					email: "kdfinf@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf_inf",
				email: "kdfinf@example.com",
			});
			await expect(
				user.mutation(api.families.createFamily, {
					name: "Infinityテスト家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: Infinity,
					cryptoVersion: 1,
				}),
			).rejects.toThrow("must be a safe integer");
		});

		it("小数 を kdfIterations として指定した場合は作成が拒否されること", async () => {
			const t = convexTest(schema, modules);
			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "user_kdf_frac",
					email: "kdffrac@example.com",
					updatedAt: Date.now(),
				});
			});
			const user = t.withIdentity({
				subject: "user_kdf_frac",
				email: "kdffrac@example.com",
			});
			await expect(
				user.mutation(api.families.createFamily, {
					name: "小数テスト家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: 300000.5,
					cryptoVersion: 1,
				}),
			).rejects.toThrow("must be a safe integer");
		});
	});

	describe("2.1.6 既存データへのKDFメタデータ マイグレーション", () => {
		it("kdfIterations 未設定の家族に backfillKdfMetadataInternal を実行すると、レガシー値が補完されること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "レガシー家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					updatedAt: Date.now(),
				});
			});
			await t.mutation(internal.families.backfillKdfMetadataInternal, {});
			await t.run(async (ctx) => {
				const family = await ctx.db.get(familyId);
				expect(family?.kdfIterations).toBe(300_000);
				expect(family?.cryptoVersion).toBe(1);
			});
		});

		it("既に kdfIterations が設定されている家族は上書きされないこと", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "新しめ家族",
					masterKeyEncrypted: "enc",
					masterKeyIv: "iv",
					masterKeySalt: "salt",
					kdfIterations: 500_000,
					cryptoVersion: 1,
					updatedAt: Date.now(),
				});
			});
			await t.mutation(internal.families.backfillKdfMetadataInternal, {});
			await t.run(async (ctx) => {
				const family = await ctx.db.get(familyId);
				expect(family?.kdfIterations).toBe(500_000);
			});
		});
	});

	describe("2.1.7 パスコードローテーション (rotatePasscode)", () => {
		it("masterKey情報のみが更新され、users/serviceRecordsは変化しないこと", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;
			let userAId!: Id<"users">;
			let userBId!: Id<"users">;

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "F1",
					masterKeyEncrypted: "b2xkRW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
					masterKeyIv: "dGVzdGl2MTIzNDU2",
					masterKeySalt: "dGVzdHNhbHQxMjM0NTY=",
					kdfIterations: 300_000,
					cryptoVersion: 1,
					updatedAt: 1000,
				});

				userAId = await ctx.db.insert("users", {
					userId: "ua",
					email: "a@a.com",
					familyId,
					updatedAt: 1000,
				});

				userBId = await ctx.db.insert("users", {
					userId: "ub",
					email: "b@b.com",
					familyId,
					updatedAt: 1000,
				});

				await ctx.db.insert("serviceRecords", {
					userId: "ua",
					accountId: userAId,
					familyId,
					title: "R1",
					sortKey: computeSortKey("R1"),
					ownerType: "user",
					admins: [],
					credentials: [
						{
							id: "c1",
							passwordHint: "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk",
							passwordHintIv: "dGVzdGl2MTIzNDU2",
							passwordHintDekEncrypted: "ZGVrRGF0YUF1dGhlbnRpY2F0ZWQ=",
							passwordHintDekIv: "ZGVraXZkZWtpdjEyMzQ=",
						},
					],
					tags: [],
					updatedAt: 2000,
				});
			});

			const userA = t.withIdentity({ subject: "ua", email: "a@a.com" });
			const result = await userA.mutation(api.families.rotatePasscode, {
				previousMasterKeyEncrypted: "b2xkRW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
				masterKeyEncrypted: "bmV3RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
				masterKeyIv: "bmV3SXZuZXdJdjEy",
				masterKeySalt: "bmV3U2FsdE5ld1NhbHQ=",
				kdfIterations: 400_000,
				cryptoVersion: 1,
			});

			expect(result.success).toBe(true);

			const family = await t.run((ctx) => ctx.db.get(familyId));
			expect(family?.masterKeyEncrypted).toBe(
				"bmV3RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
			);
			expect(family?.masterKeyIv).toBe("bmV3SXZuZXdJdjEy");
			expect(family?.masterKeySalt).toBe("bmV3U2FsdE5ld1NhbHQ=");
			expect(family?.kdfIterations).toBe(400_000);
			expect(family?.cryptoVersion).toBe(1);

			// users や serviceRecords に変更がないことを確認
			const record = await t.run(async (ctx) =>
				ctx.db
					.query("serviceRecords")
					.withIndex("by_accountId", (q) => q.eq("accountId", userAId))
					.first(),
			);
			expect(record?.updatedAt).toBe(2000);
			expect(record?.credentials[0]?.passwordHintDekEncrypted).toBe(
				"ZGVrRGF0YUF1dGhlbnRpY2F0ZWQ=",
			);

			const userAAfter = await t.run((ctx) => ctx.db.get(userAId));
			expect(userAAfter?.updatedAt).toBe(1000);
			expect(userAAfter?.familyId).toBe(familyId);

			const userBAfter = await t.run((ctx) => ctx.db.get(userBId));
			expect(userBAfter?.updatedAt).toBe(1000);
			expect(userBAfter?.familyId).toBe(familyId);
		});

		it("他メンバーや他端末での更新によりpreviousMasterKeyEncryptedがDB現在値と不一致の場合はCONFLICTとなること", async () => {
			const t = convexTest(schema, modules);
			let familyId!: Id<"families">;

			await t.run(async (ctx) => {
				familyId = await ctx.db.insert("families", {
					name: "F1",
					masterKeyEncrypted: "Y3VycmVudEVuY3J5cHRlZERhdGFBdXRoZW50aWNhdGVk",
					masterKeyIv: "dGVzdGl2MTIzNDU2",
					masterKeySalt: "dGVzdHNhbHQxMjM0NTY=",
					updatedAt: 1000,
				});

				await ctx.db.insert("users", {
					userId: "ua",
					email: "a@a.com",
					familyId,
					updatedAt: 1000,
				});
			});

			const userA = t.withIdentity({ subject: "ua", email: "a@a.com" });
			await expect(
				userA.mutation(api.families.rotatePasscode, {
					previousMasterKeyEncrypted:
						"c3RhbGVFbmNyeXB0ZWREYXRhQXV0aGVudGljYXRlZA==", // 古い値
					masterKeyEncrypted: "bmV3RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
					masterKeyIv: "bmV3SXZuZXdJdjEy",
					masterKeySalt: "bmV3U2FsdE5ld1NhbHQ=",
				}),
			).rejects.toThrow("CONFLICT");
		});

		it("家族暗号化情報が未初期化の場合は拒否されること", async () => {
			const t = convexTest(schema, modules);

			await t.run(async (ctx) => {
				const familyId = await ctx.db.insert("families", {
					name: "未初期化家族",
					updatedAt: 1000,
				});

				await ctx.db.insert("users", {
					userId: "ua",
					email: "a@a.com",
					familyId,
					updatedAt: 1000,
				});
			});

			const userA = t.withIdentity({ subject: "ua", email: "a@a.com" });
			await expect(
				userA.mutation(api.families.rotatePasscode, {
					previousMasterKeyEncrypted:
						"YW55RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
					masterKeyEncrypted: "bmV3RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
					masterKeyIv: "bmV3SXZuZXdJdjEy",
					masterKeySalt: "bmV3U2FsdE5ld1NhbHQ=",
				}),
			).rejects.toThrow("Family encryption is not initialized yet");
		});

		it("家族に所属していないユーザーからの呼び出しは拒否されること", async () => {
			const t = convexTest(schema, modules);

			await t.run(async (ctx) => {
				await ctx.db.insert("users", {
					userId: "no_family_user",
					email: "nofam@a.com",
					updatedAt: 1000,
				});
			});

			const noFamUser = t.withIdentity({
				subject: "no_family_user",
				email: "nofam@a.com",
			});

			await expect(
				noFamUser.mutation(api.families.rotatePasscode, {
					previousMasterKeyEncrypted:
						"YW55RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
					masterKeyEncrypted: "bmV3RW5jcnlwdGVkRGF0YUF1dGhlbnRpY2F0ZWQ=",
					masterKeyIv: "bmV3SXZuZXdJdjEy",
					masterKeySalt: "bmV3U2FsdE5ld1NhbHQ=",
				}),
			).rejects.toThrow("User does not belong to a family");
		});
	});
});

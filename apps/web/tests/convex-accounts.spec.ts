import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("PoohMa Multi-Account & Authorization Tests", () => {
	it("1つのFirebase Userで複数のPoohMa Accountを作成・取得できること", async () => {
		const t = convexTest(schema, modules);

		const user = t.withIdentity({
			subject: "firebase_user_1",
			email: "user1@example.com",
			emailVerified: true,
			name: "ユーザー1",
		});

		// 1. 初回ログイン（syncUser）でデフォルトアカウントが作成されること
		await user.mutation(api.users.syncUser, {
			displayName: "メインアカウント",
		});

		let accounts = await user.query(api.users.getAccounts, {});
		expect(accounts).toHaveLength(1);
		expect(accounts[0].displayName).toBe("メインアカウント");
		expect(accounts[0].userId).toBe("firebase_user_1");

		// 2. 2つ目のアカウントを作成
		const secondAccountId = await user.mutation(api.users.createAccount, {
			name: "仕事用アカウント",
		});
		expect(secondAccountId).toBeDefined();

		accounts = await user.query(api.users.getAccounts, {});
		expect(accounts).toHaveLength(2);
		expect(accounts.map((a) => a.displayName)).toContain("メインアカウント");
		expect(accounts.map((a) => a.displayName)).toContain("仕事用アカウント");
	});

	it("別ユーザーのアカウントIDを指定してクエリ/ミューテーションを実行した場合、Unauthorized 例外がスローされること", async () => {
		const t = convexTest(schema, modules);

		const userA = t.withIdentity({
			subject: "firebase_user_a",
			email: "a@example.com",
			emailVerified: true,
		});

		const userB = t.withIdentity({
			subject: "firebase_user_b",
			email: "b@example.com",
			emailVerified: true,
		});

		// ユーザーAのアカウント作成
		await userA.mutation(api.users.syncUser, { displayName: "User A" });
		const userAAccounts = await userA.query(api.users.getAccounts, {});
		const userAAccountId = userAAccounts[0]._id;

		// ユーザーBのアカウント作成
		await userB.mutation(api.users.syncUser, { displayName: "User B" });

		// ユーザーBがユーザーAのaccountIdを使ってプロフィール更新を試みる
		await expect(
			userB.mutation(api.users.updateProfile, {
				accountId: userAAccountId,
				displayName: "Hacked Name",
			}),
		).rejects.toThrow("Unauthorized");

		// ユーザーBがユーザーAのaccountIdを使ってgetRecordsを試みる
		await expect(
			userB.query(api.records.getRecords, {
				accountId: userAAccountId,
			}),
		).rejects.toThrow("Unauthorized");
	});

	it("同一ユーザー内の Account A (Family A) と Account B (Family B) のデータが分離されていること", async () => {
		const t = convexTest(schema, modules);

		const user = t.withIdentity({
			subject: "firebase_user_multi",
			email: "multi@example.com",
			emailVerified: true,
		});

		// アカウント1 (デフォルト) 作成
		await user.mutation(api.users.syncUser, { displayName: "Account A" });
		const accounts = await user.query(api.users.getAccounts, {});
		const accountAId = accounts[0]._id;

		// アカウント1で Family A を作成
		await user.mutation(api.families.createFamily, {
			accountId: accountAId,
			name: "Family A",
			masterKeyEncrypted: "encA",
			masterKeyIv: "ivA",
			masterKeySalt: "saltA",
		});

		// アカウント1で Record A を作成
		await user.mutation(api.records.createRecord, {
			accountId: accountAId,
			title: "Record in Family A",
			ownerType: "user",
			credentials: [],
			tags: ["tagA"],
		});

		// アカウント2 作成
		const accountBId = await user.mutation(api.users.createAccount, {
			name: "Account B",
		});

		// アカウント2で Family B を作成
		await user.mutation(api.families.createFamily, {
			accountId: accountBId,
			name: "Family B",
			masterKeyEncrypted: "encB",
			masterKeyIv: "ivB",
			masterKeySalt: "saltB",
		});

		// アカウント2で Record B を作成
		await user.mutation(api.records.createRecord, {
			accountId: accountBId,
			title: "Record in Family B",
			ownerType: "family",
			credentials: [],
			tags: ["tagB"],
		});

		// Account A でのレコード取得検証（Family Aのレコードのみ見え、Family Bのレコードは見えない）
		const recordsA = await user.query(api.records.getRecords, {
			accountId: accountAId,
		});
		expect(recordsA).toHaveLength(1);
		expect(recordsA[0].title).toBe("Record in Family A");
		expect(recordsA[0].accountId).toBe(accountAId);

		const tagsA = await user.query(api.records.getAvailableTags, {
			accountId: accountAId,
		});
		expect(tagsA).toEqual(["tagA"]);

		// Account B でのレコード取得検証（Family Bのレコードのみ見え、Family Aのレコードは見えない）
		const recordsB = await user.query(api.records.getRecords, {
			accountId: accountBId,
		});
		expect(recordsB).toHaveLength(1);
		expect(recordsB[0].title).toBe("Record in Family B");
		expect(recordsB[0].accountId).toBe(accountBId);

		const tagsB = await user.query(api.records.getAvailableTags, {
			accountId: accountBId,
		});
		expect(tagsB).toEqual(["tagB"]);
	});

	it("特定アカウントを削除した際、他のアカウントに影響を与えずに当該アカウントとそのデータのみが削除されること", async () => {
		const t = convexTest(schema, modules);

		const user = t.withIdentity({
			subject: "firebase_user_del",
			email: "del@example.com",
			emailVerified: true,
		});

		// Account 1
		await user.mutation(api.users.syncUser, { displayName: "Keep Account" });
		let accounts = await user.query(api.users.getAccounts, {});
		const keepAccountId = accounts[0]._id;

		// Account 2
		const removeAccountId = await user.mutation(api.users.createAccount, {
			name: "Remove Account",
		});

		accounts = await user.query(api.users.getAccounts, {});
		expect(accounts).toHaveLength(2);

		// Account 2 を削除
		await user.mutation(api.users.deleteAccount, {
			accountId: removeAccountId,
		});

		accounts = await user.query(api.users.getAccounts, {});
		expect(accounts).toHaveLength(1);
		expect(accounts[0]._id).toBe(keepAccountId);
		expect(accounts[0].displayName).toBe("Keep Account");
	});

	it("全体退会（deleteAllAccounts）を実行した際、該当Firebase UIDの全アカウントと関連データが完全に削除されること", async () => {
		const t = convexTest(schema, modules);

		const user = t.withIdentity({
			subject: "firebase_user_delete_all",
			email: "delall@example.com",
			emailVerified: true,
		});

		// Account 1
		await user.mutation(api.users.syncUser, { displayName: "Account 1" });
		const accounts1 = await user.query(api.users.getAccounts, {});
		const acc1Id = accounts1[0]._id;

		// Family 1
		await user.mutation(api.families.createFamily, {
			accountId: acc1Id,
			name: "Del Family",
		});

		await user.mutation(api.records.createRecord, {
			accountId: acc1Id,
			title: "Family Record",
			ownerType: "user",
			credentials: [],
			tags: [],
		});

		// Account 2
		const acc2Id = await user.mutation(api.users.createAccount, {
			name: "Account 2",
		});

		await user.mutation(api.families.createFamily, {
			accountId: acc2Id,
			name: "Family 2",
		});

		await user.mutation(api.records.createRecord, {
			accountId: acc2Id,
			title: "Family 2 Record",
			ownerType: "user",
			credentials: [],
			tags: [],
		});

		let allAccs = await user.query(api.users.getAccounts, {});
		expect(allAccs).toHaveLength(2);

		// 全体退会実行
		const result = await user.mutation(api.users.deleteAllAccounts, {});
		expect(result.success).toBe(true);
		expect(result.deletedCount).toBe(2);

		allAccs = await user.query(api.users.getAccounts, {});
		expect(allAccs).toHaveLength(0);
	});

	it("同一メールで別UIDとしてsyncUserした場合、joinRequestsとfamilyMigrationsのuserIdも新UIDへ引き継がれること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let joinRequestId!: Id<"joinRequests">;
		let migrationId!: Id<"familyMigrations">;

		const oldUser = t.withIdentity({
			subject: "old_uid",
			email: "migrate@example.com",
			emailVerified: true,
		});
		await oldUser.mutation(api.users.syncUser, { displayName: "旧アカウント" });

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Target Family",
				updatedAt: Date.now(),
			});
			joinRequestId = await ctx.db.insert("joinRequests", {
				familyId,
				userId: "old_uid",
				status: "pending",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			});
			migrationId = await ctx.db.insert("familyMigrations", {
				userId: "old_uid",
				targetFamilyId: familyId,
				serviceRecordIds: [],
				status: "PREPARED",
				createdAt: Date.now(),
				expiresAt: Date.now() + 1000 * 60 * 60,
			});
		});

		const newUser = t.withIdentity({
			subject: "new_uid",
			email: "migrate@example.com",
			emailVerified: true,
		});
		await newUser.mutation(api.users.syncUser, { displayName: "新アカウント" });

		await t.run(async (ctx) => {
			const joinRequest = await ctx.db.get(joinRequestId);
			expect(joinRequest?.userId).toBe("new_uid");

			const migration = await ctx.db.get(migrationId);
			expect(migration?.userId).toBe("new_uid");
		});
	});
});

import { EventEmitter } from "node:events";
import type http from "node:http";
import https from "node:https";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { computeSortKey } from "../src/utils/index-group";

const modules = import.meta.glob("../convex/**/*.ts");

// E2EE url-safety のモック
vi.mock("../src/utils/url-safety", () => {
	return {
		validateUrlSafety: vi.fn().mockResolvedValue("93.184.216.34"),
		isPrivateIp: vi.fn().mockReturnValue(false),
	};
});

// node:http / node:https のモック
vi.mock("node:http", () => {
	return {
		default: {
			request: vi.fn(),
		},
	};
});
vi.mock("node:https", () => {
	return {
		default: {
			request: vi.fn(),
		},
	};
});

describe("2.2.1 閲覧権限（ownerType）の境界値テスト (Convex版)", () => {
	it("「自分のみ (user)」「家族と共有 (family)」の設定が、DBクエリレベルで正しくフィルタリングされること", async () => {
		const t = convexTest(schema, modules);

		let family1Id!: Id<"families">;
		let userAId!: Id<"users">;

		// 1. 初期シードデータのインサート
		await t.run(async (ctx) => {
			// 家族1
			family1Id = await ctx.db.insert("families", {
				name: "Family 1",
				updatedAt: Date.now(),
			});

			// ユーザーA と ユーザーB (家族1所属)
			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId: family1Id,
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "user_b",
				email: "b@example.com",
				familyId: family1Id,
				updatedAt: Date.now(),
			});

			// ユーザーC (家族未所属)
			await ctx.db.insert("users", {
				userId: "user_c",
				email: "c@example.com",
				updatedAt: Date.now(),
			});

			// Aが個人レコードを作成
			await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId: family1Id,
				title: "Private Record A",
				sortKey: computeSortKey("Private Record A"),
				ownerType: "user",
				admins: [],
				tags: [],
				updatedAt: Date.now(),
			});

			// Aが家族共有レコードを作成
			await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId: family1Id,
				ownerFamilyId: family1Id,
				title: "Shared Record A",
				sortKey: computeSortKey("Shared Record A"),
				ownerType: "family",
				admins: [userAId],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		// ユーザーA自身のコンテキストでクエリ
		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
		const resA = await userA.query(api.records.getRecords, {});
		expect(resA).toHaveLength(2);

		// ユーザーBのコンテキストでクエリ (family共有レコードのみ取得できること)
		const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });
		const resB = await userB.query(api.records.getRecords, {});
		expect(resB).toHaveLength(1);
		expect(resB[0].title).toBe("Shared Record A");

		// ユーザーCのコンテキストでクエリ (取得できないこと)
		const userC = t.withIdentity({ subject: "user_c", email: "c@example.com" });
		const resC = await userC.query(api.records.getRecords, {});
		expect(resC).toHaveLength(0);
	});
});

describe("2.2.2. OGP取得処理のフェイルセーフとタイムアウト (Convex版)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	describe("正常系", () => {
		it("正しい OGP メタタグを持つ HTML から、タイトル・画像・説明文を抽出できること", async () => {
			const mockHtml = `
        <html>
          <head>
            <meta property="og:title" content="テストサービスタイトル" />
            <meta property="og:image" content="https://example.com/ogp.png" />
            <meta property="og:description" content="テストサービスの詳細説明文です。" />
          </head>
        </html>
      `;

			vi.mocked(https.request).mockImplementation(
				(_options: unknown, callback: unknown) => {
					const mockReq = Object.assign(new EventEmitter(), {
						end: () => {
							process.nextTick(() => {
								const mockRes = Object.assign(new EventEmitter(), {
									statusCode: 200,
									headers: {},
								}) as unknown as http.IncomingMessage;

								(callback as (res: http.IncomingMessage) => void)(mockRes);

								mockRes.emit("data", Buffer.from(mockHtml));
								mockRes.emit("end");
							});
						},
						destroy: vi.fn(),
					});
					return mockReq as unknown as http.ClientRequest;
				},
			);

			const t = convexTest(schema, modules);
			const user = t.withIdentity({
				subject: "user_ogp",
				email: "ogp@example.com",
			});
			const res = await user.action(api.actions.getOgpInfo, {
				url: "https://example.com",
			});

			expect(res.title).toBe("テストサービスタイトル");
			expect(res.image).toBe("https://example.com/ogp.png");
			expect(res.description).toBe("テストサービスの詳細説明文です。");
		});
	});
});

describe("2.2.3 CSVインポートのバリデーションと境界値 (Convex版)", () => {
	it("正常なデータ行と不正なデータ行が混在する場合、部分インポートが行われ失敗詳細が返ること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "CSV Test Family",
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "csv_user",
				email: "csv@example.com",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "csv_user",
			email: "csv@example.com",
		});

		// 正常2件 + タイトル空の不正1件
		const rows = [
			{
				title: "Netflix",
				url: "https://netflix.com",
				ownerType: "user" as const,
				credentials: [],
				tags: [],
			},
			{
				title: "",
				url: "https://invalid.com",
				ownerType: "user" as const,
				credentials: [],
				tags: [],
			}, // タイトル空 → 失敗
			{
				title: "Amazon Prime",
				url: "https://amazon.co.jp",
				ownerType: "family" as const,
				adminEmails: ["csv@example.com"],
				credentials: [],
				tags: [],
			},
		];

		const result = await user.mutation(api.records.importRecords, {
			records: rows,
		});

		expect(result.successes).toBe(2);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].row).toBe(2);
		expect(result.failures[0].reason).toContain("タイトル");

		// DBに2件登録されていること
		await t.run(async (ctx) => {
			const records = await ctx.db
				.query("serviceRecords")
				.withIndex("by_userId", (q) => q.eq("userId", "csv_user"))
				.collect();
			expect(records).toHaveLength(2);
			const titles = records.map((r) => r.title).sort();
			expect(titles).toEqual(["Amazon Prime", "Netflix"]);
		});
	});

	it("501件のデータを渡した場合、500件上限エラーがスローされること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Limit Test Family",
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "limit_user",
				email: "limit@example.com",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "limit_user",
			email: "limit@example.com",
		});

		const rows = Array.from({ length: 501 }, (_, i) => ({
			title: `Record ${i + 1}`,
			ownerType: "user" as const,
			credentials: [],
			tags: [],
		}));

		await expect(
			user.mutation(api.records.importRecords, { records: rows }),
		).rejects.toThrow("最大500行");
	});

	it("家族未所属のユーザーが実行した場合、エラーがスローされること", async () => {
		const t = convexTest(schema, modules);

		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				userId: "no_family_user",
				email: "nofamily@example.com",
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "no_family_user",
			email: "nofamily@example.com",
		});

		const rows = [
			{
				title: "Test",
				ownerType: "user" as const,
				credentials: [],
				tags: [],
			},
		];

		await expect(
			user.mutation(api.records.importRecords, { records: rows }),
		).rejects.toThrow("User does not belong to a family");
	});

	it("タグ数が上限（20個）を超える行はインポートに失敗し、詳細が返ること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Tag Limit Test Family",
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "tag_limit_user",
				email: "taglimit@example.com",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "tag_limit_user",
			email: "taglimit@example.com",
		});

		const rows = [
			{
				title: "20 Tags Record",
				ownerType: "user" as const,
				credentials: [],
				tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
			},
			{
				title: "21 Tags Record",
				ownerType: "user" as const,
				credentials: [],
				tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
			},
		];

		const result = await user.mutation(api.records.importRecords, {
			records: rows,
		});

		expect(result.successes).toBe(1);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0].row).toBe(2);
		expect(result.failures[0].reason).toContain("20個まで");
	});
});

describe("Drive型ACLモデルのCRUDと共有機能テスト", () => {
	it("getOwnedRecords は自分が所有する個人レコードと自分が管理者である共有レコードを返し、adminEmailsを付与すること", async () => {
		const t = convexTest(schema, modules);
		let family1Id!: Id<"families">;
		let userAId!: Id<"users">;
		let userBId!: Id<"users">;

		await t.run(async (ctx) => {
			family1Id = await ctx.db.insert("families", {
				name: "Family 1",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId: family1Id,
				updatedAt: Date.now(),
			});

			userBId = await ctx.db.insert("users", {
				userId: "user_b",
				email: "b@example.com",
				familyId: family1Id,
				updatedAt: Date.now(),
			});

			// User A personal record
			await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId: family1Id,
				title: "A's Private",
				sortKey: computeSortKey("A's Private"),
				ownerType: "user",
				admins: [],
				tags: [],
				updatedAt: Date.now(),
			});

			// User B shared record where only B is admin
			await ctx.db.insert("serviceRecords", {
				userId: "user_b",
				accountId: userBId,
				familyId: family1Id,
				ownerFamilyId: family1Id,
				title: "B's Shared",
				sortKey: computeSortKey("B's Shared"),
				ownerType: "family",
				admins: [userBId],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

		// getRecords returns both
		const allRecords = await userA.query(api.records.getRecords, {});
		expect(allRecords).toHaveLength(2);

		// getOwnedRecords returns only records manageable by A (A's Private)
		const ownedRecords = await userA.query(api.records.getOwnedRecords, {});
		expect(ownedRecords).toHaveLength(1);
		expect(ownedRecords[0].title).toBe("A's Private");
		expect(ownedRecords[0].adminEmails).toBeDefined();
	});

	it("ワンタップ共有 (shareRecord) とワンタップ解除 (unshareRecord) が正しく動作すること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let recordId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Test Family",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "user_b",
				email: "b@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			recordId = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				title: "Record To Share",
				sortKey: computeSortKey("Record To Share"),
				ownerType: "user",
				admins: [],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
		const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

		// 共有前: B は閲覧不可
		await expect(
			userB.query(api.records.getRecordDetail, { id: recordId }),
		).rejects.toThrow("Access denied");

		// A がワンタップ共有
		await userA.mutation(api.records.shareRecord, { id: recordId });

		// 共有後: B も閲覧可能
		const sharedDetail = await userB.query(api.records.getRecordDetail, {
			id: recordId,
		});
		expect(sharedDetail.title).toBe("Record To Share");

		// B は管理者ではないため unshare 不可
		await expect(
			userB.mutation(api.records.unshareRecord, { id: recordId }),
		).rejects.toThrow("Access denied");

		// A は管理者なので unshare 可能
		await userA.mutation(api.records.unshareRecord, { id: recordId });

		// 解除後: B は再度閲覧不可
		await expect(
			userB.query(api.records.getRecordDetail, { id: recordId }),
		).rejects.toThrow("Access denied");
	});

	it("管理者追加 (addRecordAdmin) と管理者解除 (removeRecordAdmin) が正しく動作すること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let userBId!: Id<"users">;
		let sharedRecordId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Test Family",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			userBId = await ctx.db.insert("users", {
				userId: "user_b",
				email: "b@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			sharedRecordId = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				ownerFamilyId: familyId,
				title: "Shared Record",
				sortKey: computeSortKey("Shared Record"),
				ownerType: "family",
				admins: [userAId],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
		const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

		// A が B を管理者に昇格
		await userA.mutation(api.records.addRecordAdmin, {
			id: sharedRecordId,
			targetAccountId: userBId,
		});

		// B を管理者から解除
		await userA.mutation(api.records.removeRecordAdmin, {
			id: sharedRecordId,
			targetAccountId: userBId,
		});

		// B は解除されたので削除不可（Access denied）
		await expect(
			userB.mutation(api.records.deleteRecord, { id: sharedRecordId }),
		).rejects.toThrow("Access denied");

		// A は管理者のままなので削除可能
		await expect(
			userA.mutation(api.records.deleteRecord, { id: sharedRecordId }),
		).resolves.not.toThrow();
	});

	it("一括共有 (bulkShareRecords) と一括解除 (bulkUnshareRecords) が正しく動作すること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let r1Id!: Id<"serviceRecords">;
		let r2Id!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Test Family",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			r1Id = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				title: "R1",
				sortKey: computeSortKey("R1"),
				ownerType: "user",
				admins: [],
				tags: [],
				updatedAt: Date.now(),
			});

			r2Id = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				title: "R2",
				sortKey: computeSortKey("R2"),
				ownerType: "user",
				admins: [],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

		// 一括共有
		const shareRes = await userA.mutation(api.records.bulkShareRecords, {
			ids: [r1Id, r2Id],
		});
		expect(shareRes.sharedCount).toBe(2);

		await t.run(async (ctx) => {
			const r1 = await ctx.db.get(r1Id);
			expect(r1?.ownerType).toBe("family");
			expect(r1?.admins).toContain(userAId);

			const r2 = await ctx.db.get(r2Id);
			expect(r2?.ownerType).toBe("family");
			expect(r2?.admins).toContain(userAId);
		});

		// 一括解除
		const unshareRes = await userA.mutation(api.records.bulkUnshareRecords, {
			ids: [r1Id, r2Id],
		});
		expect(unshareRes.unsharedCount).toBe(2);

		await t.run(async (ctx) => {
			const r1 = await ctx.db.get(r1Id);
			expect(r1?.ownerType).toBe("user");
			expect(r1?.admins).toEqual([]);

			const r2 = await ctx.db.get(r2Id);
			expect(r2?.ownerType).toBe("user");
			expect(r2?.admins).toEqual([]);
		});
	});

	it("Zodによる文字数制限バリデーションが機能し、違反した入力ではエラーが返ること", async () => {
		const t = convexTest(schema, modules);
		let family1Id!: Id<"families">;

		await t.run(async (ctx) => {
			family1Id = await ctx.db.insert("families", {
				name: "Family 1",
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId: family1Id,
				updatedAt: Date.now(),
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

		// Title exceeds 255 chars
		await expect(
			userA.mutation(api.records.createRecord, {
				title: "a".repeat(256),
				ownerType: "user",
				credentials: [],
				tags: [],
			}),
		).rejects.toThrow("Validation failed");

		// Credential label exceeds 100 chars
		await expect(
			userA.mutation(api.records.createRecord, {
				title: "Valid Title",
				ownerType: "user",
				credentials: [
					{
						id: "cred1",
						label: "a".repeat(101),
					},
				],
				tags: [],
			}),
		).rejects.toThrow("Validation failed");
	});

	it("updateRecord で titleReading を指定しない更新を行った場合、既存の titleReading が保持されること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let recordId!: Id<"serviceRecords">;
		let userAId!: Id<"users">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Test Family",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			recordId = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				title: "Amazon",
				titleReading: "あまぞん",
				sortKey: computeSortKey("Amazon", "あまぞん"),
				ownerType: "user",
				admins: [],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

		// titleReading を含めずに更新を実行
		await userA.mutation(api.records.updateRecord, {
			id: recordId,
			data: {
				title: "Amazon Renewed",
				ownerType: "user",
				credentials: [],
				tags: [],
			},
		});

		await t.run(async (ctx) => {
			const updated = await ctx.db.get(recordId);
			expect(updated?.title).toBe("Amazon Renewed");
			expect(updated?.titleReading).toBe("あまぞん");
		});
	});
});

describe("件数境界値テスト", () => {
	it("createRecordで11件のcredentialsを送信するとバリデーションエラーになること", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const familyId = await ctx.db.insert("families", {
				name: "Test Family",
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_cap",
				email: "cap@example.com",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "user_cap",
			email: "cap@example.com",
		});

		await expect(
			user.mutation(api.records.createRecord, {
				title: "Too many credentials",
				ownerType: "user",
				credentials: Array.from({ length: 11 }, (_, i) => ({
					id: `cred_${i}`,
					label: `Cred${i}`,
				})),
				tags: [],
			}),
		).rejects.toThrow("Validation failed");
	});

	it("createRecordで10件ちょうどのcredentialsは登録できること", async () => {
		const t = convexTest(schema, modules);
		await t.run(async (ctx) => {
			const familyId = await ctx.db.insert("families", {
				name: "Test Family",
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_cap2",
				email: "cap2@example.com",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "user_cap2",
			email: "cap2@example.com",
		});

		await expect(
			user.mutation(api.records.createRecord, {
				title: "Exactly 10 credentials",
				ownerType: "user",
				credentials: Array.from({ length: 10 }, (_, i) => ({
					id: `cred_${i}`,
					label: `Cred${i}`,
				})),
				tags: [],
			}),
		).resolves.toBeDefined();
	});

	it("createCredential: 途中のクレデンシャル削除後もorderが重複せず既存の最大値+1で採番されること", async () => {
		const t = convexTest(schema, modules);
		let recordId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			const familyId = await ctx.db.insert("families", {
				name: "Order Test Family",
				updatedAt: Date.now(),
			});
			const accountId = await ctx.db.insert("users", {
				userId: "user_order",
				email: "order@example.com",
				familyId,
				updatedAt: Date.now(),
			});
			recordId = await ctx.db.insert("serviceRecords", {
				userId: "user_order",
				accountId,
				familyId,
				title: "Order Test Record",
				tags: [],
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "user_order",
			email: "order@example.com",
		});

		// 2件追加 (order: 0, 1)
		const cred0Id = await user.mutation(api.records.createCredential, {
			recordId,
			label: "Cred 0",
		});
		const cred1Id = await user.mutation(api.records.createCredential, {
			recordId,
			label: "Cred 1",
		});

		// 最初の1件（order: 0）を削除（残るは order: 1 のみ、件数1）
		await user.mutation(api.records.deleteCredential, { id: cred0Id });

		// 新たに1件追加（件数ベースだと 1 になり重複するが、max+1 なら 2 になる）
		const cred2Id = await user.mutation(api.records.createCredential, {
			recordId,
			label: "Cred 2",
		});

		await t.run(async (ctx) => {
			const cred1 = await ctx.db.get(cred1Id);
			const cred2 = await ctx.db.get(cred2Id);
			expect(cred1?.order).toBe(1);
			expect(cred2?.order).toBe(2);
		});
	});
});

describe("2.2.8 CSVエクスポート（fetchRecordsForExport）の権限・整合性検証", () => {
	it("未認証時に Unauthenticated エラーをスローすること", async () => {
		const t = convexTest(schema, modules);
		await expect(
			t.mutation(api.records.fetchRecordsForExport, {}),
		).rejects.toThrow("Unauthenticated");
	});

	it("自身の所有レコード（個人・自身が管理者の家族レコード）のみ取得され、クレデンシャルと管理者メールが付与されること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let userBId!: Id<"users">;
		let personalRecAId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Export Family",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_export_a",
				email: "export_a@example.com",
				displayName: "エクスポートA",
				familyId,
				updatedAt: Date.now(),
			});

			userBId = await ctx.db.insert("users", {
				userId: "user_export_b",
				email: "export_b@example.com",
				displayName: "エクスポートB",
				familyId,
				updatedAt: Date.now(),
			});

			// Aの個人レコード
			personalRecAId = await ctx.db.insert("serviceRecords", {
				title: "A Personal Record",
				userId: "user_export_a",
				accountId: userAId,
				familyId,
				ownerType: "user",
				tags: [],
				updatedAt: Date.now(),
			});

			// Aが管理者の家族共有レコード
			await ctx.db.insert("serviceRecords", {
				title: "Shared Admin A Record",
				userId: "user_export_a",
				accountId: userAId,
				familyId,
				ownerType: "family",
				ownerFamilyId: familyId,
				admins: [userAId],
				tags: [],
				updatedAt: Date.now(),
			});

			// Bが管理者の家族共有レコード（Aは管理者ではない）
			await ctx.db.insert("serviceRecords", {
				title: "Shared Admin B Record",
				userId: "user_export_b",
				accountId: userBId,
				familyId,
				ownerType: "family",
				ownerFamilyId: familyId,
				admins: [userBId],
				tags: [],
				updatedAt: Date.now(),
			});

			// Bの個人レコード
			await ctx.db.insert("serviceRecords", {
				title: "B Personal Record",
				userId: "user_export_b",
				accountId: userBId,
				familyId,
				ownerType: "user",
				tags: [],
				updatedAt: Date.now(),
			});

			// Aの個人レコードにクレデンシャルを追加
			await ctx.db.insert("credentials", {
				recordId: personalRecAId,
				label: "Main Login",
				loginId: "a_login_id",
				passwordHint: "hint_text",
				passwordHintIv: "iv_text",
				order: 0,
				updatedAt: Date.now(),
			});
		});

		const userAClient = t.withIdentity({
			subject: "user_export_a",
			email: "export_a@example.com",
		});

		// ユーザーAでエクスポート実行
		const results = await userAClient.mutation(
			api.records.fetchRecordsForExport,
			{
				accountId: userAId,
				deviceName: "Test Device",
				browser: "Chrome",
				os: "Windows",
			},
		);

		// Aの個人レコードとAが管理者の家族レコードの2件のみ取得されること
		expect(results).toHaveLength(2);
		const titles = results.map((r) => r.title);
		expect(titles).toContain("A Personal Record");
		expect(titles).toContain("Shared Admin A Record");
		expect(titles).not.toContain("Shared Admin B Record");
		expect(titles).not.toContain("B Personal Record");

		// クレデンシャルと管理者メールの検証
		const personalRec = results.find((r) => r.title === "A Personal Record");
		expect(personalRec?.credentials).toHaveLength(1);
		expect(personalRec?.credentials[0].loginId).toBe("a_login_id");

		const sharedRec = results.find((r) => r.title === "Shared Admin A Record");
		expect(sharedRec?.adminEmails).toEqual(["export_a@example.com"]);
	});

	it("他人の accountId を指定した場合は Unauthorized で拒否されること", async () => {
		const t = convexTest(schema, modules);

		let userBId!: Id<"users">;

		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				userId: "user_legit_a",
				email: "legit_a@example.com",
				updatedAt: Date.now(),
			});

			userBId = await ctx.db.insert("users", {
				userId: "user_victim_b",
				email: "victim_b@example.com",
				updatedAt: Date.now(),
			});
		});

		const userAClient = t.withIdentity({
			subject: "user_legit_a",
			email: "legit_a@example.com",
		});

		// ユーザーAがユーザーBの accountId を指定してエクスポートを試みる
		await expect(
			userAClient.mutation(api.records.fetchRecordsForExport, {
				accountId: userBId,
			}),
		).rejects.toThrow("Unauthorized");
	});
});

describe("同時編集検知と楽観的ロック競合防止（FR-REC-15）", () => {
	it("編集セッションの開始・ハートビート・終了・アクティブ編集者一覧が正しく動作すること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let userBId!: Id<"users">;
		let recordId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Family Concurrency",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				displayName: "ユーザーA",
				familyId,
				updatedAt: Date.now(),
			});

			userBId = await ctx.db.insert("users", {
				userId: "user_b",
				email: "b@example.com",
				displayName: "ユーザーB",
				familyId,
				updatedAt: Date.now(),
			});

			recordId = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				ownerFamilyId: familyId,
				title: "Concurrent Record",
				sortKey: computeSortKey("Concurrent Record"),
				ownerType: "family",
				admins: [userAId],
				tags: [],
				updatedAt: 1000,
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
		const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

		// 初期状態では編集者なし
		let editors = await userA.query(api.records.getActiveEditors, { recordId });
		expect(editors).toHaveLength(0);

		// 1. ユーザーAが編集セッションを開始
		await userA.mutation(api.records.startEditingSession, { recordId });

		editors = await userB.query(api.records.getActiveEditors, { recordId });
		expect(editors).toHaveLength(1);
		expect(editors[0].accountId).toBe(userAId);
		expect(editors[0].displayName).toBe("ユーザーA");
		expect(editors[0].email).toBe("a@example.com");
		expect(editors[0].isCurrentAccount).toBe(false); // Bから見た場合

		const sessionUpdatedAtA = editors[0].updatedAt;

		// 2. ユーザーBも編集セッションを開始（複数人の同時編集）
		await userB.mutation(api.records.startEditingSession, { recordId });

		editors = await userA.query(api.records.getActiveEditors, { recordId });
		expect(editors).toHaveLength(2);
		const editorIds = editors.map((e) => e.accountId);
		expect(editorIds).toContain(userAId);
		expect(editorIds).toContain(userBId);

		// 3. ハートビートで更新日時が更新されること
		await userA.mutation(api.records.heartbeatEditingSession, { recordId });
		const editorsAfterHeartbeat = await userA.query(
			api.records.getActiveEditors,
			{ recordId },
		);
		const updatedSessionA = editorsAfterHeartbeat.find(
			(e) => e.accountId === userAId,
		);
		expect(updatedSessionA?.updatedAt).toBeGreaterThanOrEqual(
			sessionUpdatedAtA,
		);

		// 4. ユーザーAが編集を終了
		await userA.mutation(api.records.endEditingSession, { recordId });
		editors = await userB.query(api.records.getActiveEditors, { recordId });
		expect(editors).toHaveLength(1);
		expect(editors[0].accountId).toBe(userBId);
	});

	it("TTL（5分）を超過したセッションが getActiveEditors から自動除外されること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let recordId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Family TTL",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			recordId = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				ownerFamilyId: familyId,
				title: "TTL Record",
				sortKey: computeSortKey("TTL Record"),
				ownerType: "family",
				admins: [userAId],
				tags: [],
				updatedAt: 1000,
			});

			// 6分前の期限切れセッションを手動挿入
			await ctx.db.insert("recordEditingSessions", {
				recordId,
				accountId: userAId,
				updatedAt: Date.now() - 6 * 60 * 1000,
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

		// 期限切れセッションは取得されないこと
		const editors = await userA.query(api.records.getActiveEditors, {
			recordId,
		});
		expect(editors).toHaveLength(0);

		// ハートビートで復活（現在時刻に更新）
		await userA.mutation(api.records.heartbeatEditingSession, { recordId });
		const activeEditors = await userA.query(api.records.getActiveEditors, {
			recordId,
		});
		expect(activeEditors).toHaveLength(1);
		expect(activeEditors[0].accountId).toBe(userAId);
	});

	it("updateRecord で古い updatedAt を渡した場合に CONFLICT エラーで更新が拒否され、一致時は成功してセッションが消去されること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let recordId!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Family Conflict",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_a",
				email: "a@example.com",
				displayName: "ユーザーA",
				familyId,
				updatedAt: Date.now(),
			});

			await ctx.db.insert("users", {
				userId: "user_b",
				email: "b@example.com",
				displayName: "ユーザーB",
				familyId,
				updatedAt: Date.now(),
			});

			recordId = await ctx.db.insert("serviceRecords", {
				userId: "user_a",
				accountId: userAId,
				familyId,
				ownerFamilyId: familyId,
				title: "Original Title",
				sortKey: computeSortKey("Original Title"),
				ownerType: "family",
				admins: [userAId],
				tags: [],
				updatedAt: 5000,
			});
		});

		const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
		const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

		// ユーザーAがセッション開始して保存
		await userA.mutation(api.records.startEditingSession, { recordId });
		let editors = await userA.query(api.records.getActiveEditors, { recordId });
		expect(editors).toHaveLength(1);

		// ユーザーAが updatedAt: 5000 で正常更新
		await userA.mutation(api.records.updateRecord, {
			id: recordId,
			updatedAt: 5000,
			data: {
				title: "Title updated by A",
				tags: [],
				credentials: [],
			},
		});

		// Aの保存完了に伴い、編集セッションが自動削除されること
		editors = await userA.query(api.records.getActiveEditors, { recordId });
		expect(editors).toHaveLength(0);

		// DBの updatedAt が進んでいることを確認
		const recordAfterA = await t.run((ctx) => ctx.db.get(recordId));
		expect(recordAfterA?.title).toBe("Title updated by A");
		const newUpdatedAt = recordAfterA?.updatedAt;
		expect(newUpdatedAt).toBeGreaterThan(5000);

		// ユーザーBが以前の古い updatedAt: 5000 を渡して更新を試みると競合拒否されること
		await expect(
			userB.mutation(api.records.updateRecord, {
				id: recordId,
				updatedAt: 5000, // 古いタイムスタンプ
				data: {
					title: "Title updated by B (conflicted)",
					tags: [],
					credentials: [],
				},
			}),
		).rejects.toThrow("CONFLICT");

		// レコードはBの変更で上書きされていないこと
		const recordAfterConflict = await t.run((ctx) => ctx.db.get(recordId));
		expect(recordAfterConflict?.title).toBe("Title updated by A");

		// force: true を指定した場合は、古いタイムスタンプでも上書きできること
		await userB.mutation(api.records.updateRecord, {
			id: recordId,
			updatedAt: 5000,
			force: true,
			data: {
				title: "Title force updated by B",
				tags: [],
				credentials: [],
			},
		});

		const recordAfterForce = await t.run((ctx) => ctx.db.get(recordId));
		expect(recordAfterForce?.title).toBe("Title force updated by B");
	});
});

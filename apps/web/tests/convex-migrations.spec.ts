import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("マイグレーションの動作検証 (migrateCredentialsToTable)", () => {
	it("旧credentials埋め込み配列を持つレコードが独立したcredentialsテーブルに正しく移行され、serviceRecords.credentialsが削除されること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let record1Id!: Id<"serviceRecords">;
		let record2Id!: Id<"serviceRecords">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "Migration Family",
				updatedAt: Date.now(),
			});

			userAId = await ctx.db.insert("users", {
				userId: "user_mig_a",
				email: "miga@example.com",
				familyId,
				updatedAt: Date.now(),
			});

			// 旧スキーマ形式のレコードを投入（credentials埋め込み配列が存在）
			const insertRecord = ctx.db.insert as (
				table: "serviceRecords",
				value: Record<string, unknown>,
			) => Promise<Id<"serviceRecords">>;

			record1Id = await insertRecord("serviceRecords", {
				userId: "user_mig_a",
				accountId: userAId,
				familyId,
				title: "Netflix",
				titleReading: "ねっとふりっくす",
				ownerType: "user",
				credentials: [
					{
						id: "cred-1",
						label: "メイン",
						loginId: "user@example.com",
						passwordHint: "hint1",
						passwordHintIv: "iv1",
					},
					{
						id: "cred-2",
						label: "サブ",
						loginId: "sub@example.com",
					},
				],
				tags: [],
				updatedAt: Date.now(),
			});

			record2Id = await insertRecord("serviceRecords", {
				userId: "user_mig_a",
				accountId: userAId,
				familyId,
				title: "Amazon Prime",
				ownerType: "family",
				ownerFamilyId: familyId,
				admins: [userAId],
				credentials: [],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		// マイグレーション internal mutation の実行
		const res = await t.mutation(
			internal.migrations.migrateCredentialsToTable,
			{},
		);
		expect(res.totalRecords).toBe(2);
		expect(res.migratedRecords).toBe(2);
		expect(res.migratedCredentials).toBe(2);

		// 移行後の DB ドキュメント状態を検証
		await t.run(async (ctx) => {
			const record1Doc = (await ctx.db.get(record1Id)) as Record<
				string,
				unknown
			>;
			expect(record1Doc.credentials).toBeUndefined(); // 物理削除されていること

			const creds1 = await ctx.db
				.query("credentials")
				.withIndex("by_recordId", (q) => q.eq("recordId", record1Id))
				.collect();
			expect(creds1).toHaveLength(2);
			expect(creds1[0].label).toBe("メイン");
			expect(creds1[0].loginId).toBe("user@example.com");
			expect(creds1[0].passwordHint).toBe("hint1");
			expect(creds1[0].order).toBe(0);
			expect(creds1[1].label).toBe("サブ");
			expect(creds1[1].loginId).toBe("sub@example.com");
			expect(creds1[1].order).toBe(1);

			const record2Doc = (await ctx.db.get(record2Id)) as Record<
				string,
				unknown
			>;
			expect(record2Doc.credentials).toBeUndefined();

			const creds2 = await ctx.db
				.query("credentials")
				.withIndex("by_recordId", (q) => q.eq("recordId", record2Id))
				.collect();
			expect(creds2).toHaveLength(0);
		});
	});
});

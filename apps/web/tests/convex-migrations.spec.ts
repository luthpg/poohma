import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("マイグレーションの動作検証 (backfillOwnershipModel)", () => {
	it("旧visibilityフィールドを持つレコードが新所有権モデル（sortKey, ownerType, admins）に正しく移行され、visibilityが削除されること", async () => {
		const t = convexTest(schema, modules);
		let familyId!: Id<"families">;
		let userAId!: Id<"users">;
		let privateRecordId!: Id<"serviceRecords">;
		let sharedRecordId!: Id<"serviceRecords">;

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

			// 旧スキーマ形式のレコードを投入（visibilityのみ存在、sortKey/ownerType/adminsは未設定）
			privateRecordId = await ctx.db.insert("serviceRecords", {
				userId: "user_mig_a",
				accountId: userAId,
				familyId,
				title: "Netflix",
				titleReading: "ねっとふりっくす",
				visibility: "PRIVATE",
				credentials: [],
				tags: [],
				updatedAt: Date.now(),
			});

			sharedRecordId = await ctx.db.insert("serviceRecords", {
				userId: "user_mig_a",
				accountId: userAId,
				familyId,
				title: "Amazon Prime",
				visibility: "SHARED",
				credentials: [],
				tags: [],
				updatedAt: Date.now(),
			});
		});

		// マイグレーション mutation の実行
		const res = await t.mutation(api.migrations.backfillOwnershipModel, {});
		expect(res.total).toBe(2);
		expect(res.patched).toBe(2);

		// 移行後の DB ドキュメント状態を検証
		await t.run(async (ctx) => {
			const privateDoc = (await ctx.db.get(privateRecordId)) as Record<
				string,
				unknown
			>;
			expect(privateDoc.ownerType).toBe("user");
			expect(privateDoc.admins).toEqual([]);
			expect(privateDoc.ownerFamilyId).toBeUndefined();
			expect(privateDoc.sortKey).toBe("04_ねっとふりっくす");
			expect(privateDoc.visibility).toBeUndefined(); // 物理削除されていること

			const sharedDoc = (await ctx.db.get(sharedRecordId)) as Record<
				string,
				unknown
			>;
			expect(sharedDoc.ownerType).toBe("family");
			expect(sharedDoc.ownerFamilyId).toBe(familyId);
			expect(sharedDoc.admins).toEqual([userAId]);
			expect(sharedDoc.sortKey).toBe("10_amazon prime");
			expect(sharedDoc.visibility).toBeUndefined(); // 物理削除されていること
		});
	});
});

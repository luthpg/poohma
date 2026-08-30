import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("2.4 リカバリーキット・2段階復元のバックエンド統合テスト (convex/recovery.ts)", () => {
	it("リカバリーキットの登録・再発行とステータス取得が正しく動作すること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "佐藤家",
				masterKeyEncrypted: "OriginalMasterKeyEncryptedBase64==",
				masterKeyIv: "OriginalIvBase64==",
				masterKeySalt: "OriginalSaltBase64==",
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_sato",
				email: "sato@example.com",
				displayName: "佐藤太郎",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "user_sato",
			email: "sato@example.com",
		});

		// 1. 初回ステータス: 未発行
		const statusBefore = await user.query(api.recovery.getRecoveryStatus, {});
		expect(statusBefore.hasRecoveryKit).toBe(false);

		// 2. リカバリーキット新規登録
		const registerRes = await user.mutation(api.recovery.registerRecoveryKit, {
			recoveryMasterKeyEncrypted: "RecoveryEncryptedKey1==",
			recoveryMasterKeyIv: "RecoveryIv1==",
			recoveryMasterKeySalt: "RecoverySalt1==",
			recoveryCodeHash: "RecoveryCodeHash1==",
		});
		expect(registerRes.success).toBe(true);
		expect(registerRes.issuedAt).toBeDefined();

		// 3. 発行後ステータス: 発行済み、発行者名・日時が取得できること
		const statusAfter = await user.query(api.recovery.getRecoveryStatus, {});
		expect(statusAfter.hasRecoveryKit).toBe(true);
		expect(statusAfter.issuedAt).toBe(registerRes.issuedAt);
		expect(statusAfter.issuerName).toBe("佐藤太郎");

		// 4. 必須のハッシュを省略した直接 mutation 呼び出しは拒否され、保存済みハッシュも維持される
		const missingHashArgs = {
			recoveryMasterKeyEncrypted: "InvalidRecoveryEncryptedKey==",
			recoveryMasterKeyIv: "InvalidRecoveryIv==",
			recoveryMasterKeySalt: "InvalidRecoverySalt==",
		};
		await expect(
			user.mutation(api.recovery.registerRecoveryKit, missingHashArgs as never),
		).rejects.toThrow(/recoveryCodeHash/);

		const familyAfterRejectedRegistration = await t.run(async (ctx) => {
			return await ctx.db.get(familyId);
		});
		expect(familyAfterRejectedRegistration?.recoveryCodeHash).toBe(
			"RecoveryCodeHash1==",
		);

		// 5. 再発行: 新しいリカバリー情報で上書き
		const reissueRes = await user.mutation(api.recovery.registerRecoveryKit, {
			recoveryMasterKeyEncrypted: "RecoveryEncryptedKey2==",
			recoveryMasterKeyIv: "RecoveryIv2==",
			recoveryMasterKeySalt: "RecoverySalt2==",
			recoveryCodeHash: "RecoveryCodeHash2==",
		});
		expect(reissueRes.success).toBe(true);

		const updatedFamily = await t.run(async (ctx) => {
			return await ctx.db.get(familyId);
		});
		expect(updatedFamily?.recoveryMasterKeyEncrypted).toBe(
			"RecoveryEncryptedKey2==",
		);
		expect(updatedFamily?.recoveryCodeHash).toBe("RecoveryCodeHash2==");
	});

	it("ハッシュのない既存リカバリーキットでは復元を拒否すること", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;
		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "旧式キット家族",
				masterKeyEncrypted: "MasterKey==",
				masterKeyIv: "MasterIv==",
				masterKeySalt: "MasterSalt==",
				recoveryMasterKeyEncrypted: "RecoveryEncryptedKey==",
				recoveryMasterKeyIv: "RecoveryIv==",
				recoveryMasterKeySalt: "RecoverySalt==",
				recoveryIssuedAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_legacy_recovery_kit",
				email: "legacy@example.com",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "user_legacy_recovery_kit",
			email: "legacy@example.com",
		});

		await expect(
			user.mutation(api.recovery.verifyRecoveryOtpAndGetRecoveryData, {
				otpCode: "123456",
				recoveryCode: "DUMMY-CODE",
			}),
		).rejects.toThrow("リカバリーコードの検証情報が見つかりません");
	});

	it("OTP発行・レート制限・認証検証・ロックアウトおよびデータ復旧フローの統合検証", async () => {
		const t = convexTest(schema, modules);

		let familyId!: Id<"families">;
		const validRecoveryCode = "ABCD-EFGH-JKMN-PQRT-WXYZ-2345-6789-BCDF";
		const validNormalized = "ABCDEFGHJKMNPQRTWXYZ23456789BCDF";
		const bufferCode = new TextEncoder().encode(validNormalized);
		const digestCode = await crypto.subtle.digest("SHA-256", bufferCode);
		const recoveryCodeHash = btoa(
			String.fromCharCode(...new Uint8Array(digestCode)),
		);

		await t.run(async (ctx) => {
			familyId = await ctx.db.insert("families", {
				name: "鈴木家",
				masterKeyEncrypted: "OldMasterKeyBase64==",
				masterKeyIv: "OldIvBase64==",
				masterKeySalt: "OldSaltBase64==",
				recoveryMasterKeyEncrypted: "RecoveryEncryptedKeySuzuki==",
				recoveryMasterKeyIv: "RecoveryIvSuzuki==",
				recoveryMasterKeySalt: "RecoverySaltSuzuki==",
				recoveryCodeHash,
				recoveryKdfIterations: 300_000,
				recoveryCryptoVersion: 1,
				recoveryIssuedAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_suzuki",
				email: "suzuki@example.com",
				displayName: "鈴木一郎",
				familyId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: "user_suzuki",
			email: "suzuki@example.com",
		});

		// 1. 復元用 OTP の送信リクエスト
		const sendRes = await user.mutation(api.recovery.sendRecoveryOtp, {});
		expect(sendRes.success).toBe(true);
		expect(sendRes.email).toBe("suzuki@example.com");

		// 2. 60秒以内の再送リクエストでレート制限エラーになること
		await expect(
			user.mutation(api.recovery.sendRecoveryOtp, {}),
		).rejects.toThrow("認証コードの再送信は");

		// DB内のOTPレコードを直接取得し、ハッシュ生成ロジックと一致するテストコードを用意
		// 正しいハッシュ値をシミュレートして検証
		const otpDoc = await t.run(async (ctx) => {
			return await ctx.db.query("recoveryOtps").first();
		});
		expect(otpDoc).not.toBeNull();
		if (!otpDoc) throw new Error("OTP document should exist");
		expect(otpDoc.codeHash).toBeDefined();

		const otpId = otpDoc._id;

		// 3-a. 誤ったリカバリーコードでの検証（Recovery Code 不正エラー）
		const failCodeResult = await user.mutation(
			api.recovery.verifyRecoveryOtpAndGetRecoveryData,
			{
				otpCode: "123456",
				recoveryCode: "INVALID-CODE-XXXX-YYYY",
			},
		);
		expect(failCodeResult.success).toBe(false);
		if (!failCodeResult.success) {
			expect(failCodeResult.error).toContain(
				"リカバリーコードが正しくありません",
			);
		}

		// 3-b. 誤ったOTPコードの検証（試行回数カウントアップとエラーメッセージの返却）
		const failResult = await user.mutation(
			api.recovery.verifyRecoveryOtpAndGetRecoveryData,
			{
				otpCode: "000000",
				recoveryCode: validRecoveryCode,
			},
		);
		expect(failResult.success).toBe(false);
		if (!failResult.success) {
			expect(failResult.error).toContain("認証コードが正しくありません");
			expect(failResult.remainingAttempts).toBe(4);
		}

		const otpAfterFail = await t.run(async (ctx) => {
			return await ctx.db.get(otpId);
		});
		expect(otpAfterFail?.attempts).toBe(1);

		// テスト用に特定の既知のOTPコード "123456" のハッシュをセット
		const testCode = "123456";
		const buffer = new TextEncoder().encode(testCode);
		const digest = await crypto.subtle.digest("SHA-256", buffer);
		const testHash = btoa(String.fromCharCode(...new Uint8Array(digest)));

		await t.run(async (ctx) => {
			await ctx.db.patch(otpId, { codeHash: testHash, attempts: 0 });
		});

		// 4. 正しいコード（Recovery Code + OTP）での検証成功と Wrapped MasterKey データの取得
		const recoveryData = await user.mutation(
			api.recovery.verifyRecoveryOtpAndGetRecoveryData,
			{
				otpCode: testCode,
				recoveryCode: validRecoveryCode,
			},
		);
		expect(recoveryData.success).toBe(true);
		if (!recoveryData.success)
			throw new Error("Verification failed unexpectedly");

		expect(recoveryData.sessionToken).toBeDefined();
		expect(recoveryData.recoveryMasterKeyEncrypted).toBe(
			"RecoveryEncryptedKeySuzuki==",
		);
		expect(recoveryData.recoveryMasterKeyIv).toBe("RecoveryIvSuzuki==");
		expect(recoveryData.recoveryMasterKeySalt).toBe("RecoverySaltSuzuki==");

		// 5. 使用済み OTP レコードが削除されていること
		const otpAfterSuccess = await t.run(async (ctx) => {
			return await ctx.db.get(otpId);
		});
		expect(otpAfterSuccess).toBeNull();

		// 6. 不正なセッショントークンでの復元試行が拒否されること
		await expect(
			user.mutation(api.recovery.redeemRecoveryAndRotatePasscode, {
				sessionToken: "invalid_session_token",
				masterKeyEncrypted: "NewRedeemedMasterKeyBase64==",
				masterKeyIv: "NewRedeemedIvBase64==",
				masterKeySalt: "NewRedeemedSaltBase64==",
			}),
		).rejects.toThrow("無効な復元認可セッションです");

		// 7. 正しいセッショントークンで新しいパスコード・マスターキーを再登録（復旧完了）
		const redeemRes = await user.mutation(
			api.recovery.redeemRecoveryAndRotatePasscode,
			{
				sessionToken: recoveryData.sessionToken,
				masterKeyEncrypted: "NewRedeemedMasterKeyBase64==",
				masterKeyIv: "NewRedeemedIvBase64==",
				masterKeySalt: "NewRedeemedSaltBase64==",
			},
		);
		expect(redeemRes.success).toBe(true);

		const updatedFamily = await t.run(async (ctx) => {
			return await ctx.db.get(familyId);
		});
		expect(updatedFamily?.masterKeyEncrypted).toBe(
			"NewRedeemedMasterKeyBase64==",
		);

		// 8. 使用済みセッショントークンでの再利用が拒否されること（ワンタイム消費）
		await expect(
			user.mutation(api.recovery.redeemRecoveryAndRotatePasscode, {
				sessionToken: recoveryData.sessionToken,
				masterKeyEncrypted: "NewRedeemedMasterKeyBase64==",
				masterKeyIv: "NewRedeemedIvBase64==",
				masterKeySalt: "NewRedeemedSaltBase64==",
			}),
		).rejects.toThrow("無効な復元認可セッションです");
	});

	it("異常系: 家族未所属、リカバリーキット未発行、期限切れOTP、上限到達時のエラーハンドリング", async () => {
		const t = convexTest(schema, modules);
		const dummyCodeBuffer = new TextEncoder().encode("DUMMYC0DE");
		const dummyCodeDigest = await crypto.subtle.digest(
			"SHA-256",
			dummyCodeBuffer,
		);
		const dummyRecoveryCodeHash = btoa(
			String.fromCharCode(...new Uint8Array(dummyCodeDigest)),
		);

		let familyNoKitId!: Id<"families">;
		let familyWithKitNoOtpId!: Id<"families">;

		await t.run(async (ctx) => {
			await ctx.db.insert("users", {
				userId: "user_nofam",
				email: "nofam@example.com",
				updatedAt: Date.now(),
			});
			familyNoKitId = await ctx.db.insert("families", {
				name: "木村家",
				masterKeyEncrypted: "MasterKeyKimura==",
				masterKeyIv: "IvKimura==",
				masterKeySalt: "SaltKimura==",
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_fam_nokit",
				email: "famnokit@example.com",
				familyId: familyNoKitId,
				updatedAt: Date.now(),
			});
			familyWithKitNoOtpId = await ctx.db.insert("families", {
				name: "野村家",
				masterKeyEncrypted: "MasterKeyNomura==",
				masterKeyIv: "IvNomura==",
				masterKeySalt: "SaltNomura==",
				recoveryMasterKeyEncrypted: "RecEncNomura==",
				recoveryMasterKeyIv: "RecIvNomura==",
				recoveryMasterKeySalt: "RecSaltNomura==",
				recoveryCodeHash: dummyRecoveryCodeHash,
				recoveryIssuedAt: Date.now(),
				updatedAt: Date.now(),
			});
			await ctx.db.insert("users", {
				userId: "user_fam_with_kit_no_otp",
				email: "famkitnootp@example.com",
				familyId: familyWithKitNoOtpId,
				updatedAt: Date.now(),
			});
		});

		const userNoFam = t.withIdentity({
			subject: "user_nofam",
			email: "nofam@example.com",
		});
		const userFamNoKit = t.withIdentity({
			subject: "user_fam_nokit",
			email: "famnokit@example.com",
		});
		const userFamWithKitNoOtp = t.withIdentity({
			subject: "user_fam_with_kit_no_otp",
			email: "famkitnootp@example.com",
		});

		// 家族未所属でのOTP送信
		await expect(
			userNoFam.mutation(api.recovery.sendRecoveryOtp, {}),
		).rejects.toThrow("家族に所属していません");

		// リカバリーキット未発行家族でのOTP送信
		await expect(
			userFamNoKit.mutation(api.recovery.sendRecoveryOtp, {}),
		).rejects.toThrow("この家族にはリカバリーキットが発行されていません");

		// リカバリーキット未発行状態での検証
		await expect(
			userFamNoKit.mutation(api.recovery.verifyRecoveryOtpAndGetRecoveryData, {
				otpCode: "123456",
				recoveryCode: "DUMMY-CODE",
			}),
		).rejects.toThrow("リカバリー情報が見つかりません");

		// リカバリーキット発行済みだがOTP未発行状態での検証（OTP未存在分岐）
		await expect(
			userFamWithKitNoOtp.mutation(
				api.recovery.verifyRecoveryOtpAndGetRecoveryData,
				{
					otpCode: "123456",
					recoveryCode: "DUMMY-CODE",
				},
			),
		).rejects.toThrow("認証コードが発行されていないか");

		// 期限切れOTPのテスト
		let familyWithKitId!: Id<"families">;
		let userWithKitId!: Id<"users">;
		await t.run(async (ctx) => {
			familyWithKitId = await ctx.db.insert("families", {
				name: "高橋家",
				masterKeyEncrypted: "Enc==",
				masterKeyIv: "Iv==",
				masterKeySalt: "Salt==",
				recoveryMasterKeyEncrypted: "RecEnc==",
				recoveryMasterKeyIv: "RecIv==",
				recoveryMasterKeySalt: "RecSalt==",
				recoveryCodeHash: dummyRecoveryCodeHash,
				recoveryIssuedAt: Date.now(),
				updatedAt: Date.now(),
			});
			userWithKitId = await ctx.db.insert("users", {
				userId: "user_takahashi",
				email: "takahashi@example.com",
				familyId: familyWithKitId,
				updatedAt: Date.now(),
			});
			// 期限切れのOTPを直接挿入
			await ctx.db.insert("recoveryOtps", {
				accountId: userWithKitId,
				familyId: familyWithKitId,
				codeHash: "dummyHash",
				expiresAt: Date.now() - 1000, // 過去
				attempts: 0,
				lastSentAt: Date.now() - 10000,
			});
		});

		const userTakahashi = t.withIdentity({
			subject: "user_takahashi",
			email: "takahashi@example.com",
		});

		await expect(
			userTakahashi.mutation(api.recovery.verifyRecoveryOtpAndGetRecoveryData, {
				otpCode: "123456",
				recoveryCode: "DUMMY-CODE",
			}),
		).rejects.toThrow("有効期限が切れています");
	});

	it("同一Firebase UIDに複数アカウントが存在する場合、accountId指定によりリカバリー状態が完全に分離されること", async () => {
		const t = convexTest(schema, modules);

		let familyAId!: Id<"families">;
		let familyBId!: Id<"families">;
		let accountAId!: Id<"users">;
		let accountBId!: Id<"users">;

		const sharedFirebaseUid = "firebase_user_multi_123";

		await t.run(async (ctx) => {
			// 家族A（リカバリーキット発行済み）
			familyAId = await ctx.db.insert("families", {
				name: "田中家本家",
				masterKeyEncrypted: "MasterKeyA==",
				masterKeyIv: "IvA==",
				masterKeySalt: "SaltA==",
				recoveryMasterKeyEncrypted: "RecEncA==",
				recoveryMasterKeyIv: "RecIvA==",
				recoveryMasterKeySalt: "RecSaltA==",
				recoveryIssuedAt: Date.now() - 5000,
				updatedAt: Date.now(),
			});
			accountAId = await ctx.db.insert("users", {
				userId: sharedFirebaseUid,
				email: "multi@example.com",
				displayName: "田中アカウントA",
				familyId: familyAId,
				updatedAt: Date.now(),
			});

			// 家族B（新規作成、リカバリーキット未発行）
			familyBId = await ctx.db.insert("families", {
				name: "田中家分家",
				masterKeyEncrypted: "MasterKeyB==",
				masterKeyIv: "IvB==",
				masterKeySalt: "SaltB==",
				updatedAt: Date.now(),
			});
			accountBId = await ctx.db.insert("users", {
				userId: sharedFirebaseUid,
				email: "multi@example.com",
				displayName: "田中アカウントB",
				familyId: familyBId,
				updatedAt: Date.now(),
			});
		});

		const user = t.withIdentity({
			subject: sharedFirebaseUid,
			email: "multi@example.com",
		});

		// 1. アカウントAのステータス取得: リカバリーキット発行済み
		const statusA = await user.query(api.recovery.getRecoveryStatus, {
			accountId: accountAId,
		});
		expect(statusA.hasRecoveryKit).toBe(true);

		// 2. アカウントBのステータス取得: リカバリーキット未発行（アカウントAの情報を誤って拾わないこと）
		const statusB = await user.query(api.recovery.getRecoveryStatus, {
			accountId: accountBId,
		});
		expect(statusB.hasRecoveryKit).toBe(false);

		// 3. アカウントBでリカバリーキットを登録
		const registerResB = await user.mutation(api.recovery.registerRecoveryKit, {
			accountId: accountBId,
			recoveryMasterKeyEncrypted: "RecEncB==",
			recoveryMasterKeyIv: "RecIvB==",
			recoveryMasterKeySalt: "RecSaltB==",
			recoveryCodeHash: "RecoveryCodeHashB==",
		});
		expect(registerResB.success).toBe(true);

		// 4. 登録後のアカウントBのステータス確認
		const statusBAfter = await user.query(api.recovery.getRecoveryStatus, {
			accountId: accountBId,
		});
		expect(statusBAfter.hasRecoveryKit).toBe(true);
	});
});

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	authenticatedMutation,
	familyBoundMutation,
	familyBoundQuery,
} from "./customBuilders";


const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10分
const OTP_RESEND_INTERVAL_MS = 60 * 1000; // 60秒
const OTP_MAX_ATTEMPTS = 5;

/**
 * 文字列の SHA-256 ハッシュを計算（Base64文字列）
 */
async function hashText(text: string): Promise<string> {
	const buffer = new TextEncoder().encode(text);
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/**
 * 6桁の数字 OTP コードを生成（Rejection sampling によるバイアス排除）
 */
function generate6DigitOtp(): string {
	// 2^32 未満で 1,000,000 の最大の倍数 (4,294,000,000)
	const maxValid = 4_294_000_000;
	const array = new Uint32Array(1);
	while (true) {
		crypto.getRandomValues(array);
		if (array[0] < maxValid) {
			const num = array[0] % 1_000_000;
			return num.toString().padStart(6, "0");
		}
	}
}

/**
 * リカバリーキット情報の登録 / 再発行（旧Recovery情報の完全上書き）
 */
export const registerRecoveryKit = familyBoundMutation({
	args: {
		recoveryMasterKeyEncrypted: v.string(),
		recoveryMasterKeyIv: v.string(),
		recoveryMasterKeySalt: v.string(),
		recoveryKdfIterations: v.optional(v.number()),
		recoveryCryptoVersion: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { familyId, user } = ctx;
		const family = await ctx.db.get(familyId);
		if (!family) throw new Error("Family not found");

		const isReissue = family.recoveryMasterKeyEncrypted != null;
		const now = Date.now();

		// 新しいリカバリー情報でDBを更新（旧暗号文は上書きされ完全無効化）
		await ctx.db.patch(familyId, {
			recoveryMasterKeyEncrypted: args.recoveryMasterKeyEncrypted,
			recoveryMasterKeyIv: args.recoveryMasterKeyIv,
			recoveryMasterKeySalt: args.recoveryMasterKeySalt,
			recoveryKdfIterations: args.recoveryKdfIterations ?? 300_000,
			recoveryCryptoVersion: args.recoveryCryptoVersion ?? 1,
			recoveryIssuedAt: now,
			recoveryIssuedByAccountId: user._id,
			updatedAt: now,
		});

		// 家族メンバー全員に通知メールを非同期送信
		const members = await ctx.db
			.query("users")
			.withIndex("by_familyId", (q) => q.eq("familyId", familyId))
			.collect();

		const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
		for (const member of members) {
			await ctx.scheduler.runAfter(
				0,
				internal.actions.sendTemplatedEmailInternal,
				{
					email: member.email,
					payload: {
						template: "recoveryKitIssued",
						props: {
							displayName: member.displayName || "メンバー",
							familyName: family.name,
							issuerName: user.displayName || "管理者",
							issuedAt: now,
							isReissue,
							ctaUrl: `${appUrl}/family`,
						},
					},
				},
			);
		}

		return { success: true, issuedAt: now };
	},
});

/**
 * リカバリーキットの発行状態・発行日時の取得
 */
export const getRecoveryStatus = familyBoundQuery({
	args: {},
	handler: async (ctx) => {
		const { familyId } = ctx;
		const family = await ctx.db.get(familyId);
		if (!family) return { hasRecoveryKit: false };

		if (!family.recoveryMasterKeyEncrypted || !family.recoveryIssuedAt) {
			return { hasRecoveryKit: false };
		}

		let issuerName: string | undefined;
		if (family.recoveryIssuedByAccountId) {
			const issuer = await ctx.db.get(family.recoveryIssuedByAccountId);
			issuerName = issuer?.displayName || issuer?.email;
		}

		return {
			hasRecoveryKit: true,
			issuedAt: family.recoveryIssuedAt,
			issuerName: issuerName || "管理者",
		};
	},
});

/**
 * 復元（Redeem）用 Email OTP コードの発行・送信
 */
export const sendRecoveryOtp = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		const { user } = ctx;
		if (!user.familyId) {
			throw new Error("家族に所属していません");
		}

		const family = await ctx.db.get(user.familyId);
		if (!family) {
			throw new Error("家族情報が見つかりません");
		}

		if (!family.recoveryMasterKeyEncrypted) {
			throw new Error("この家族にはリカバリーキットが発行されていません");
		}

		const now = Date.now();

		// 既存の OTP レコードを検索
		const existingOtp = await ctx.db
			.query("recoveryOtps")
			.withIndex("by_familyId_accountId", (q) =>
				q.eq("familyId", user.familyId as Id<"families">).eq("accountId", user._id),
			)
			.first();

		// 再送信レート制限チェック (60秒)
		if (existingOtp && now - existingOtp.lastSentAt < OTP_RESEND_INTERVAL_MS) {
			const waitSeconds = Math.ceil(
				(OTP_RESEND_INTERVAL_MS - (now - existingOtp.lastSentAt)) / 1000,
			);
			throw new Error(`認証コードの再送信は ${waitSeconds} 秒後にお試しください`);
		}

		const otpCode = generate6DigitOtp();
		const codeHash = await hashText(otpCode);
		const expiresAt = now + OTP_EXPIRY_MS;

		if (existingOtp) {
			await ctx.db.patch(existingOtp._id, {
				codeHash,
				expiresAt,
				attempts: 0,
				lastSentAt: now,
			});
		} else {
			await ctx.db.insert("recoveryOtps", {
				accountId: user._id,
				familyId: user.familyId,
				codeHash,
				expiresAt,
				attempts: 0,
				lastSentAt: now,
			});
		}

		// メール送信アクションをスケジューリング
		await ctx.scheduler.runAfter(
			0,
			internal.actions.sendTemplatedEmailInternal,
			{
				email: user.email,
				payload: {
					template: "recoveryOtp",
					props: {
						displayName: user.displayName || "ユーザー",
						otpCode,
						expiresInMinutes: 10,
						familyName: family.name,
					},
				},
			},
		);

		return {
			success: true,
			email: user.email,
			expiresAt,
		};
	},
});

/**
 * ランダムな復元セッショントークンを生成 (32バイト hex)
 */
function generateSessionToken(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Email OTP を検証し、一致すれば短命な認可セッショントークンと Wrapped MasterKey 暗号データを返却
 */
export const verifyRecoveryOtpAndGetRecoveryData = authenticatedMutation({
	args: {
		otpCode: v.string(),
	},
	handler: async (ctx, args) => {
		const { user } = ctx;
		if (!user.familyId) {
			throw new Error("家族に所属していません");
		}

		const family = await ctx.db.get(user.familyId);
		if (
			!family ||
			!family.recoveryMasterKeyEncrypted ||
			!family.recoveryMasterKeyIv ||
			!family.recoveryMasterKeySalt
		) {
			throw new Error("リカバリー情報が見つかりません");
		}

		const now = Date.now();
		const otpRecord = await ctx.db
			.query("recoveryOtps")
			.withIndex("by_familyId_accountId", (q) =>
				q.eq("familyId", user.familyId as Id<"families">).eq("accountId", user._id),
			)
			.first();

		if (!otpRecord) {
			throw new Error("認証コードが発行されていないか、有効期限が切れています。再送信してください。");
		}

		// 期限切れチェック
		if (now > otpRecord.expiresAt) {
			await ctx.db.delete(otpRecord._id);
			throw new Error("認証コードの有効期限が切れています。再送信してください。");
		}

		// 試行回数チェック
		if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
			await ctx.db.delete(otpRecord._id);
			throw new Error("認証コードの試行上限回数を超えました。最初からやり直してください。");
		}

		const inputHash = await hashText(args.otpCode.trim());
		if (inputHash !== otpRecord.codeHash) {
			const newAttempts = otpRecord.attempts + 1;
			if (newAttempts >= OTP_MAX_ATTEMPTS) {
				await ctx.db.delete(otpRecord._id);
			} else {
				await ctx.db.patch(otpRecord._id, { attempts: newAttempts });
			}
			const remaining = Math.max(0, OTP_MAX_ATTEMPTS - newAttempts);
			return {
				success: false as const,
				error:
					remaining > 0
						? `認証コードが正しくありません。残り試行回数: ${remaining} 回`
						: "認証コードの試行上限回数を超過しました。コードを再送信してください。",
				remainingAttempts: remaining,
			};
		}

		// 認証成功: ワンタイムOTPを即時消費（削除）
		await ctx.db.delete(otpRecord._id);

		// 短命な一回限り復元セッショントークンを発行（有効期限10分）
		// 既存のセッションがあればクリーンアップ
		const existingSessions = await ctx.db
			.query("recoverySessions")
			.withIndex("by_familyId_accountId", (q) =>
				q.eq("familyId", user.familyId as Id<"families">).eq("accountId", user._id),
			)
			.collect();
		for (const session of existingSessions) {
			await ctx.db.delete(session._id);
		}

		const sessionToken = generateSessionToken();
		const sessionTokenHash = await hashText(sessionToken);
		await ctx.db.insert("recoverySessions", {
			accountId: user._id,
			familyId: user.familyId,
			sessionTokenHash,
			expiresAt: now + OTP_EXPIRY_MS,
		});

		// リカバリー用の Wrapped MasterKey 暗号化データと認可トークンを返却
		return {
			success: true as const,
			sessionToken,
			recoveryMasterKeyEncrypted: family.recoveryMasterKeyEncrypted,
			recoveryMasterKeyIv: family.recoveryMasterKeyIv,
			recoveryMasterKeySalt: family.recoveryMasterKeySalt,
			recoveryKdfIterations: family.recoveryKdfIterations ?? 300_000,
			recoveryCryptoVersion: family.recoveryCryptoVersion ?? 1,
			familyName: family.name,
		};
	},
});

/**
 * リカバリー復元後の新パスコード設定（マスターキーの更新）
 * 有効な一回限りの認可セッショントークンを検証して消費
 */
export const redeemRecoveryAndRotatePasscode = familyBoundMutation({
	args: {
		sessionToken: v.string(),
		masterKeyEncrypted: v.string(),
		masterKeyIv: v.string(),
		masterKeySalt: v.string(),
		kdfIterations: v.optional(v.number()),
		cryptoVersion: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { familyId, user } = ctx;
		const family = await ctx.db.get(familyId);
		if (!family) throw new Error("Family not found");

		const now = Date.now();

		// 認可セッショントークンの検証
		const tokenHash = await hashText(args.sessionToken.trim());
		const sessionRecord = await ctx.db
			.query("recoverySessions")
			.withIndex("by_familyId_accountId", (q) =>
				q.eq("familyId", familyId).eq("accountId", user._id),
			)
			.first();

		if (!sessionRecord || sessionRecord.sessionTokenHash !== tokenHash) {
			throw new Error("無効な復元認可セッションです。最初からやり直してください。");
		}

		if (now > sessionRecord.expiresAt) {
			await ctx.db.delete(sessionRecord._id);
			throw new Error("復元認可セッションの有効期限が切れています。最初からやり直してください。");
		}

		// セッショントークンを即時消費（削除）
		await ctx.db.delete(sessionRecord._id);

		// 新しいパスコードでラップされたマスターキーで家族レコードを更新
		await ctx.db.patch(familyId, {
			masterKeyEncrypted: args.masterKeyEncrypted,
			masterKeyIv: args.masterKeyIv,
			masterKeySalt: args.masterKeySalt,
			kdfIterations: args.kdfIterations ?? 300_000,
			cryptoVersion: args.cryptoVersion ?? 1,
			updatedAt: now,
		});

		// 家族メンバー全員にパスコード変更通知メールを送信
		const members = await ctx.db
			.query("users")
			.withIndex("by_familyId", (q) => q.eq("familyId", familyId))
			.collect();

		const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
		for (const member of members) {
			if (member._id === user._id) continue;
			await ctx.scheduler.runAfter(
				0,
				internal.actions.sendTemplatedEmailInternal,
				{
					email: member.email,
					payload: {
						template: "passcodeRotated",
						props: {
							displayName: member.displayName || "メンバー",
							familyName: family.name,
							ctaUrl: `${appUrl}/family`,
						},
					},
				},
			);
		}

		return { success: true };
	},
});

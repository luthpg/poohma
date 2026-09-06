import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, mutation } from "./_generated/server";

export const CONTACT_CATEGORIES = [
	"一般的なお問い合わせ",
	"機能の要望・提案",
	"不具合・障害の報告",
	"セキュリティに関するご報告",
	"その他",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

const rateLimiter = new RateLimiter(components.rateLimiter, {
	// 防衛層 1-A: グローバルなお問い合わせバースト制限（DoS対策: 1分間に最大5件、キャパシティ10件）
	contactGlobal: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 10 },
	// 防衛層 1-B: メールアドレスごとの持続的大量送信制限（1時間に最大5件）
	contactEmail: { kind: "token bucket", rate: 5, period: HOUR, capacity: 5 },
});

export const createContact = mutation({
	args: {
		name: v.string(),
		email: v.string(),
		category: v.string(),
		message: v.string(),
		hpConfirm: v.optional(v.string()), // Honeypot スパム防御フィールド
	},
	handler: async (ctx, args) => {
		// ボット対策: 非表示のダミーフィールド（Honeypot）に値が入っていれば処理を中断
		if (args.hpConfirm && args.hpConfirm.trim().length > 0) {
			console.warn("Spam submission detected by honeypot field");
			return null;
		}

		// 基本バリデーション
		const trimmedName = args.name.trim();
		const trimmedEmail = args.email.trim().toLowerCase();
		const trimmedCategory = args.category.trim();
		const trimmedMessage = args.message.trim();

		if (!trimmedName || trimmedName.length > 100) {
			throw new ConvexError("お名前は1文字以上100文字以内で入力してください");
		}
		if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
			throw new ConvexError("有効なメールアドレスを入力してください");
		}
		if (
			!trimmedCategory ||
			!CONTACT_CATEGORIES.includes(trimmedCategory as ContactCategory)
		) {
			throw new ConvexError("有効なお問い合わせ種別を選択してください");
		}
		if (!trimmedMessage || trimmedMessage.length < 5 || trimmedMessage.length > 3000) {
			throw new ConvexError("メッセージは5文字以上3000文字以内で入力してください");
		}

		// 多層防御層 1: RateLimiter コンポーネント（トークンバケット）
		// グローバルバースト保護
		const globalStatus = await rateLimiter.limit(ctx, "contactGlobal");
		if (!globalStatus.ok) {
			throw new ConvexError(
				"現在アクセスが集中しています。恐れ入りますが、しばらく時間をおいて再度お試しください。",
			);
		}

		// 送信元メールごとの持続的レート制限
		const emailStatus = await rateLimiter.limit(ctx, "contactEmail", {
			key: trimmedEmail,
		});
		if (!emailStatus.ok) {
			throw new ConvexError(
				"短時間に複数回送信されています。恐れ入りますが、しばらく時間をおいて再度お試しください。",
			);
		}

		// 多層防御層 2: DB永続化データを用いた直近10分間の短時間連投防止（直近10分間で3件まで）
		const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
		const recentContacts = await ctx.db
			.query("contacts")
			.withIndex("by_email_createdAt", (q) =>
				q.eq("email", trimmedEmail).gte("createdAt", tenMinutesAgo),
			)
			.take(4);

		if (recentContacts.length >= 3) {
			throw new ConvexError(
				"短時間に複数回送信されています。恐れ入りますが、しばらく時間をおいて再度お試しください。",
			);
		}

		const identity = await ctx.auth.getUserIdentity();
		const userId = identity?.subject;

		const now = Date.now();
		const contactId = await ctx.db.insert("contacts", {
			name: trimmedName,
			email: trimmedEmail,
			category: trimmedCategory,
			message: trimmedMessage,
			userId,
			createdAt: now,
			status: "UNREAD",
		});

		// 管理者向けメール通知をバックグラウンド実行
		await ctx.scheduler.runAfter(0, internal.contacts.sendNotificationEmail, {
			name: trimmedName,
			email: trimmedEmail,
			category: trimmedCategory,
			message: trimmedMessage,
			createdAt: now,
			userId,
		});

		return contactId;
	},
});

export const sendNotificationEmail = internalAction({
	args: {
		name: v.string(),
		email: v.string(),
		category: v.string(),
		message: v.string(),
		createdAt: v.number(),
		userId: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<boolean> => {
		const adminEmail = process.env.ADMIN_EMAIL || process.env.RESEND_MAIL_FROM;
		if (!adminEmail) {
			console.warn(
				"ADMIN_EMAIL or RESEND_MAIL_FROM is not configured. Contact notification email skipped.",
			);
			return false;
		}

		return await ctx.runAction(internal.actions.sendTemplatedEmailInternal, {
			email: adminEmail,
			payload: {
				template: "contactNotification",
				props: {
					name: args.name,
					email: args.email,
					category: args.category,
					message: args.message,
					createdAt: args.createdAt,
					userId: args.userId,
				},
			},
			replyTo: args.email,
		});
	},
});

import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

function setupTest() {
	const t = convexTest(schema, modules);
	registerRateLimiter(t);
	return t;
}

describe("Convex Contacts (お問い合わせ機能)", () => {
	it("正常なお問い合わせが登録され、初期ステータスが UNREAD になること", async () => {
		const t = setupTest();

		const contactId = (await t.mutation(api.contacts.createContact, {
			name: "山田 太郎",
			email: "yamada@example.com",
			category: "一般的なお問い合わせ",
			message: "サービスの利用方法について質問があります。",
		})) as Id<"contacts"> | null;

		expect(contactId).toBeDefined();
		if (!contactId) throw new Error("contactId is null");

		await t.run(async (ctx) => {
			const contact = await ctx.db.get(contactId);
			expect(contact).not.toBeNull();
			expect(contact?.name).toBe("山田 太郎");
			expect(contact?.email).toBe("yamada@example.com");
			expect(contact?.category).toBe("一般的なお問い合わせ");
			expect(contact?.message).toBe(
				"サービスの利用方法について質問があります。",
			);
			expect(contact?.status).toBe("UNREAD");
			expect(contact?.createdAt).toBeGreaterThan(0);
			expect(contact?.userId).toBeUndefined();
		});
	});

	it("ログイン中の場合は認証情報から自動で userId が紐づいて登録されること", async () => {
		const t = setupTest();
		const authedT = t.withIdentity({ subject: "firebase_user_123" });

		const contactId = (await authedT.mutation(api.contacts.createContact, {
			name: "佐藤 花子",
			email: "sato@example.com",
			category: "機能の要望・提案",
			message: "ダークモードの切り替えをより簡単にしたいです。",
		})) as Id<"contacts"> | null;

		expect(contactId).toBeDefined();
		if (!contactId) throw new Error("contactId is null");

		await t.run(async (ctx) => {
			const contact = await ctx.db.get(contactId);
			expect(contact).not.toBeNull();
			expect(contact?.userId).toBe("firebase_user_123");
			expect(contact?.status).toBe("UNREAD");
		});
	});

	it("クライアントから任意の userId を引数として指定しようとしてもバリデータで拒否されること", async () => {
		const t = setupTest();

		await expect(
			t.mutation(api.contacts.createContact, {
				name: "攻撃者",
				email: "attacker@example.com",
				category: "一般的なお問い合わせ",
				message: "他人のUIDを偽装しようとする試みです。",
				userId: "victim_user_999",
			} as unknown as {
				name: string;
				email: string;
				category: string;
				message: string;
			}),
		).rejects.toThrow();
	});

	it("Honeypot フィールド（hpConfirm）が入力されている場合はスパムとして登録されないこと", async () => {
		const t = setupTest();

		const result = await t.mutation(api.contacts.createContact, {
			name: "Spam Bot",
			email: "bot@example.com",
			category: "その他",
			message: "Buy cheap products now http://spam.com",
			hpConfirm: "I am a bot",
		});

		expect(result).toBeNull();

		await t.run(async (ctx) => {
			const contacts = await ctx.db.query("contacts").collect();
			expect(contacts.length).toBe(0);
		});
	});

	it("無効なメールアドレスで送信した場合にエラーになること", async () => {
		const t = setupTest();

		await expect(
			t.mutation(api.contacts.createContact, {
				name: "田中",
				email: "invalid-email",
				category: "不具合・障害の報告",
				message: "画面が真っ白になります。",
			}),
		).rejects.toThrow("有効なメールアドレスを入力してください");
	});

	it("空の名前で送信した場合にエラーになること", async () => {
		const t = setupTest();

		await expect(
			t.mutation(api.contacts.createContact, {
				name: "   ",
				email: "tanaka@example.com",
				category: "不具合・障害の報告",
				message: "画面が真っ白になります。",
			}),
		).rejects.toThrow("お名前は1文字以上100文字以内で入力してください");
	});

	it("5文字未満の短いメッセージで送信した場合にエラーになること", async () => {
		const t = setupTest();

		await expect(
			t.mutation(api.contacts.createContact, {
				name: "田中",
				email: "tanaka@example.com",
				category: "不具合・障害の報告",
				message: "あ",
			}),
		).rejects.toThrow("メッセージは5文字以上3000文字以内で入力してください");
	});

	it("同一メールアドレスから短時間（10分間）に4回送信を試みた場合、レート制限でエラーになること", async () => {
		const t = setupTest();
		const testEmail = "ratelimit@example.com";

		// 1回目、2回目、3回目の送信は成功
		for (let i = 1; i <= 3; i++) {
			const res = await t.mutation(api.contacts.createContact, {
				name: "連続 投稿者",
				email: testEmail,
				category: "一般的なお問い合わせ",
				message: `これは${i}回目の問い合わせメッセージです。`,
			});
			expect(res).toBeDefined();
		}

		// 4回目の送信はレート制限で失敗
		await expect(
			t.mutation(api.contacts.createContact, {
				name: "連続 投稿者",
				email: testEmail,
				category: "一般的なお問い合わせ",
				message: "これは4回目の問い合わせメッセージです。",
			}),
		).rejects.toThrow("短時間に複数回送信されています");
	});

	it("大文字小文字を変えた同一メールアドレスでもレート制限が正しく適用されること", async () => {
		const t = setupTest();

		// 3回送信（小文字・大文字・混在を交互に使用）
		const emailVariants = [
			"CaseTest@Example.COM",
			"casetest@example.com",
			"CASETEST@EXAMPLE.COM",
		];
		for (let i = 0; i < 3; i++) {
			const res = await t.mutation(api.contacts.createContact, {
				name: "ケーステスト",
				email: emailVariants[i],
				category: "一般的なお問い合わせ",
				message: `ケーステスト${i + 1}回目のメッセージです。`,
			});
			expect(res).toBeDefined();
		}

		// 4回目は大文字で送信してもレート制限で拒否されること
		await expect(
			t.mutation(api.contacts.createContact, {
				name: "ケーステスト",
				email: "CASETEST@EXAMPLE.COM",
				category: "一般的なお問い合わせ",
				message: "ケーステスト4回目のメッセージです。",
			}),
		).rejects.toThrow("短時間に複数回送信されています");
	});

	it("許可されていないお問い合わせ種別（category）の場合はエラーになること", async () => {
		const t = setupTest();

		await expect(
			t.mutation(api.contacts.createContact, {
				name: "山田 太郎",
				email: "yamada@example.com",
				category: "不正なカテゴリー",
				message: "お問い合わせメッセージです。",
			}),
		).rejects.toThrow("有効なお問い合わせ種別を選択してください");
	});

	it("お名前とメッセージの文字数境界値が正しく検証されること", async () => {
		const t = setupTest();

		// 100文字のお名前: 成功
		const valid100NameRes = await t.mutation(api.contacts.createContact, {
			name: "あ".repeat(100),
			email: "boundary-name@example.com",
			category: "一般的なお問い合わせ",
			message: "ちょうど100文字の名前テストです。",
		});
		expect(valid100NameRes).toBeDefined();

		// 101文字のお名前: エラー
		await expect(
			t.mutation(api.contacts.createContact, {
				name: "あ".repeat(101),
				email: "boundary-name-err@example.com",
				category: "一般的なお問い合わせ",
				message: "101文字の名前テストです。",
			}),
		).rejects.toThrow("お名前は1文字以上100文字以内で入力してください");

		// 5文字のメッセージ: 成功
		const valid5MsgRes = await t.mutation(api.contacts.createContact, {
			name: "テストユーザー",
			email: "boundary-msg5@example.com",
			category: "一般的なお問い合わせ",
			message: "12345",
		});
		expect(valid5MsgRes).toBeDefined();

		// 3000文字のメッセージ: 成功
		const valid3000MsgRes = await t.mutation(api.contacts.createContact, {
			name: "テストユーザー",
			email: "boundary-msg3000@example.com",
			category: "一般的なお問い合わせ",
			message: "あ".repeat(3000),
		});
		expect(valid3000MsgRes).toBeDefined();

		// 3001文字のメッセージ: エラー
		await expect(
			t.mutation(api.contacts.createContact, {
				name: "テストユーザー",
				email: "boundary-msg3001@example.com",
				category: "一般的なお問い合わせ",
				message: "あ".repeat(3001),
			}),
		).rejects.toThrow("メッセージは5文字以上3000文字以内で入力してください");
	});
});

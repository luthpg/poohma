import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { resolveEmail } from "../src/emails/dispatch";
import { type EmailPayload, emailTemplates } from "../src/emails/registry";

function samplePayloadFor(key: string): EmailPayload {
	switch (key) {
		case "familyWelcome":
			return {
				template: "familyWelcome",
				props: {
					displayName: "山田 太郎",
					familyName: "山田家",
					ctaUrl: "https://poohma.ciderlabs.link/",
				},
			};
		case "newMemberJoined":
			return {
				template: "newMemberJoined",
				props: {
					displayName: "山田 花子",
					familyName: "山田家",
					newMemberDisplayName: "山田 次郎",
					newMemberEmail: "jiro@example.com",
					ctaUrl: "https://poohma.ciderlabs.link/family",
				},
			};
		case "joinRequestReceived":
			return {
				template: "joinRequestReceived",
				props: {
					displayName: "山田 太郎",
					familyName: "山田家",
					applicantDisplayName: "鈴木 一郎",
					applicantEmail: "suzuki@example.com",
					ctaUrl: "https://poohma.ciderlabs.link/family",
				},
			};
		case "joinApproved":
			return {
				template: "joinApproved",
				props: {
					displayName: "鈴木 一郎",
					familyName: "山田家",
					variant: "join",
					ctaUrl: "https://poohma.ciderlabs.link/family",
				},
			};
		case "joinRequestRejected":
			return {
				template: "joinRequestRejected",
				props: {
					displayName: "鈴木 一郎",
					familyName: "山田家",
				},
			};
		case "memberKicked":
			return {
				template: "memberKicked",
				props: {
					displayName: "鈴木 一郎",
					familyName: "山田家",
					ctaUrl: "https://poohma.ciderlabs.link/family",
					expiresInDays: 30,
				},
			};
		case "familyMigrationCompleted":
			return {
				template: "familyMigrationCompleted",
				props: {
					displayName: "山田 太郎",
					familyName: "佐藤家",
					ctaUrl: "https://poohma.ciderlabs.link/",
				},
			};
		case "passcodeRotated":
			return {
				template: "passcodeRotated",
				props: {
					displayName: "山田 太郎",
					familyName: "山田家",
					ctaUrl: "https://poohma.ciderlabs.link/family",
				},
			};
		case "shareSettingChanged":
			return {
				template: "shareSettingChanged",
				props: {
					displayName: "山田 太郎",
					familyName: "山田家",
					changedByDisplayName: "山田 太郎",
					changedAt: Date.now(),
					changeSummary: "「Amazon」が家族共有に設定されました",
					ctaUrl: "https://poohma.ciderlabs.link/records",
				},
			};
		case "recordAdminChanged":
			return {
				template: "recordAdminChanged",
				props: {
					displayName: "山田 太郎",
					familyName: "山田家",
					accountName: "Netflix",
					event: "added",
					changedAccountDisplayName: "山田 花子",
					changedByDisplayName: "山田 太郎",
					changedAt: Date.now(),
					ctaUrl: "https://poohma.ciderlabs.link/records",
				},
			};
		case "accountDeleted":
			return {
				template: "accountDeleted",
				props: {
					displayName: "山田 太郎",
					deletedAt: Date.now(),
					ctaUrl: "https://poohma.ciderlabs.link/",
				},
			};
		case "newDeviceLogin":
			return {
				template: "newDeviceLogin",
				props: {
					displayName: "山田 太郎",
					loginAt: Date.now(),
					deviceName: "Windows PC",
					browser: "Chrome",
					os: "Windows",
					ipAddress: "203.0.113.1",
					location: "東京都, 日本",
					ctaUrl: "https://poohma.ciderlabs.link/dashboard",
				},
			};
		case "csvExported":
			return {
				template: "csvExported",
				props: {
					displayName: "山田 太郎",
					exportedAt: Date.now(),
					recordCount: 10,
					deviceName: "MacBook Air",
					browser: "Safari",
					os: "macOS",
					ipAddress: "203.0.113.1",
					location: "東京都, 日本",
					ctaUrl: "https://poohma.ciderlabs.link/settings",
				},
			};
		case "biometricRegistered":
			return {
				template: "biometricRegistered",
				props: {
					displayName: "山田 太郎",
					registeredAt: Date.now(),
					deviceName: "iPhone 15 Pro",
					browser: "Mobile Safari",
					os: "iOS",
					ipAddress: "203.0.113.1",
					location: "東京都, 日本",
					ctaUrl: "https://poohma.ciderlabs.link/settings",
				},
			};
		case "biometricRemoved":
			return {
				template: "biometricRemoved",
				props: {
					displayName: "山田 太郎",
					removedAt: Date.now(),
					deviceName: "iPhone 15 Pro",
					browser: "Mobile Safari",
					os: "iOS",
					ipAddress: "203.0.113.1",
					location: "東京都, 日本",
					ctaUrl: "https://poohma.ciderlabs.link/settings",
				},
			};
		case "recoveryOtp":
			return {
				template: "recoveryOtp",
				props: {
					displayName: "山田 太郎",
					otpCode: "123456",
					expiresInMinutes: 10,
					familyName: "山田家",
				},
			};
		case "recoveryKitIssued":
			return {
				template: "recoveryKitIssued",
				props: {
					displayName: "山田 太郎",
					familyName: "山田家",
					issuerName: "山田 太郎",
					isReissue: false,
					issuedAt: Date.now(),
					ctaUrl: "https://poohma.ciderlabs.link/family",
				},
			};
		default:
			throw new Error(`Unknown template key: ${key}`);
	}
}

describe("メールテンプレート基盤", () => {
	it.each(emailTemplates)(
		"$key テンプレートがHTMLおよびプレーンテキストとして正常にレンダリングできる",
		async (template) => {
			const payload = samplePayloadFor(template.key);
			const { subject, element } = resolveEmail(payload);

			expect(subject).toBeDefined();
			expect(subject.length).toBeGreaterThan(0);

			const [html, text] = await Promise.all([
				render(element),
				render(element, { plainText: true }),
			]);

			expect(html).toContain("PoohMa");
			expect(html).toContain("山田");
			expect(text).toContain("PoohMa");
			expect(text).toContain("山田");
		},
	);

	it("JoinApprovedEmailのmigration variantで適切な件名と文面がレンダリングされる", async () => {
		const payload: EmailPayload = {
			template: "joinApproved",
			props: {
				displayName: "山田 太郎",
				familyName: "佐藤家",
				variant: "migration",
				ctaUrl: "https://poohma.ciderlabs.link/family",
			},
		};

		const { subject, element } = resolveEmail(payload);
		expect(subject).toBe(
			"[PoohMa] 家族「佐藤家」への移行申請が承認されました！",
		);

		const html = await render(element);
		expect(html).toContain("移行申請が承認されました");
		expect(html).toContain("パスコード");
	});
});

import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	name: v.string(),
	email: v.string(),
	category: v.string(),
	message: v.string(),
	createdAt: v.number(),
	userId: v.optional(v.string()),
});

type Props = Infer<typeof props>;

const text = {
	margin: "0 0 16px",
};

const infoBox = {
	backgroundColor: "#f8fafc",
	border: "1px solid #e2e8f0",
	borderRadius: "8px",
	padding: "16px",
	margin: "16px 0",
};

const infoItem = {
	margin: "6px 0",
	fontSize: "14px",
};

const messageBox = {
	backgroundColor: "#ffffff",
	border: "1px solid #cbd5e1",
	borderRadius: "6px",
	padding: "12px",
	marginTop: "8px",
	whiteSpace: "pre-wrap" as const,
	fontFamily: "monospace",
	fontSize: "13px",
	lineHeight: "1.6",
	color: "#334155",
};

export function ContactNotificationEmail({
	name,
	email,
	category,
	message,
	createdAt,
	userId,
}: Props) {
	const formattedDate = new Date(createdAt).toLocaleString("ja-JP", {
		timeZone: "Asia/Tokyo",
	});

	return (
		<Layout preview={`【お問い合わせ】${category} - ${name}様`}>
			<Text style={text}>管理者様</Text>
			<Text style={text}>
				PoohMa のWebサイトより新しいお問い合わせが届きました。
			</Text>

			<Section style={infoBox}>
				<Text style={infoItem}>
					<strong>【お名前】:</strong> {name}
				</Text>
				<Text style={infoItem}>
					<strong>【メールアドレス】:</strong> {email}
				</Text>
				<Text style={infoItem}>
					<strong>【お問い合わせ種別】:</strong> {category}
				</Text>
				<Text style={infoItem}>
					<strong>【送信日時】:</strong> {formattedDate}
				</Text>
				{userId && (
					<Text style={infoItem}>
						<strong>【ユーザーID】:</strong> {userId}
					</Text>
				)}
				<Text style={infoItem}>
					<strong>【メッセージ本文】:</strong>
				</Text>
				<div style={messageBox}>{message}</div>
			</Section>
		</Layout>
	);
}

export const contactNotificationEmail = defineEmailTemplate({
	key: "contactNotification",
	props,
	subject: ({ category, name }) => `【お問い合わせ】${category} - ${name}様`,
	Component: ContactNotificationEmail,
});

ContactNotificationEmail.PreviewProps = {
	name: "山田 太郎",
	email: "yamada@example.com",
	category: "機能要望",
	message: "パスワードヒントの共有方法について詳しく教えてください。",
	createdAt: Date.now(),
	userId: "user_test123",
};

export default ContactNotificationEmail;

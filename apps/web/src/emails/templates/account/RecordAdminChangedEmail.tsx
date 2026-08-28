import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	familyName: v.string(),
	accountName: v.string(), // レコードの title
	event: v.union(v.literal("added"), v.literal("removed")),
	changedAccountDisplayName: v.string(),
	changedByDisplayName: v.string(),
	changedAt: v.number(),
	ctaUrl: v.optional(v.string()),
});

type Props = Infer<typeof props>;

const text = {
	margin: "0 0 16px",
};

const infoBox = {
	backgroundColor: "#f1f5f9",
	borderRadius: "8px",
	padding: "16px",
	margin: "16px 0",
};

const infoItem = {
	margin: "4px 0",
	fontSize: "14px",
};

const buttonWrapper = {
	margin: "24px 0",
	textAlign: "center" as const,
};

export function RecordAdminChangedEmail({
	displayName,
	familyName,
	accountName,
	event,
	changedAccountDisplayName,
	changedByDisplayName,
	changedAt,
	ctaUrl = "https://poohma.ciderlabs.link/records",
}: Props) {
	const formattedDate = new Date(changedAt).toLocaleString("ja-JP", {
		timeZone: "Asia/Tokyo",
	});
	const actionText =
		event === "added"
			? "管理者として追加されました"
			: "管理者から解除されました";

	return (
		<Layout preview={`[PoohMa] 「${accountName}」の管理者が変更されました`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				こんにちは！家族間アカウント管理アプリ「PoohMa」からセキュリティに関するお知らせです。
			</Text>
			<Text style={text}>
				家族「<strong>{familyName}</strong>」において、共有アカウント情報「
				<strong>{accountName}</strong>」の管理者が変更されました。
			</Text>
			<Section style={infoBox}>
				<Text style={infoItem}>
					<strong>対象アカウント情報:</strong> {accountName}
				</Text>
				<Text style={infoItem}>
					<strong>変更内容:</strong> {changedAccountDisplayName} さんが
					{actionText}
				</Text>
				<Text style={infoItem}>
					<strong>変更者:</strong> {changedByDisplayName}
				</Text>
				<Text style={infoItem}>
					<strong>日時:</strong> {formattedDate}
				</Text>
			</Section>
			<Text style={text}>
				心当たりがない場合は、速やかに家族メンバーまたは管理者にご確認ください。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>アカウント情報を確認する</Button>
			</Section>
		</Layout>
	);
}

export const recordAdminChangedEmail = defineEmailTemplate({
	key: "recordAdminChanged",
	props,
	subject: (p) => `[PoohMa] 「${p.accountName}」の管理者が変更されました`,
	Component: RecordAdminChangedEmail,
});

RecordAdminChangedEmail.PreviewProps = {
	displayName: "山田 太郎",
	familyName: "山田家",
	accountName: "Netflix",
	event: "added",
	changedAccountDisplayName: "山田 花子",
	changedByDisplayName: "山田 太郎",
	changedAt: Date.now(),
	ctaUrl: "https://poohma.ciderlabs.link/records",
};

export default RecordAdminChangedEmail;

import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	familyName: v.string(),
	ctaUrl: v.string(),
	expiresInDays: v.optional(v.number()),
});

type Props = Infer<typeof props>;

const text = {
	margin: "0 0 16px",
};

const note = {
	margin: "0 0 16px",
	color: "#6b7280",
	fontSize: "14px",
};

const buttonWrapper = {
	margin: "24px 0",
	textAlign: "center" as const,
};

export function MemberKickedEmail({
	displayName,
	familyName,
	ctaUrl,
	expiresInDays = 30,
}: Props) {
	return (
		<Layout preview={`家族グループ「${familyName}」から削除されました`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				家族間アカウント管理アプリ「PoohMa」からお知らせです。
			</Text>
			<Text style={text}>
				あなたは家族グループ「<strong>{familyName}</strong>
				」から削除されました。
			</Text>
			<Text style={text}>
				あなたが「自分のみ」として登録していたデータは、
				{expiresInDays}
				日以内であれば旧家族のパスコードを使って持ち出すことができます。アプリにログインし、案内に従って新しい家族の作成または参加を行ってください。
			</Text>
			<Text style={note}>
				※なお、家族と共有していたデータは家族グループ側に残るため、持ち出すことはできません。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>PoohMaを開く</Button>
			</Section>
		</Layout>
	);
}

export const memberKickedEmail = defineEmailTemplate({
	key: "memberKicked",
	props,
	subject: ({ familyName }) =>
		`[PoohMa] 家族グループ「${familyName}」から削除されました`,
	Component: MemberKickedEmail,
});

MemberKickedEmail.PreviewProps = {
	displayName: "たろう",
	familyName: "鈴木家",
	ctaUrl: "https://poohma.ciderlabs.link/family",
	expiresInDays: 30,
};

export default MemberKickedEmail;

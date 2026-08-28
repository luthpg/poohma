import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	familyName: v.string(),
	ctaUrl: v.string(),
});

type Props = Infer<typeof props>;

const text = {
	margin: "0 0 16px",
};

const buttonWrapper = {
	margin: "24px 0",
	textAlign: "center" as const,
};

export function FamilyMigrationCompletedEmail({
	displayName,
	familyName,
	ctaUrl,
}: Props) {
	return (
		<Layout preview={`家族「${familyName}」への変更が完了しました`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				こんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。
			</Text>
			<Text style={text}>
				家族「<strong>{familyName}</strong>」への変更が完了しました。
			</Text>
			<Text style={text}>
				新しい家族でのアカウント管理をご利用いただけます。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>PoohMaを開く</Button>
			</Section>
		</Layout>
	);
}

export const familyMigrationCompletedEmail = defineEmailTemplate({
	key: "familyMigrationCompleted",
	props,
	subject: () => "PoohMaからのお知らせ（家族変更完了）",
	Component: FamilyMigrationCompletedEmail,
});

FamilyMigrationCompletedEmail.PreviewProps = {
	displayName: "たろう",
	familyName: "鈴木家",
	ctaUrl: "https://poohma.ciderlabs.link/",
};

export default FamilyMigrationCompletedEmail;

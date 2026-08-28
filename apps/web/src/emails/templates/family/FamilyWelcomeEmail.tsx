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

export function FamilyWelcomeEmail({ displayName, familyName, ctaUrl }: Props) {
	return (
		<Layout preview={`家族「${familyName}」への参加が完了しました`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				こんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。
			</Text>
			<Text style={text}>
				家族「<strong>{familyName}</strong>」への参加が完了しました。
			</Text>
			<Text style={text}>
				大切なお知らせや家族間のパスワード管理を安心・安全にご利用いただけます。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>PoohMaを開く</Button>
			</Section>
		</Layout>
	);
}

export const familyWelcomeEmail = defineEmailTemplate({
	key: "familyWelcome",
	props,
	subject: () => "PoohMaへようこそ",
	Component: FamilyWelcomeEmail,
});

FamilyWelcomeEmail.PreviewProps = {
	displayName: "たろう",
	familyName: "鈴木家",
	ctaUrl: "https://poohma.ciderlabs.link/",
};

export default FamilyWelcomeEmail;

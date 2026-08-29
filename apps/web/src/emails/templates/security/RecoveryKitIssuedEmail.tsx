import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	familyName: v.string(),
	issuerName: v.string(),
	issuedAt: numberOrTimestampValidator(),
	isReissue: v.boolean(),
	ctaUrl: v.optional(v.string()),
});

function numberOrTimestampValidator() {
	return v.number();
}

type Props = Infer<typeof props>;

const text = {
	margin: "0 0 16px",
};

const infoBox = {
	backgroundColor: "#f8fafc",
	borderRadius: "8px",
	border: "1px solid #e2e8f0",
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

export function RecoveryKitIssuedEmail({
	displayName,
	familyName,
	issuerName,
	issuedAt,
	isReissue,
	ctaUrl = "https://poohma.ciderlabs.link/family",
}: Props) {
	const formattedDate = new Date(issuedAt).toLocaleString("ja-JP", {
		timeZone: "Asia/Tokyo",
	});

	const actionLabel = isReissue ? "再発行" : "新規発行";

	return (
		<Layout
			preview={`[PoohMa] 家族「${familyName}」のリカバリーキットが${actionLabel}されました`}
		>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				家族「{familyName}」のリカバリーキット（復元コードPDF）が{actionLabel}
				されました。
			</Text>
			<Section style={infoBox}>
				<Text style={infoItem}>
					<strong>対象家族:</strong> {familyName}
				</Text>
				<Text style={infoItem}>
					<strong>発行者:</strong> {issuerName}
				</Text>
				<Text style={infoItem}>
					<strong>発行日時:</strong> {formattedDate}
				</Text>
			</Section>
			{isReissue && (
				<Text style={{ ...text, color: "#b91c1c" }}>
					※
					リカバリーキットの再発行に伴い、以前に発行された古いリカバリーコードはすべて無効化されました。古いPDFファイルは破棄し、新しく発行されたPDFを保管してください。
				</Text>
			)}
			<Text style={text}>
				この操作に心当たりがない場合は、速やかに家族の管理者に確認するか、パスコードの変更を行ってください。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>家族設定を確認する</Button>
			</Section>
		</Layout>
	);
}

export const recoveryKitIssuedEmail = defineEmailTemplate({
	key: "recoveryKitIssued",
	props,
	subject: ({ familyName, isReissue }: Props) =>
		`[PoohMa] 家族「${familyName}」のリカバリーキットが${isReissue ? "再発行" : "発行"}されました`,
	Component: RecoveryKitIssuedEmail,
});

RecoveryKitIssuedEmail.PreviewProps = {
	displayName: "山田 太郎",
	familyName: "山田家",
	issuerName: "管理者太郎",
	issuedAt: Date.now(),
	isReissue: true,
	ctaUrl: "https://poohma.ciderlabs.link/family",
};

export default RecoveryKitIssuedEmail;

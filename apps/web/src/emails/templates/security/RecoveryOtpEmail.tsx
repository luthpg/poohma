import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	otpCode: v.string(),
	expiresInMinutes: v.number(),
	familyName: v.string(),
});

type Props = Infer<typeof props>;

const text = {
	margin: "0 0 16px",
};

const codeBox = {
	backgroundColor: "#f8fafc",
	borderRadius: "8px",
	border: "1px solid #e2e8f0",
	padding: "24px",
	margin: "24px 0",
	textAlign: "center" as const,
};

const codeStyle = {
	fontSize: "32px",
	fontWeight: "bold" as const,
	letterSpacing: "6px",
	color: "#0f172a",
	margin: "0",
};

const warnText = {
	color: "#dc2626",
	fontSize: "13px",
	margin: "12px 0 0",
};

export function RecoveryOtpEmail({
	displayName,
	otpCode,
	expiresInMinutes,
	familyName,
}: Props) {
	return (
		<Layout preview={`[PoohMa] 家族復元用の認証コード: ${otpCode}`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				家族「{familyName}」のマスターキー復元リクエストを受け付けました。
			</Text>
			<Text style={text}>
				復元画面にて以下の6桁の認証コード（OTP）を入力してください。
			</Text>
			<Section style={codeBox}>
				<Text style={codeStyle}>{otpCode}</Text>
				<Text style={warnText}>
					※ 有効期限は {expiresInMinutes}{" "}
					分間です。第三者には絶対に教えないでください。
				</Text>
			</Section>
			<Text style={text}>
				この復元リクエストに心当たりがない場合は、第三者があなたのリカバリーコードを入力した可能性があります。アカウントの安全のためパスワードの変更等をご検討ください。
			</Text>
		</Layout>
	);
}

export const recoveryOtpEmail = defineEmailTemplate({
	key: "recoveryOtp",
	props,
	subject: ({ otpCode }: Props) =>
		`[PoohMa] マスターキー復元の認証コード: ${otpCode}`,
	Component: RecoveryOtpEmail,
});

RecoveryOtpEmail.PreviewProps = {
	displayName: "山田 太郎",
	otpCode: "123456",
	expiresInMinutes: 10,
	familyName: "山田家",
};

export default RecoveryOtpEmail;

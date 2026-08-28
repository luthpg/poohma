import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	loginAt: v.number(),
	deviceName: v.optional(v.string()),
	browser: v.optional(v.string()),
	os: v.optional(v.string()),
	ipAddress: v.optional(v.string()),
	location: v.optional(v.string()),
	ctaUrl: v.optional(v.string()),
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
	margin: "4px 0",
	fontSize: "14px",
};

const buttonWrapper = {
	margin: "24px 0",
	textAlign: "center" as const,
};

export function NewDeviceLoginEmail({
	displayName,
	loginAt,
	deviceName,
	browser,
	os,
	ipAddress,
	location,
	ctaUrl = "https://poohma.ciderlabs.link/dashboard",
}: Props) {
	const formattedDate = new Date(loginAt).toLocaleString("ja-JP", {
		timeZone: "Asia/Tokyo",
	});

	return (
		<Layout preview={`[PoohMa] 新しい端末からのログインを検知しました`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				こんにちは！家族間アカウント管理アプリ「PoohMa」からセキュリティに関するお知らせです。
			</Text>
			<Text style={text}>
				お使いの PoohMa
				アカウントへ、普段とは異なる新しい端末またはブラウザからのログインが検知されました。
			</Text>
			<Section style={infoBox}>
				<Text style={infoItem}>
					<strong>ログイン日時:</strong> {formattedDate}
				</Text>
				{deviceName ? (
					<Text style={infoItem}>
						<strong>端末:</strong> {deviceName}
					</Text>
				) : null}
				{browser || os ? (
					<Text style={infoItem}>
						<strong>ブラウザ/OS:</strong>{" "}
						{[browser, os].filter(Boolean).join(" / ")}
					</Text>
				) : null}
				{ipAddress ? (
					<Text style={infoItem}>
						<strong>IPアドレス:</strong> {ipAddress}
					</Text>
				) : null}
				{location ? (
					<Text style={infoItem}>
						<strong>推定位置:</strong> {location}
					</Text>
				) : null}
			</Section>
			<Text style={text}>
				ご自身によるログインの場合は、このメールへのご対応は不要です。
				心当たりがない場合は、第三者に不正アクセスされた可能性があります。速やかにパスワードを変更してください。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>ダッシュボードへ</Button>
			</Section>
		</Layout>
	);
}

export const newDeviceLoginEmail = defineEmailTemplate({
	key: "newDeviceLogin",
	props,
	subject: () => `[PoohMa] 新しい端末からのログインを検知しました`,
	Component: NewDeviceLoginEmail,
});

NewDeviceLoginEmail.PreviewProps = {
	displayName: "山田 太郎",
	loginAt: Date.now(),
	deviceName: "Windows PC",
	browser: "Chrome 125",
	os: "Windows 11",
	ipAddress: "203.0.113.1",
	location: "東京都, 日本",
	ctaUrl: "https://poohma.ciderlabs.link/dashboard",
};

export default NewDeviceLoginEmail;

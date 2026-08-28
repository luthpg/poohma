import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
	displayName: v.string(),
	removedAt: v.number(),
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

export function BiometricRemovedEmail({
	displayName,
	removedAt,
	deviceName,
	browser,
	os,
	ipAddress,
	location,
	ctaUrl = "https://poohma.ciderlabs.link/settings",
}: Props) {
	const formattedDate = new Date(removedAt).toLocaleString("ja-JP", {
		timeZone: "Asia/Tokyo",
	});

	return (
		<Layout preview={`[PoohMa] 生体認証ロック解除が解除されました`}>
			<Text style={text}>{displayName} さん</Text>
			<Text style={text}>
				こんにちは！家族間アカウント管理アプリ「PoohMa」からセキュリティに関するお知らせです。
			</Text>
			<Text style={text}>
				お使いの端末において、パスコード省略のための「生体認証によるロック解除」が無効化（解除）されました。
			</Text>
			<Section style={infoBox}>
				<Text style={infoItem}>
					<strong>解除日時:</strong> {formattedDate}
				</Text>
				{deviceName ? (
					<Text style={infoItem}>
						<strong>端末:</strong> {deviceName}
					</Text>
				) : null}
				{browser || os ? (
					<Text style={infoItem}>
						<strong>環境:</strong> {[browser, os].filter(Boolean).join(" / ")}
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
				この操作に心当たりがない場合は、第三者があなたの端末を操作した可能性があります。速やかに設定画面をご確認ください。
			</Text>
			<Section style={buttonWrapper}>
				<Button href={ctaUrl}>セキュリティ設定へ</Button>
			</Section>
		</Layout>
	);
}

export const biometricRemovedEmail = defineEmailTemplate({
	key: "biometricRemoved",
	props,
	subject: () => `[PoohMa] 生体認証が解除されました`,
	Component: BiometricRemovedEmail,
});

BiometricRemovedEmail.PreviewProps = {
	displayName: "山田 太郎",
	removedAt: Date.now(),
	deviceName: "iPhone 15 Pro",
	browser: "Mobile Safari 17",
	os: "iOS 17.5",
	ipAddress: "203.0.113.1",
	location: "東京都, 日本",
	ctaUrl: "https://poohma.ciderlabs.link/settings",
};

export default BiometricRemovedEmail;

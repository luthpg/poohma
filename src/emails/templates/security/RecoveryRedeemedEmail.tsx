import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
  recoveredAt: v.number(),
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

const alertText = {
  margin: "0 0 16px",
  color: "#b91c1c",
  fontWeight: "bold" as const,
};

const infoBox = {
  backgroundColor: "#fef2f2",
  border: "1px solid #fee2e2",
  borderRadius: "8px",
  padding: "16px",
  margin: "16px 0",
};

const infoItem = {
  margin: "4px 0",
  fontSize: "14px",
  color: "#374151",
};

const buttonWrapper = {
  margin: "24px 0",
  textAlign: "center" as const,
};

export function RecoveryRedeemedEmail({
  displayName,
  familyName,
  recoveredAt,
  deviceName,
  browser,
  os,
  ipAddress,
  location,
  ctaUrl = "https://poohma.ciderlabs.link/family",
}: Props) {
  const formattedDate = new Date(recoveredAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  return (
    <Layout
      preview={`[重要/PoohMa] リカバリーキーによるアカウント復旧が完了しました`}
    >
      <Text style={text}>{displayName} さん</Text>
      <Text style={alertText}>
        【重要】リカバリーキーによる家族アカウントの復旧が実行されました。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>
        」において、リカバリーキーを使用したマスターキーの復旧およびパスコードの再設定が行われました。
      </Text>
      <Section style={infoBox}>
        <Text style={infoItem}>
          <strong>日時:</strong> {formattedDate}
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
        この操作に心当たりがない場合は、第三者によってアカウントが不正に復旧された可能性があります。速やかにアプリへログインし、家族パスコードの再変更およびリカバリーキットの再発行を行ってください。
      </Text>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>家族セキュリティ設定へ</Button>
      </Section>
    </Layout>
  );
}

export const recoveryRedeemedEmail = defineEmailTemplate({
  key: "recoveryRedeemed",
  props,
  subject: () =>
    `[重要/PoohMa] リカバリーキーによるアカウント復旧が完了しました`,
  Component: RecoveryRedeemedEmail,
});

RecoveryRedeemedEmail.PreviewProps = {
  displayName: "山田 太郎",
  familyName: "山田家",
  recoveredAt: Date.now(),
  deviceName: "iPhone 15 Pro",
  browser: "Mobile Safari 17",
  os: "iOS 17.5",
  ipAddress: "203.0.113.1",
  location: "東京都, 日本",
  ctaUrl: "https://poohma.ciderlabs.link/family",
};

export default RecoveryRedeemedEmail;

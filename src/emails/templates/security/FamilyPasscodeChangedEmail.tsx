import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
  changedByDisplayName: v.string(),
  isSelf: v.boolean(),
  changedAt: v.number(),
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

export function FamilyPasscodeChangedEmail({
  displayName,
  familyName,
  changedByDisplayName,
  isSelf,
  changedAt,
  deviceName,
  browser,
  os,
  ipAddress,
  location,
  ctaUrl = "https://poohma.ciderlabs.link/dashboard",
}: Props) {
  const formattedDate = new Date(changedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  return (
    <Layout
      preview={`[PoohMa] 家族「${familyName}」のパスコードが変更されました`}
    >
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは！家族間アカウント管理アプリ「PoohMa」からセキュリティに関するお知らせです。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>」の家族パスコードが
        {isSelf ? "あなたによって" : `${changedByDisplayName} さんによって`}
        変更されました。
      </Text>
      <Section style={infoBox}>
        <Text style={infoItem}>
          <strong>変更者:</strong> {changedByDisplayName}{" "}
          {isSelf ? "（あなた）" : ""}
        </Text>
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
        {isSelf
          ? "新しいパスコードを忘れないよう、大切に保管してください。"
          : "次回アカウント情報のヒントを閲覧する際は、変更後の新しいパスコードを入力してください。心当たりがない場合は、速やかに家族メンバーにご確認ください。"}
      </Text>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>ダッシュボードへ</Button>
      </Section>
    </Layout>
  );
}

export const familyPasscodeChangedEmail = defineEmailTemplate({
  key: "familyPasscodeChanged",
  props,
  subject: (p) => `[PoohMa] ${p.familyName} のパスコードが変更されました`,
  Component: FamilyPasscodeChangedEmail,
});

FamilyPasscodeChangedEmail.PreviewProps = {
  displayName: "山田 太郎",
  familyName: "山田家",
  changedByDisplayName: "山田 太郎",
  isSelf: true,
  changedAt: Date.now(),
  deviceName: "Pixel 8 Pro",
  browser: "Chrome Mobile 125",
  os: "Android 14",
  ipAddress: "203.0.113.1",
  location: "東京都, 日本",
  ctaUrl: "https://poohma.ciderlabs.link/dashboard",
};

export default FamilyPasscodeChangedEmail;

import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  exportedAt: v.number(),
  recordCount: v.number(),
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

export function CsvExportedEmail({
  displayName,
  exportedAt,
  recordCount,
  deviceName,
  browser,
  os,
  ipAddress,
  location,
  ctaUrl = "https://poohma.ciderlabs.link/settings",
}: Props) {
  const formattedDate = new Date(exportedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  return (
    <Layout preview={`[PoohMa] アカウントデータがCSVエクスポートされました`}>
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは！家族間アカウント管理アプリ「PoohMa」からセキュリティに関するお知らせです。
      </Text>
      <Text style={text}>
        お使いの PoohMa
        アカウントから、アカウントデータの一括CSVエクスポート（ダウンロード）が実行されました。
      </Text>
      <Section style={infoBox}>
        <Text style={infoItem}>
          <strong>エクスポート件数:</strong> {recordCount} 件
        </Text>
        <Text style={infoItem}>
          <strong>実行日時:</strong> {formattedDate}
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
        この操作に心当たりがない場合は、第三者があなたのアカウントからデータを不正に持ち出した可能性があります。速やかにログインしてパスワードおよび家族パスコードを変更してください。
      </Text>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>セキュリティ設定へ</Button>
      </Section>
    </Layout>
  );
}

export const csvExportedEmail = defineEmailTemplate({
  key: "csvExported",
  props,
  subject: () => `[PoohMa] アカウントデータがエクスポートされました`,
  Component: CsvExportedEmail,
});

CsvExportedEmail.PreviewProps = {
  displayName: "山田 太郎",
  exportedAt: Date.now(),
  recordCount: 15,
  deviceName: "MacBook Air",
  browser: "Safari 17",
  os: "macOS 14.5",
  ipAddress: "203.0.113.1",
  location: "東京都, 日本",
  ctaUrl: "https://poohma.ciderlabs.link/settings",
};

export default CsvExportedEmail;

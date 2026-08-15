import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
  applicantDisplayName: v.string(),
  applicantEmail: v.string(),
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

export function JoinRequestReceivedEmail({
  displayName,
  familyName,
  applicantDisplayName,
  applicantEmail,
  ctaUrl = "https://poohma.ciderlabs.link/family",
}: Props) {
  return (
    <Layout preview={`家族「${familyName}」への参加申請が届きました`}>
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>」に新しい参加申請が届きました。
      </Text>
      <Section style={infoBox}>
        <Text style={infoItem}>
          <strong>【申請者情報】</strong>
        </Text>
        <Text style={infoItem}>
          <strong>表示名:</strong> {applicantDisplayName}
        </Text>
        <Text style={infoItem}>
          <strong>メールアドレス:</strong> {applicantEmail}
        </Text>
      </Section>
      <Text style={text}>
        以下のボタンから家族管理画面を開き、承認または却下を行ってください。
      </Text>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>参加申請を確認する</Button>
      </Section>
    </Layout>
  );
}

export const joinRequestReceivedEmail = defineEmailTemplate({
  key: "joinRequestReceived",
  props,
  subject: (p) => `[PoohMa] 家族「${p.familyName}」への参加申請が届きました`,
  Component: JoinRequestReceivedEmail,
});

JoinRequestReceivedEmail.PreviewProps = {
  displayName: "たろう",
  familyName: "鈴木家",
  applicantDisplayName: "はなこ",
  applicantEmail: "[EMAIL_ADDRESS]",
  ctaUrl: "https://poohma.ciderlabs.link/",
};

export default JoinRequestReceivedEmail;

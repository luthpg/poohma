import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
  variant: v.union(v.literal("join"), v.literal("migration")),
  ctaUrl: v.optional(v.string()),
});

type Props = Infer<typeof props>;

const text = {
  margin: "0 0 16px",
};

const buttonWrapper = {
  margin: "24px 0",
  textAlign: "center" as const,
};

export function JoinApprovedEmail({
  displayName,
  familyName,
  variant,
  ctaUrl = "https://poohma.ciderlabs.link/family",
}: Props) {
  const isMigration = variant === "migration";
  const title = isMigration ? "移行申請" : "参加申請";

  return (
    <Layout preview={`家族「${familyName}」への${title}が承認されました`}>
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>」への{title}が承認されました。
      </Text>
      <Text style={text}>
        {isMigration
          ? "移行処理を完了するために、アプリにアクセスして新しい家族のパスコードを入力してください。"
          : "新しい家族でのアカウント管理をご利用いただけます。"}
      </Text>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>PoohMaを開く</Button>
      </Section>
    </Layout>
  );
}

export const joinApprovedEmail = defineEmailTemplate({
  key: "joinApproved",
  props,
  subject: (p) =>
    p.variant === "migration"
      ? `[PoohMa] 家族「${p.familyName}」への移行申請が承認されました！`
      : `[PoohMa] 家族「${p.familyName}」への参加申請が承認されました！`,
  Component: JoinApprovedEmail,
});

JoinApprovedEmail.PreviewProps = {
  displayName: "たろう",
  familyName: "鈴木家",
  variant: "join",
  ctaUrl: "https://poohma.ciderlabs.link/",
};

export default JoinApprovedEmail;

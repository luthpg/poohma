import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
  newMemberDisplayName: v.optional(v.string()),
  newMemberEmail: v.optional(v.string()),
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

export function NewMemberJoinedEmail({
  displayName,
  familyName,
  newMemberDisplayName,
  newMemberEmail,
  ctaUrl = "https://poohma.ciderlabs.link/family",
}: Props) {
  return (
    <Layout preview={`家族「${familyName}」に新しいメンバーが参加しました`}>
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>」へ新しいメンバーが参加しました。
      </Text>
      {newMemberDisplayName || newMemberEmail ? (
        <Section style={infoBox}>
          {newMemberDisplayName ? (
            <Text style={infoItem}>
              <strong>表示名:</strong> {newMemberDisplayName}
            </Text>
          ) : null}
          {newMemberEmail ? (
            <Text style={infoItem}>
              <strong>メールアドレス:</strong> {newMemberEmail}
            </Text>
          ) : null}
        </Section>
      ) : null}
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>家族設定を確認する</Button>
      </Section>
    </Layout>
  );
}

export const newMemberJoinedEmail = defineEmailTemplate({
  key: "newMemberJoined",
  props,
  subject: (p) => `[PoohMa] ${p.familyName} に新しいメンバーが参加しました！`,
  Component: NewMemberJoinedEmail,
});

NewMemberJoinedEmail.PreviewProps = {
  displayName: "たろう",
  familyName: "鈴木家",
  newMemberDisplayName: "はなこ",
  newMemberEmail: "hanako@example.com",
  ctaUrl: "https://poohma.ciderlabs.link/",
};

export default NewMemberJoinedEmail;

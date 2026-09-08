import { Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
});

type Props = Infer<typeof props>;

const text = {
  margin: "0 0 16px",
};

export function JoinRequestRejectedEmail({ displayName, familyName }: Props) {
  return (
    <Layout preview={`家族「${familyName}」への参加申請が見送られました`}>
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは。家族間アカウント管理アプリ「PoohMa」からお知らせです。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>
        」への参加申請は、承認されませんでした。
      </Text>
      <Text style={text}>詳細については家族メンバーへ直接ご確認ください。</Text>
    </Layout>
  );
}

export const joinRequestRejectedEmail = defineEmailTemplate({
  key: "joinRequestRejected",
  props,
  subject: (p) =>
    `[PoohMa] 家族「${p.familyName}」への参加申請が見送られました`,
  Component: JoinRequestRejectedEmail,
});

JoinRequestRejectedEmail.PreviewProps = {
  displayName: "たろう",
  familyName: "鈴木家",
};

export default JoinRequestRejectedEmail;

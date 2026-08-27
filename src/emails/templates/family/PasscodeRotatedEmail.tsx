import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  familyName: v.string(),
  ctaUrl: v.string(),
});

type Props = Infer<typeof props>;

const text = {
  margin: "0 0 16px",
};

const warningBox = {
  margin: "16px 0",
  padding: "12px 16px",
  backgroundColor: "#fef3c7",
  borderRadius: "6px",
  color: "#92400e",
  fontSize: "14px",
};

const buttonWrapper = {
  margin: "24px 0",
  textAlign: "center" as const,
};

export function PasscodeRotatedEmail({
  displayName,
  familyName,
  ctaUrl,
}: Props) {
  return (
    <Layout preview={`家族「${familyName}」のパスコードが変更されました`}>
      <Text style={text}>{displayName} さん</Text>
      <Text style={text}>
        こんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。
      </Text>
      <Text style={text}>
        家族「<strong>{familyName}</strong>」の家族パスコードが変更されました。
      </Text>
      <Text style={text}>
        次回PoohMaにアクセスする際は、新しい家族パスコードでロック解除を行ってください。
        生体認証（指紋 / Face
        ID等）をご利用の場合は、新パスコードでロック解除後に設定画面から生体認証を再登録してください。
      </Text>
      <Section style={warningBox}>
        <Text style={{ margin: 0, fontWeight: "bold" }}>
          心当たりがない場合
        </Text>
        <Text style={{ margin: "4px 0 0" }}>
          もしこの変更に心当たりがない場合は、他の家族メンバーにご確認いただくか、速やかに家族グループの再作成・パスコード再設定を行ってください。
        </Text>
      </Section>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>PoohMaを開く</Button>
      </Section>
    </Layout>
  );
}

export const passcodeRotatedEmail = defineEmailTemplate({
  key: "passcodeRotated",
  props,
  subject: () => "PoohMaからのお知らせ（家族パスコードの変更）",
  Component: PasscodeRotatedEmail,
});

PasscodeRotatedEmail.PreviewProps = {
  displayName: "たろう",
  familyName: "鈴木家",
  ctaUrl: "https://poohma.ciderlabs.link/family",
};

export default PasscodeRotatedEmail;

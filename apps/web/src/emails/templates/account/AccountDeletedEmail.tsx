import { Section, Text } from "@react-email/components";
import { type Infer, v } from "convex/values";
import { Button } from "../../_components/Button";
import { Layout } from "../../_components/Layout";
import { defineEmailTemplate } from "../../types";

const props = v.object({
  displayName: v.string(),
  deletedAt: v.number(),
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

export function AccountDeletedEmail({
  displayName,
  deletedAt,
  ctaUrl = "https://poohma.ciderlabs.link/",
}: Props) {
  const formattedDate = new Date(deletedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  return (
    <Layout preview={`[PoohMa] アカウント削除が完了しました`}>
      <Text style={text}>{displayName} 様</Text>
      <Text style={text}>
        家族間アカウント管理アプリ「PoohMa」をご利用いただき、誠にありがとうございました。
      </Text>
      <Text style={text}>
        ご依頼いただきました PoohMa アカウントの削除手続きが完了いたしました。
      </Text>
      <Section style={infoBox}>
        <Text style={infoItem}>
          <strong>対象アカウント:</strong> {displayName}
        </Text>
        <Text style={infoItem}>
          <strong>削除完了日時:</strong> {formattedDate}
        </Text>
      </Section>
      <Text style={text}>
        これまでに登録された個人アカウントデータはすべて安全に削除されました。
        万が一、この削除手続きにお心当たりがない場合は、速やかにサポートまでお問い合わせください。
      </Text>
      <Section style={buttonWrapper}>
        <Button href={ctaUrl}>トップページへ</Button>
      </Section>
    </Layout>
  );
}

export const accountDeletedEmail = defineEmailTemplate({
  key: "accountDeleted",
  props,
  subject: () => `[PoohMa] アカウント削除が完了しました`,
  Component: AccountDeletedEmail,
});

AccountDeletedEmail.PreviewProps = {
  displayName: "山田 太郎",
  deletedAt: Date.now(),
  ctaUrl: "https://poohma.ciderlabs.link/",
};

export default AccountDeletedEmail;

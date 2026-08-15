import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { resolveEmail } from "../src/emails/dispatch";
import { type EmailPayload, emailTemplates } from "../src/emails/registry";

function samplePayloadFor(key: string): EmailPayload {
  switch (key) {
    case "familyWelcome":
      return {
        template: "familyWelcome",
        props: {
          displayName: "山田 太郎",
          familyName: "山田家",
          ctaUrl: "https://poohma.ciderlabs.link/",
        },
      };
    case "newMemberJoined":
      return {
        template: "newMemberJoined",
        props: {
          displayName: "山田 花子",
          familyName: "山田家",
          newMemberDisplayName: "山田 次郎",
          newMemberEmail: "jiro@example.com",
          ctaUrl: "https://poohma.ciderlabs.link/family",
        },
      };
    case "joinRequestReceived":
      return {
        template: "joinRequestReceived",
        props: {
          displayName: "山田 太郎",
          familyName: "山田家",
          applicantDisplayName: "鈴木 一郎",
          applicantEmail: "suzuki@example.com",
          ctaUrl: "https://poohma.ciderlabs.link/family",
        },
      };
    case "joinApproved":
      return {
        template: "joinApproved",
        props: {
          displayName: "鈴木 一郎",
          familyName: "山田家",
          variant: "join",
          ctaUrl: "https://poohma.ciderlabs.link/family",
        },
      };
    case "joinRequestRejected":
      return {
        template: "joinRequestRejected",
        props: {
          displayName: "鈴木 一郎",
          familyName: "山田家",
        },
      };
    case "familyMigrationCompleted":
      return {
        template: "familyMigrationCompleted",
        props: {
          displayName: "山田 太郎",
          familyName: "佐藤家",
          ctaUrl: "https://poohma.ciderlabs.link/",
        },
      };
    default:
      throw new Error(`Unknown template key: ${key}`);
  }
}

describe("メールテンプレート基盤", () => {
  it.each(emailTemplates)(
    "$key テンプレートがHTMLおよびプレーンテキストとして正常にレンダリングできる",
    async (template) => {
      const payload = samplePayloadFor(template.key);
      const { subject, element } = resolveEmail(payload);

      expect(subject).toBeDefined();
      expect(subject.length).toBeGreaterThan(0);

      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);

      expect(html).toContain("PoohMa");
      expect(html).toContain("山田");
      expect(text).toContain("PoohMa");
      expect(text).toContain("山田");
    },
  );

  it("JoinApprovedEmailのmigration variantで適切な件名と文面がレンダリングされる", async () => {
    const payload: EmailPayload = {
      template: "joinApproved",
      props: {
        displayName: "山田 太郎",
        familyName: "佐藤家",
        variant: "migration",
        ctaUrl: "https://poohma.ciderlabs.link/family",
      },
    };

    const { subject, element } = resolveEmail(payload);
    expect(subject).toBe(
      "[PoohMa] 家族「佐藤家」への移行申請が承認されました！",
    );

    const html = await render(element);
    expect(html).toContain("移行申請が承認されました");
    expect(html).toContain("パスコード");
  });
});

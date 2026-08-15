import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

interface LayoutProps {
  preview?: string;
  children: ReactNode;
}

const main = {
  backgroundColor: "#f8fafc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  padding: "40px 0",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "580px",
  padding: "32px",
  boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
};

const headerSection = {
  marginBottom: "24px",
};

const logoText = {
  color: "#0f172a",
  fontSize: "20px",
  fontWeight: "700",
  margin: "0",
  letterSpacing: "-0.025em",
};

const contentSection = {
  color: "#334155",
  fontSize: "15px",
  lineHeight: "1.6",
};

const divider = {
  borderColor: "#e2e8f0",
  margin: "32px 0 24px",
};

const footerSection = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "1.6",
};

const footerText = {
  margin: "4px 0",
};

const copyright = {
  color: "#94a3b8",
  fontSize: "11px",
  marginTop: "16px",
  textAlign: "center" as const,
};

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="ja">
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={main}>
        <Container style={container}>
          <Section style={headerSection}>
            <Heading as="h2" style={logoText}>
              PoohMa
            </Heading>
          </Section>
          <Section style={contentSection}>{children}</Section>
          <Hr style={divider} />
          <Section style={footerSection}>
            <Text style={footerText}>
              ※ 本メールは送信専用アドレスから自動送信されています。
            </Text>
            <Text style={footerText}>
              ※
              お心当たりのない場合は、本メールを破棄するか運営までご連絡ください。
            </Text>
            <Text style={copyright}>
              &copy; {new Date().getFullYear()} PoohMa. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

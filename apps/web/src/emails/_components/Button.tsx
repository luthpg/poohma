import { Button as EmailButton } from "@react-email/components";
import type { ReactNode } from "react";
import { resolveEmailUrl } from "../config";

interface ButtonProps {
  href: string;
  children: ReactNode;
}

const buttonStyle = {
  backgroundColor: "#0f172a",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "100%",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
};

export function Button({ href, children }: ButtonProps) {
  const resolvedHref = resolveEmailUrl(href);
  return (
    <EmailButton href={resolvedHref} style={buttonStyle}>
      {children}
    </EmailButton>
  );
}

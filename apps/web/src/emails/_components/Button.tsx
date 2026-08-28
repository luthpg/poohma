import { Button as EmailButton } from "@react-email/components";
import type { ReactNode } from "react";

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
	return (
		<EmailButton href={href} style={buttonStyle}>
			{children}
		</EmailButton>
	);
}

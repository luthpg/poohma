import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const LOGO_PREFIX = "Pooh";
export const LOGO_SUFFIX = "Ma";
export const LOGO_PRIMARY_COLOR = "#0F172A";
export const LOGO_ACCENT_COLOR = "#EA580C";

export function LogoText({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h1
      className={cn("font-bold text-foreground font-sans", className)}
      {...props}
    >
      {LOGO_PREFIX}
      <span className="text-orange-500">{LOGO_SUFFIX}</span>
    </h1>
  );
}

/**
 * 2D Canvas コンテキストに PoohMa ブランドロゴを描画するヘルパー
 * （HTML / React コンポーネントと色・フォント構成を完全同期する Single Source of Truth）
 */
export function renderCanvasLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  options?: {
    fontSize?: number;
    primaryColor?: string;
    accentColor?: string;
  },
): { width: number; height: number } {
  const fontSize = options?.fontSize ?? 26;
  const primaryColor = options?.primaryColor ?? LOGO_PRIMARY_COLOR;
  const accentColor = options?.accentColor ?? LOGO_ACCENT_COLOR;

  ctx.save();
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

  ctx.fillStyle = primaryColor;
  ctx.fillText(LOGO_PREFIX, x, y);
  const prefixWidth = ctx.measureText(LOGO_PREFIX).width;

  ctx.fillStyle = accentColor;
  ctx.fillText(LOGO_SUFFIX, x + prefixWidth, y);
  const suffixWidth = ctx.measureText(LOGO_SUFFIX).width;

  ctx.restore();
  return { width: prefixWidth + suffixWidth, height: fontSize };
}

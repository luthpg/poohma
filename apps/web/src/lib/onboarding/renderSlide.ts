import { loadDefaultJapaneseParser } from "budoux";
import type { OnboardingStep, SlideImageSlot } from "./types";

const parser = loadDefaultJapaneseParser();

/**
 * HTMLエスケープヘルパー
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * BudouX を用いて日本語テキストに <wbr/> を挿入し、自然な禁則改行を行う（JpTextと同等の禁則処理）
 */
function parseJpTextToHtml(text: string): string {
  // 句点による文章区切りと改行の正規化
  const normalized = text.replace(/。(?=[^\r\n])/g, "。\n");
  const lines = normalized.split(/\r\n|\r|\n/);

  return lines
    .map((line) => {
      const tokens = parser.parse(line);
      return tokens.map((token) => escapeHtml(token)).join("<wbr/>");
    })
    .join("<br/>");
}

/**
 * スライド画像スロット ID と public 静的画像ファイルの対応マッピング
 */
export const SLIDE_IMAGES: Record<string, string> = {
  "welcome-family-share": "/welcome-family-share.webp",
  "e2ee-secret-lock": "/e2ee-secret-lock.webp",
  "recovery-kit-paper": "/recovery-kit-sheet.webp",
};

/**
 * 画像スロットに応じた実画像 HTML を生成
 * アスペクト比はデフォルトで 4:3（640x480）を使用し、明示的に "16/9" が指定された場合は 16:9（640x360）を出力
 */
export function renderSlideImage(slot: SlideImageSlot): string {
  const imageSrc = slot.src ?? SLIDE_IMAGES[slot.id];
  const escapedRole = escapeHtml(slot.role);
  const is16by9 = slot.aspectRatio === "16/9";
  const aspectClass = is16by9 ? "aspect-16-9" : "aspect-4-3";
  const width = 640;
  const height = is16by9 ? 360 : 480;

  if (imageSrc) {
    const escapedSrc = escapeHtml(imageSrc);
    return `
      <div class="poohma-tour-slide-image-container ${aspectClass}">
        <img
          src="${escapedSrc}"
          alt="${escapedRole}"
          class="poohma-tour-slide-image"
          loading="lazy"
          width="${width}"
          height="${height}"
        />
      </div>
    `.trim();
  }

  // フォールバック（画像が未定義の場合はアクセシビリティ対応のスケルトン）
  const escapedBadge = escapeHtml(slot.badgeText ?? "イメージ図");
  return `
    <div class="poohma-tour-skeleton-container ${aspectClass}" role="img" aria-label="${escapedRole}">
      <div class="poohma-tour-skeleton-content">
        <span class="poohma-tour-skeleton-badge">${escapedBadge}</span>
        <p class="poohma-tour-skeleton-role">${escapedRole}</p>
      </div>
    </div>
  `.trim();
}

/**
 * 概念説明スライドの Driver.js ポップオーバー説明用 HTML を生成
 * 日本語禁則処理（JpTextと同等のBudouXパース）を適用
 */
export function renderSlideHtml(
  step: Extract<OnboardingStep, { type: "slide" }>,
): string {
  const imageHtml = step.imageSlot ? renderSlideImage(step.imageSlot) : "";
  const parsedDescription = parseJpTextToHtml(step.description);

  return `
    <div class="poohma-tour-slide-body">
      ${imageHtml}
      <div class="poohma-tour-slide-text">${parsedDescription}</div>
    </div>
  `.trim();
}

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
 * スライド1用インフォグラフィック:
 * 動画・ネット・個人アカウントが PoohMa にひとまとめに集約される図解
 */
function renderWelcomeInfographic(): string {
  return `
    <div class="poohma-infographic infographic-welcome">
      <div class="infographic-stage">
        <!-- 集約ハブ（PoohMa） -->
        <div class="info-hub-center">
          <div class="info-hub-glow"></div>
          <div class="info-hub-box">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-500">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
            <span class="info-hub-title">PoohMa</span>
          </div>
        </div>

        <!-- サービスカード1: 動画配信（共有中） -->
        <div class="info-card info-card-1">
          <div class="info-card-icon bg-red-500/10 text-red-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="6 3 20 12 6 21 6 3"/>
            </svg>
          </div>
          <div class="info-card-text">
            <span class="info-card-name">動画配信</span>
            <span class="info-tag-shared">共有中</span>
          </div>
        </div>

        <!-- サービスカード2: ネット回線（共有中） -->
        <div class="info-card info-card-2">
          <div class="info-card-icon bg-blue-500/10 text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 13a10 10 0 0 1 14 0"/>
              <path d="M8.5 16.5a5 5 0 0 1 7 0"/>
              <path d="M2 8.82a15 15 0 0 1 20 0"/>
              <line x1="12" x2="12.01" y1="20" y2="20"/>
            </svg>
          </div>
          <div class="info-card-text">
            <span class="info-card-name">自宅Wi-Fi</span>
            <span class="info-tag-shared">共有中</span>
          </div>
        </div>

        <!-- サービスカード3: 個人アカウント（自分のみ） -->
        <div class="info-card info-card-3">
          <div class="info-card-icon bg-emerald-500/10 text-emerald-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="5"/>
              <path d="M20 21a8 8 0 0 0-16 0"/>
            </svg>
          </div>
          <div class="info-card-text">
            <span class="info-card-name">個人口座</span>
            <span class="info-tag-private">自分のみ</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * スライド2用インフォグラフィック:
 * スマホの中で秘密の合言葉を使ってカギが開く端末内保護の図解
 */
function renderSecretLockInfographic(): string {
  return `
    <div class="poohma-infographic infographic-lock">
      <div class="infographic-stage">
        <!-- スマホフレーム -->
        <div class="info-phone-frame">
          <div class="info-phone-header">
            <div class="info-phone-notch"></div>
          </div>
          <div class="info-phone-body">
            <!-- 暗号化された状態から合言葉で解錠 -->
            <div class="info-lock-flow">
              <div class="info-lock-badge">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-orange-500">
                  <path d="M12 2v4"/>
                  <path d="m4.93 4.93 2.83 2.83"/>
                  <path d="M2 12h4"/>
                  <path d="m4.93 19.07 2.83-2.83"/>
                  <path d="M12 22v-4"/>
                  <path d="m19.07 19.07-2.83-2.83"/>
                  <path d="M22 12h-4"/>
                  <path d="m19.07 4.93-2.83 2.83"/>
                </svg>
                <span>あなたのスマホ内だけで解錠</span>
              </div>
              <div class="info-lock-center">
                <div class="info-key-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-amber-500">
                    <circle cx="7.5" cy="15.5" r="5.5"/>
                    <path d="m21 2-9.6 9.6"/>
                    <path d="m15.5 7.5 3 3L22 7l-3-3"/>
                  </svg>
                </div>
                <span class="info-arrow-right">➔</span>
                <div class="info-lock-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                  </svg>
                </div>
              </div>
              <!-- 復号されたヒント表示 -->
              <div class="info-hint-preview">
                <span class="info-hint-label">秘密のヒント:</span>
                <span class="info-hint-text">お母さんの旧姓＋愛猫の名前</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 外部クラウドには暗号文のみ保管 -->
        <div class="info-cloud-note">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500 shrink-0">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
          </svg>
          <span>サーバー側にも中身は見えません</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * スライド3用インフォグラフィック:
 * 紙に印刷して保管できる安心のリカバリーシート図解
 */
function renderRecoveryPaperInfographic(): string {
  return `
    <div class="poohma-infographic infographic-paper">
      <div class="infographic-stage">
        <!-- 紙のシートモック -->
        <div class="info-paper-sheet">
          <div class="info-paper-header">
            <div class="info-paper-logo">
              <span class="h-2 w-2 rounded-full bg-orange-500 inline-block"></span>
              <span class="info-paper-title">PoohMa リカバリーキット</span>
            </div>
            <span class="info-paper-badge">緊急用</span>
          </div>

          <div class="info-paper-body">
            <div class="info-paper-qr-box">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-foreground/70">
                <rect width="5" height="5" x="3" y="3" rx="1"/>
                <rect width="5" height="5" x="16" y="3" rx="1"/>
                <rect width="5" height="5" x="3" y="16" rx="1"/>
                <path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
                <path d="M21 21v.01"/>
                <path d="M12 7v3a2 2 0 0 1-2 2H7"/>
                <path d="M3 12h.01"/>
                <path d="M12 3h.01"/>
                <path d="M12 16v.01"/>
                <path d="M16 12h1"/>
                <path d="M21 12v.01"/>
                <path d="M12 21v-1"/>
              </svg>
            </div>
            <div class="info-paper-lines">
              <div class="info-paper-line info-paper-line-w1"></div>
              <div class="info-paper-line info-paper-line-w2"></div>
              <div class="info-paper-line info-paper-line-w3"></div>
            </div>
          </div>
          <div class="info-paper-footer">
            <span>🖨️ 自宅で印刷して大切に保管</span>
          </div>
        </div>

        <div class="info-safe-tag">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-500 shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
          <span>合言葉を忘れても安心</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * 画像スロットに応じたリッチインフォグラフィックを生成
 */
function renderInfographic(slot: SlideImageSlot): string {
  switch (slot.id) {
    case "welcome-family-share":
      return renderWelcomeInfographic();
    case "e2ee-secret-lock":
      return renderSecretLockInfographic();
    case "recovery-kit-paper":
      return renderRecoveryPaperInfographic();
    default:
      return "";
  }
}

/**
 * 概念説明スライドの Driver.js ポップオーバー説明用 HTML を生成
 * 日本語禁則処理（JpTextと同等のBudouXパース）を適用
 */
export function renderSlideHtml(
  step: Extract<OnboardingStep, { type: "slide" }>,
): string {
  const infographicHtml = step.imageSlot
    ? renderInfographic(step.imageSlot)
    : "";
  const parsedDescription = parseJpTextToHtml(step.description);

  return `
    <div class="poohma-tour-slide-body">
      ${infographicHtml}
      <div class="poohma-tour-slide-text">${parsedDescription}</div>
    </div>
  `.trim();
}

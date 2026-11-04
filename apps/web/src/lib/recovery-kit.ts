import {
  type Color,
  PDFDocument,
  type PDFFont,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib";
import { isValidRecoveryCode, normalizeRecoveryCode } from "@poohma/crypto";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { renderCanvasLogo } from "@/components/common/LogoText";

export interface RecoveryKitPdfParams {
  familyName: string;
  issuedAt: number;
  issuerName: string;
  recoveryCode: string;
}

let cachedFontBytes: ArrayBuffer | null = null;

/**
 * Noto Sans JP フォント（TTF）を動的にロードしてキャッシュ
 * ブラウザ環境では fetch、Node.js 環境（Vitest等）では fs から取得
 */
export async function loadNotoSansJpFont(): Promise<ArrayBuffer | null> {
  if (cachedFontBytes) {
    return cachedFontBytes;
  }

  try {
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      const res = await fetch("/fonts/NotoSansJP-Regular.ttf");
      if (!res.ok) return null;
      cachedFontBytes = await res.arrayBuffer();
      return cachedFontBytes;
    }
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fontPath = path.resolve(
      process.cwd(),
      "public/fonts/NotoSansJP-Regular.ttf",
    );
    if (fs.existsSync(fontPath)) {
      const buffer = await fs.promises.readFile(fontPath);
      cachedFontBytes = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      return cachedFontBytes;
    }
  } catch {
    // フォント読み込み失敗時はフォールバックへ
  }

  return null;
}

/**
 * pdf-lib の標準フォント (WinAnsi) で描画可能な文字のみに安全にサニタイズ
 * WinAnsi非対応文字（日本語等）のみで構成される場合は指定されたフォールバック文字列を返却
 */
function sanitizeWinAnsiText(text: string, fallback = ""): string {
  if (!text) return fallback;
  // 描画可能な ASCII 文字 (0x20 - 0x7E) が1文字も含まれていない場合はフォールバック
  const hasAscii = /[\x20-\x7E]/.test(text);
  if (!hasAscii) return fallback;
  // ASCII printable 以外の文字を安全な代替文字または除去
  const sanitized = text.replace(/[^\x20-\x7E]/g, "").trim();
  return sanitized || fallback;
}

/**
 * リカバリーキットの A4 PDF ドキュメントを生成
 */
export async function generateRecoveryKitPdf({
  familyName,
  issuedAt,
  issuerName,
  recoveryCode,
}: RecoveryKitPdfParams): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // 日本語フォント（Noto Sans JP）のロードと fontkit の動的登録
  let jpFont: PDFFont | null = null;
  try {
    const fontBytes = await loadNotoSansJpFont();
    if (fontBytes) {
      const fontkit = await import("@cantoo/fontkit").then(
        (m) => m.default || m,
      );
      pdfDoc.registerFontkit(fontkit);
      jpFont = await pdfDoc.embedFont(fontBytes, { subset: true });
    }
  } catch {
    // フォント埋め込み失敗時は標準フォントで安全にフォールバック
  }

  // PDF メタデータの設定（ファイル直接アップロード時の安全・確実な復元用）
  pdfDoc.setTitle("PoohMa - 非常用リカバリーキット");
  pdfDoc.setAuthor("PoohMa");
  pdfDoc.setSubject(recoveryCode);
  pdfDoc.setKeywords([recoveryCode, "PoohMa", "RecoveryKit", "E2EE"]);

  // A4 サイズ: 595.28 x 841.89 pt
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // 日本時間（JST）表記の日時文字列
  const formattedDate = `${new Date(issuedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })} JST`;

  // テキスト描画ヘルパー（日本語フォント利用可能時は jpFont、不可時は WinAnsi サニタイズ）
  const drawJpText = (
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      fallbackText?: string;
      isBold?: boolean;
      color?: Color;
      maxWidth?: number;
    },
  ) => {
    let font = jpFont;
    let renderText = text;
    if (!font) {
      font = options.isBold ? fontBold : fontRegular;
      renderText = sanitizeWinAnsiText(text, options.fallbackText ?? text);
    }

    let fontSize = options.size;
    if (options.maxWidth && options.maxWidth > 0) {
      try {
        const textWidth = font.widthOfTextAtSize(renderText, fontSize);
        if (textWidth > options.maxWidth) {
          // まずフォントサイズを縮小して収まるか試行（下限 7pt）
          const scaledSize = fontSize * (options.maxWidth / textWidth);
          if (scaledSize >= 7) {
            fontSize = Math.floor(scaledSize * 10) / 10;
          } else {
            // 7pt でも収まらない極端に長い文字列は末尾を "..." に切り詰め
            fontSize = 7;
            while (
              renderText.length > 3 &&
              font.widthOfTextAtSize(`${renderText}...`, fontSize) >
                options.maxWidth
            ) {
              renderText = renderText.slice(0, -1);
            }
            renderText = `${renderText}...`;
          }
        }
      } catch {
        // フォントの widthOfTextAtSize で万一例外が出ても元のサイズで描画を続行
      }
    }

    page.drawText(renderText, {
      x: options.x,
      y: options.y,
      size: fontSize,
      font,
      color: options.color ?? rgb(0.1, 0.1, 0.15),
    });
  };

  // 背景装飾（ヘッダー帯）
  page.drawRectangle({
    x: 0,
    y: height - 100,
    width: width,
    height: 100,
    color: rgb(0.12, 0.15, 0.2), // ダークスレート
  });

  // ヘッダータイトル
  drawJpText("PoohMa - 非常用リカバリーキット", {
    x: 50,
    y: height - 60,
    size: 20,
    isBold: true,
    color: rgb(1, 1, 1),
    fallbackText: "PoohMa - Emergency Recovery Kit",
  });

  drawJpText("マスターキー復元・緊急救出用ドキュメント", {
    x: 50,
    y: height - 80,
    size: 10.5,
    color: rgb(0.8, 0.85, 0.9),
    fallbackText: "MasterKey Recovery & Account Rescue Document",
  });

  // メタデータボックス
  page.drawRectangle({
    x: 50,
    y: height - 200,
    width: width - 100,
    height: 80,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  // メタデータボックス内の最大許容テキスト幅（右端余白 15pt を考慮）
  const maxMetaValueWidth = width - 50 - 15 - 170; // 約 360pt

  drawJpText("対象家族名:", {
    x: 70,
    y: height - 145,
    size: 10,
    isBold: true,
    color: rgb(0.3, 0.35, 0.4),
    fallbackText: "Family Target:",
  });
  drawJpText(familyName, {
    x: 170,
    y: height - 145,
    size: 11,
    isBold: true,
    color: rgb(0.1, 0.1, 0.15),
    fallbackText: "Family",
    maxWidth: maxMetaValueWidth,
  });

  drawJpText("発行日時:", {
    x: 70,
    y: height - 165,
    size: 10,
    isBold: true,
    color: rgb(0.3, 0.35, 0.4),
    fallbackText: "Issued At:",
  });
  drawJpText(formattedDate, {
    x: 170,
    y: height - 165,
    size: 10,
    color: rgb(0.2, 0.2, 0.2),
    fallbackText: formattedDate,
    maxWidth: maxMetaValueWidth,
  });

  drawJpText("発行者:", {
    x: 70,
    y: height - 185,
    size: 10,
    isBold: true,
    color: rgb(0.3, 0.35, 0.4),
    fallbackText: "Issued By:",
  });
  drawJpText(issuerName, {
    x: 170,
    y: height - 185,
    size: 10,
    color: rgb(0.2, 0.2, 0.2),
    fallbackText: "Family Admin",
    maxWidth: maxMetaValueWidth,
  });

  // リカバリーコードセクション
  drawJpText("復元コード（Recovery Code）※厳重に保管してください", {
    x: 50,
    y: height - 240,
    size: 11,
    isBold: true,
    color: rgb(0.8, 0.2, 0.2),
    fallbackText: "YOUR RECOVERY CODE (KEEP SECRET)",
  });

  page.drawRectangle({
    x: 50,
    y: height - 370,
    width: width - 100,
    height: 115,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1.5,
  });

  // QR コード画像の生成と埋め込み
  try {
    const qrDataUrl = await QRCode.toDataURL(recoveryCode, {
      margin: 1,
      errorCorrectionLevel: "M",
      width: 180,
      color: {
        dark: "#1e293b",
        light: "#f8fafc",
      },
    });
    // DataURL からバイナリデータを取得して埋め込み
    const base64Data = qrDataUrl.split(",")[1];
    if (base64Data) {
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const qrImage = await pdfDoc.embedPng(bytes);
      page.drawImage(qrImage, {
        x: width - 50 - 95 - 10,
        y: height - 362,
        width: 95,
        height: 95,
      });
    }
  } catch (_err) {
    // QRコード生成失敗時はスキップして文字コードのみ描画
  }

  // リカバリーコードを2行に分けて描画（各16文字/4グループ）
  const chunks = recoveryCode.split("-");
  const line1 = chunks.slice(0, 4).join("-");
  const line2 = chunks.slice(4, 8).join("-");

  page.drawText(line1, {
    x: 70,
    y: height - 295,
    size: 17,
    font: fontMono,
    color: rgb(0.05, 0.1, 0.2),
  });

  page.drawText(line2, {
    x: 70,
    y: height - 335,
    size: 17,
    font: fontMono,
    color: rgb(0.05, 0.1, 0.2),
  });

  // 手順と注意事項
  drawJpText("マスターキーの復元手順", {
    x: 50,
    y: height - 410,
    size: 12.5,
    isBold: true,
    color: rgb(0.12, 0.15, 0.2),
    fallbackText: "How to Recover Your MasterKey",
  });

  const instructions = [
    "1. PoohMa のロック画面を開き、「家族パスコードをお忘れの場合」をクリックします。",
    "2. 上記の 32 文字の復元コードを入力するか、この PDF ファイルを直接読み込みます。",
    "3. 登録メールアドレスに送信される 6 桁の 2 段階認証コード（OTP）を入力します。",
    "4. 新しい家族パスコードを設定し、暗号化保管庫へのアクセスを復旧します。",
  ];

  let curY = height - 435;
  for (const inst of instructions) {
    drawJpText(inst, {
      x: 50,
      y: curY,
      size: 9,
      color: rgb(0.2, 0.25, 0.3),
      fallbackText: inst,
    });
    curY -= 20;
  }

  // 警告・セキュリティ案内ボックス
  curY -= 15;
  page.drawRectangle({
    x: 50,
    y: curY - 95,
    width: width - 100,
    height: 95,
    color: rgb(1, 0.97, 0.95),
    borderColor: rgb(0.95, 0.8, 0.7),
    borderWidth: 1,
  });

  drawJpText("重要・セキュリティに関する注意事項", {
    x: 70,
    y: curY - 25,
    size: 10,
    isBold: true,
    color: rgb(0.75, 0.25, 0.1),
    fallbackText: "CRITICAL SECURITY NOTICE",
  });

  const notices = [
    "・本ドキュメントは、家族パスコードを忘れた場合にデータを復旧できる唯一の手段です。",
    "・PoohMa はゼロ知識暗号化を採用しているため、運営やサポートでも復旧できません。",
    "・紙に印刷して金庫等に物理保管するか、暗号化された安全なストレージに保管してください。",
  ];

  let noticeY = curY - 45;
  for (const notice of notices) {
    drawJpText(notice, {
      x: 70,
      y: noticeY,
      size: 8.5,
      color: rgb(0.4, 0.2, 0.15),
      fallbackText: notice,
    });
    noticeY -= 16;
  }

  // フッター区切り線
  page.drawLine({
    start: { x: 50, y: 50 },
    end: { x: width - 50, y: 50 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  drawJpText("PoohMa - 家族向けアカウント共有管理アプリ", {
    x: 50,
    y: 35,
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
    fallbackText: "PoohMa - End-to-End Encrypted Family Password Vault",
  });

  drawJpText("1 / 1 ページ", {
    x: width - 95,
    y: 35,
    size: 8,
    color: rgb(0.5, 0.5, 0.5),
    fallbackText: "Page 1 of 1",
  });

  return await pdfDoc.save();
}

// --- PNG tEXt Chunk Metadata Handling ---

const PNG_KEYWORD = "PoohMa-RecoveryCode";

// 標準的な CRC-32 (IEEE 802.3, 多項式 0xEDB88320)
function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * PNG バイナリの末尾 IEND チャンク直前に復元コードを格納した tEXt チャンクを埋め込む
 */
export function embedRecoveryCodeInPng(
  pngBytes: Uint8Array,
  recoveryCode: string,
): Uint8Array {
  if (
    pngBytes.length < 8 ||
    pngBytes[0] !== 0x89 ||
    pngBytes[1] !== 0x50 ||
    pngBytes[2] !== 0x4e ||
    pngBytes[3] !== 0x47
  ) {
    return pngBytes;
  }

  // 末尾の IEND チャンクを探す
  let iendOffset = -1;
  for (let i = pngBytes.length - 12; i >= 8; i--) {
    if (
      pngBytes[i + 4] === 0x49 && // 'I'
      pngBytes[i + 5] === 0x45 && // 'E'
      pngBytes[i + 6] === 0x4e && // 'N'
      pngBytes[i + 7] === 0x44 // 'D'
    ) {
      iendOffset = i;
      break;
    }
  }

  if (iendOffset === -1) {
    return pngBytes;
  }

  // tEXt チャンクデータ構築: Keyword + 0x00 + Text
  const keywordBytes = new TextEncoder().encode(PNG_KEYWORD);
  const textBytes = new TextEncoder().encode(recoveryCode);
  const dataLen = keywordBytes.length + 1 + textBytes.length;
  const chunkData = new Uint8Array(dataLen);
  chunkData.set(keywordBytes, 0);
  chunkData[keywordBytes.length] = 0x00;
  chunkData.set(textBytes, keywordBytes.length + 1);

  // Type + Data に対する CRC 計算
  const typeAndData = new Uint8Array(4 + dataLen);
  typeAndData.set([116, 69, 88, 116], 0); // "tEXt"
  typeAndData.set(chunkData, 4);
  const crc = crc32(typeAndData);

  // チャンク全体 (4 length + 4 type + dataLen + 4 crc)
  const chunkTotalLen = 4 + 4 + dataLen + 4;
  const textChunk = new Uint8Array(chunkTotalLen);
  const view = new DataView(textChunk.buffer);
  view.setUint32(0, dataLen, false); // Length (big-endian)
  textChunk.set(typeAndData, 4); // Type + Data
  view.setUint32(4 + 4 + dataLen, crc, false); // CRC (big-endian)

  // 新しい PNG バイト列の生成
  const result = new Uint8Array(pngBytes.length + chunkTotalLen);
  result.set(pngBytes.subarray(0, iendOffset), 0);
  result.set(textChunk, iendOffset);
  result.set(pngBytes.subarray(iendOffset), iendOffset + chunkTotalLen);

  return result;
}

/**
 * PNG バイナリから tEXt チャンクを走査し、復元コードを抽出
 */
export function extractRecoveryCodeFromPngBytes(
  pngBytes: Uint8Array,
): string | null {
  if (
    pngBytes.length < 8 ||
    pngBytes[0] !== 0x89 ||
    pngBytes[1] !== 0x50 ||
    pngBytes[2] !== 0x4e ||
    pngBytes[3] !== 0x47
  ) {
    return null;
  }

  let offset = 8;
  const view = new DataView(
    pngBytes.buffer,
    pngBytes.byteOffset,
    pngBytes.byteLength,
  );

  while (offset + 8 <= pngBytes.length) {
    const chunkLen = view.getUint32(offset, false);
    const chunkType = String.fromCharCode(
      pngBytes[offset + 4] ?? 0,
      pngBytes[offset + 5] ?? 0,
      pngBytes[offset + 6] ?? 0,
      pngBytes[offset + 7] ?? 0,
    );

    if (chunkType === "tEXt") {
      const dataStart = offset + 8;
      const dataEnd = dataStart + chunkLen;
      if (dataEnd <= pngBytes.length) {
        const chunkData = pngBytes.subarray(dataStart, dataEnd);
        const nullIdx = chunkData.indexOf(0x00);
        if (nullIdx !== -1) {
          const keyword = new TextDecoder("latin1").decode(
            chunkData.subarray(0, nullIdx),
          );
          if (keyword === PNG_KEYWORD) {
            const code = new TextDecoder("latin1").decode(
              chunkData.subarray(nullIdx + 1),
            );
            if (isValidRecoveryCode(code)) {
              return normalizeRecoveryCode(code);
            }
          }
        }
      }
    }

    if (chunkType === "IEND") {
      break;
    }

    offset += 8 + chunkLen + 4;
  }

  return null;
}

/**
 * Canvas のテキスト描画において、指定した最大幅に収まるよう末尾を "…" で省略する
 */
function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let truncated = text;
  while (
    truncated.length > 0 &&
    ctx.measureText(`${truncated}…`).width > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/**
 * リカバリーキットの PNG カード画像（高解像度 1200x760）を生成
 */
export async function generateRecoveryKitPng({
  familyName,
  issuedAt,
  issuerName,
  recoveryCode,
}: RecoveryKitPdfParams): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("generateRecoveryKitPng requires browser environment");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 760;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context not available");
  }

  // 背景描画（上質なオフホワイト）
  ctx.fillStyle = "#F8F9FA";
  ctx.fillRect(0, 0, 1200, 760);

  // 外枠カード（丸角 24px、洗練された境界線と微細なシャドウ）
  const cardX = 36;
  const cardY = 36;
  const cardW = 1128;
  const cardH = 688;
  const radius = 24;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, radius);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();

  // カード内部にクリップして上部アクセントバーを描画（角丸境界からの横はみ出しを完全防止）
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#EA580C";
  ctx.fillRect(cardX, cardY, cardW, 8);
  ctx.restore();

  // カード外枠境界線
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // ヘッダー情報
  // 左上: ブランドロゴ（LogoText よりインポート） & タイトル
  const logoMetrics = renderCanvasLogo(ctx, cardX + 36, cardY + 50, {
    fontSize: 26,
  });

  ctx.fillStyle = "#0F172A";
  ctx.font =
    "bold 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "リカバリーキット",
    cardX + 36 + logoMetrics.width + 14,
    cardY + 50,
  );

  ctx.fillStyle = "#334155";
  ctx.font =
    "600 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const familyText = fitCanvasText(ctx, `家族グループ: ${familyName}`, 560);
  ctx.fillText(familyText, cardX + 36, cardY + 82);

  // 右上: メタ情報（発行日時・発行者）
  const formattedDate = `${new Date(issuedAt).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })} JST`;

  ctx.textAlign = "right";
  ctx.fillStyle = "#64748B";
  ctx.font =
    "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(`発行日時: ${formattedDate}`, cardX + cardW - 36, cardY + 48);
  const issuerText = fitCanvasText(ctx, `発行者: ${issuerName}`, 450);
  ctx.fillText(issuerText, cardX + cardW - 36, cardY + 76);
  ctx.textAlign = "left";

  // 区切り線
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 36, cardY + 104);
  ctx.lineTo(cardX + cardW - 36, cardY + 104);
  ctx.stroke();

  // 中央エリア
  // 左カラム: 復元コード枠（幅 680px）
  const leftX = cardX + 36;
  const leftY = cardY + 128;
  const leftW = 680;

  ctx.fillStyle = "#334155";
  ctx.font =
    "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("復元コード（Recovery Code）", leftX, leftY + 16);

  // コードコンテナ（グレー背景・ボーダー）
  const codeBoxY = leftY + 30;
  const codeBoxH = 170;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(leftX, codeBoxY, leftW, codeBoxH, 16);
  ctx.fillStyle = "#F8FAFC";
  ctx.fill();
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 復元コードを2行（前半ブロック / 後半ブロック）に分割して等幅フォントで描画
  const blocks = recoveryCode.split("-");
  const half = Math.ceil(blocks.length / 2);
  const line1 = blocks.slice(0, half).join("-");
  const line2 = blocks.slice(half).join("-");

  ctx.fillStyle = "#0F172A";
  ctx.font = "bold 28px 'SF Mono', 'Courier New', Menlo, Consolas, monospace";
  ctx.textAlign = "center";
  const codeCenterX = leftX + leftW / 2;
  if (line2) {
    ctx.fillText(line1, codeCenterX, codeBoxY + 70);
    ctx.fillText(line2, codeCenterX, codeBoxY + 125);
  } else {
    ctx.fillText(recoveryCode, codeCenterX, codeBoxY + 95);
  }
  ctx.textAlign = "left";

  // コード下部の案内
  ctx.fillStyle = "#64748B";
  ctx.font =
    "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "※ 家族パスコードをお忘れの際、この復元コードを入力してマスターキーを救出します。",
    leftX,
    codeBoxY + codeBoxH + 32,
  );

  // 右カラム: QRコード枠（幅 340px）
  const rightX = cardX + cardW - 36 - 340;
  const rightY = leftY;
  const rightW = 340;
  const rightH = 260;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rightX, rightY, rightW, rightH, 16);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = "#CBD5E1";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // QR コード生成（200x200）
  try {
    const qrDataUrl = await QRCode.toDataURL(recoveryCode, {
      margin: 1,
      width: 200,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });

    await new Promise<void>((resolve, _reject) => {
      const qrImg = new Image();
      qrImg.onload = () => {
        ctx.drawImage(
          qrImg,
          rightX + (rightW - 200) / 2,
          rightY + 20,
          200,
          200,
        );
        resolve();
      };
      qrImg.onerror = () => resolve(); // エラー時はスキップして継続
      qrImg.src = qrDataUrl;
    });
  } catch {
    // QR 生成失敗時は枠のみ
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#64748B";
  ctx.font =
    "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "カメラまたはアプリでスキャン",
    rightX + rightW / 2,
    rightY + 242,
  );
  ctx.textAlign = "left";

  // 下部注意喚起バナー（温かみのあるアンバー背景 #FFFBEB）
  const noticeY = cardY + cardH - 120;
  const noticeW = cardW - 72;
  const noticeH = 84;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX + 36, noticeY, noticeW, noticeH, 12);
  ctx.fillStyle = "#FFFBEB";
  ctx.fill();
  ctx.strokeStyle = "#FDE68A";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#B45309";
  ctx.font =
    "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText("【重要】安全な保管のお願い", cardX + 54, noticeY + 30);

  ctx.fillStyle = "#78350F";
  ctx.font =
    "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  ctx.fillText(
    "この画像は写真アプリの「非表示」や「お気に入り」アルバム、安全な金庫等で大切に保管してください。",
    cardX + 54,
    noticeY + 54,
  );
  ctx.fillText(
    "復元コードそのものはサーバーに保存されません。第三者に見られたり紛失しないようご注意ください。",
    cardX + 54,
    noticeY + 72,
  );

  // Blob 変換
  const baseBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Canvas toBlob failed"));
    }, "image/png");
  });

  // tEXt チャンク埋め込み
  const rawBytes = new Uint8Array(await baseBlob.arrayBuffer());
  const embeddedBytes = embedRecoveryCodeInPng(rawBytes, recoveryCode);

  return new Blob([embeddedBytes as unknown as BlobPart], {
    type: "image/png",
  });
}

/**
 * 画像（ImageData）から QR コードを読み取り、Recovery Code を抽出
 */
export function extractRecoveryCodeFromImageData(
  imageData: ImageData,
): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  if (!code?.data) return null;

  const text = code.data;
  if (isValidRecoveryCode(text)) {
    return normalizeRecoveryCode(text);
  }
  return null;
}

/**
 * アップロードされたファイル（PDF または 画像）から Recovery Code を抽出
 */
export async function extractRecoveryCodeFromFile(
  file: File,
): Promise<string | null> {
  // 1. PDF ファイルの場合: メタデータから高速・確実に抽出
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const subject = pdfDoc.getSubject();
      if (subject && isValidRecoveryCode(subject)) {
        return normalizeRecoveryCode(subject);
      }
      const keywords = pdfDoc.getKeywords();
      if (keywords) {
        for (const kw of keywords) {
          if (isValidRecoveryCode(kw)) {
            return normalizeRecoveryCode(kw);
          }
        }
      }
    } catch (_err) {
      // PDFメタデータ抽出失敗時は画像QRフォールバックへ進む
    }
  }

  // 2. PNG ファイルの場合: tEXt チャンクメタデータからの高速・確実な抽出を優先試行
  const isPng =
    file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
  if (isPng) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const extracted = extractRecoveryCodeFromPngBytes(
        new Uint8Array(arrayBuffer),
      );
      if (extracted && isValidRecoveryCode(extracted)) {
        return normalizeRecoveryCode(extracted);
      }
    } catch (_err) {
      // tEXt 抽出失敗時は画像QRフォールバックへ進む
    }
  }

  // 3. 画像ファイル（またはメタデータが取得できないPDF/PNG）: 画像として QR コードを解析
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const result = extractRecoveryCodeFromImageData(imageData);
      resolve(result);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

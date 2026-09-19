import {
  type Color,
  PDFDocument,
  type PDFFont,
  rgb,
  StandardFonts,
} from "@cantoo/pdf-lib";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { isValidRecoveryCode, normalizeRecoveryCode } from "./crypto";

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
    },
  ) => {
    if (jpFont) {
      page.drawText(text, {
        x: options.x,
        y: options.y,
        size: options.size,
        font: jpFont,
        color: options.color ?? rgb(0.1, 0.1, 0.15),
      });
    } else {
      const font = options.isBold ? fontBold : fontRegular;
      const safeText = sanitizeWinAnsiText(text, options.fallbackText ?? text);
      page.drawText(safeText, {
        x: options.x,
        y: options.y,
        size: options.size,
        font,
        color: options.color ?? rgb(0.1, 0.1, 0.15),
      });
    }
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

  // 2. 画像ファイル（またはメタデータが取得できないPDF）: 画像として QR コードを解析
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

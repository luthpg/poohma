import { generateRecoveryCode } from "@poohma/crypto";
import { describe, expect, it } from "vitest";
import {
  embedRecoveryCodeInPng,
  extractRecoveryCodeFromFile,
  extractRecoveryCodeFromPngBytes,
  generateRecoveryKitPdf,
} from "@/lib/recovery-kit";

// 最小限の有効な 1x1 PNG バイナリ（IHDR + IDAT + IEND）
const MINIMAL_PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a, // PNG Signature
  0x00,
  0x00,
  0x00,
  0x0d,
  0x49,
  0x48,
  0x44,
  0x52, // IHDR header
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01, // 1x1
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1f,
  0x15,
  0xc4, // RGBA, CRC
  0x89, // CRC end
  0x00,
  0x00,
  0x00,
  0x0a,
  0x49,
  0x44,
  0x41,
  0x54, // IDAT header
  0x78,
  0x9c,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0d,
  0x0a,
  0x2d,
  0xb4, // IDAT data + CRC
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4e,
  0x44, // IEND header
  0xae,
  0x42,
  0x60,
  0x82, // IEND CRC
]);

describe("1.5 リカバリーキット PDF・PNG生成・読み取りテスト (src/lib/recovery-kit.ts)", () => {
  it("A4サイズのPDFバイナリ（Uint8Array）が正しく生成されること", async () => {
    const recoveryCode = generateRecoveryCode();
    const pdfBytes = await generateRecoveryKitPdf({
      familyName: "テスト家族",
      issuedAt: Date.now(),
      issuerName: "管理者太郎",
      recoveryCode,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // PDFヘッダーマジックナンバー %PDF- の検証
    const header = String.fromCharCode(...pdfBytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("生成されたPDFファイルから extractRecoveryCodeFromFile でリカバリーコードが復元できること", async () => {
    const recoveryCode = generateRecoveryCode();
    const pdfBytes = await generateRecoveryKitPdf({
      familyName: "山田家",
      issuedAt: Date.now(),
      issuerName: "山田太郎",
      recoveryCode,
    });

    const pdfFile = new File(
      [pdfBytes as Uint8Array<ArrayBuffer>],
      "RecoveryKit.pdf",
      {
        type: "application/pdf",
      },
    );

    const extracted = await extractRecoveryCodeFromFile(pdfFile);
    expect(extracted).toBe(recoveryCode.replace(/-/g, ""));
  });

  it("PDFメタデータに日本語タイトルおよびリカバリーコードが正しく設定されること", async () => {
    const recoveryCode = generateRecoveryCode();
    const pdfBytes = await generateRecoveryKitPdf({
      familyName: "田中家",
      issuedAt: Date.now(),
      issuerName: "管理者花子",
      recoveryCode,
    });

    const { PDFDocument } = await import("@cantoo/pdf-lib");
    const loadedDoc = await PDFDocument.load(pdfBytes);

    expect(loadedDoc.getTitle()).toBe("PoohMa - 非常用リカバリーキット");
    expect(loadedDoc.getAuthor()).toBe("PoohMa");
    expect(loadedDoc.getSubject()).toBe(recoveryCode);
  });

  it("非常に長い家族名や発行者名が指定されてもテキスト幅制限によりPDFが正常に生成されること", async () => {
    const recoveryCode = generateRecoveryCode();
    const pdfBytes = await generateRecoveryKitPdf({
      familyName:
        "超長大名誉ある伝統と格式の由緒正しきワールドワイド最高峰ファミリーグループ株式会社東京都渋谷区神南オフィス代表取締役一族",
      issuedAt: Date.now(),
      issuerName:
        "very-extremely-long-admin-issuer-account-name-with-many-subdomains@corporation-headquarters.enterprise.example.co.jp",
      recoveryCode,
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);
  });

  it("PNGバイナリへtEXtチャンクを埋め込み、正しく復元コードが抽出できること", () => {
    const recoveryCode = generateRecoveryCode();
    const embedded = embedRecoveryCodeInPng(MINIMAL_PNG_BYTES, recoveryCode);

    expect(embedded.length).toBeGreaterThan(MINIMAL_PNG_BYTES.length);

    const extracted = extractRecoveryCodeFromPngBytes(embedded);
    expect(extracted).toBe(recoveryCode.replace(/-/g, ""));
  });

  it("tEXtチャンクが埋め込まれたPNGファイルから extractRecoveryCodeFromFile で高速に復元コードが読み取れること", async () => {
    const recoveryCode = generateRecoveryCode();
    const embedded = embedRecoveryCodeInPng(MINIMAL_PNG_BYTES, recoveryCode);

    const pngFile = new File(
      [embedded as unknown as BlobPart],
      "PoohMa-RecoveryKit.png",
      {
        type: "image/png",
      },
    );

    const extracted = await extractRecoveryCodeFromFile(pngFile);
    expect(extracted).toBe(recoveryCode.replace(/-/g, ""));
  });
});

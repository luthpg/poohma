import { describe, expect, it } from "vitest";
import { generateRecoveryCode } from "@/lib/crypto";
import {
  extractRecoveryCodeFromFile,
  generateRecoveryKitPdf,
} from "@/lib/recovery-kit";

describe("1.5 リカバリーキット PDF生成・読み取りテスト (src/lib/recovery-kit.ts)", () => {
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
});

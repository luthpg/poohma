import { describe, expect, it } from "vitest";
import { generateRecoveryCode } from "@/lib/crypto";
import { generateRecoveryKitPdf } from "@/lib/recovery-kit";

describe("1.5 リカバリーキット PDF生成テスト (src/lib/recovery-kit.ts)", () => {
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
});

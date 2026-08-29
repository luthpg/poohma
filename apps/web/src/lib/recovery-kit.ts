import jsQR from "jsqr";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { isValidRecoveryCode, normalizeRecoveryCode } from "./crypto";

export interface RecoveryKitPdfParams {
	familyName: string;
	issuedAt: number;
	issuerName: string;
	recoveryCode: string;
}

/**
 * pdf-lib の標準フォント (WinAnsi) で描画可能な文字のみに安全にサニタイズ
 * （標準フォントはマルチバイト日本語に対応していないため）
 */
function sanitizeWinAnsiText(text: string): string {
	if (!text) return "";
	// ASCII printable characters (0x20 - 0x7E)
	return text.replace(/[^\x20-\x7E]/g, "?");
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
	// A4 サイズ: 595.28 x 841.89 pt
	const page = pdfDoc.addPage([595.28, 841.89]);
	const { width, height } = page.getSize();

	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

	const formattedDate = `${new Date(issuedAt).toISOString().replace("T", " ").slice(0, 19)} UTC`;

	// 背景装飾（ヘッダー帯）
	page.drawRectangle({
		x: 0,
		y: height - 100,
		width: width,
		height: 100,
		color: rgb(0.12, 0.15, 0.2), // ダークスレート
	});

	// ヘッダータイトル
	page.drawText("PoohMa - Emergency Recovery Kit", {
		x: 50,
		y: height - 60,
		size: 22,
		font: fontBold,
		color: rgb(1, 1, 1),
	});

	page.drawText("MasterKey Recovery & Account Rescue Document", {
		x: 50,
		y: height - 80,
		size: 11,
		font: fontRegular,
		color: rgb(0.8, 0.85, 0.9),
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

	page.drawText("Family Target:", {
		x: 70,
		y: height - 145,
		size: 10,
		font: fontBold,
		color: rgb(0.3, 0.35, 0.4),
	});
	page.drawText(sanitizeWinAnsiText(familyName) || "Family", {
		x: 170,
		y: height - 145,
		size: 11,
		font: fontBold,
		color: rgb(0.1, 0.1, 0.15),
	});

	page.drawText("Issued At:", {
		x: 70,
		y: height - 165,
		size: 10,
		font: fontBold,
		color: rgb(0.3, 0.35, 0.4),
	});
	page.drawText(formattedDate, {
		x: 170,
		y: height - 165,
		size: 10,
		font: fontRegular,
		color: rgb(0.2, 0.2, 0.2),
	});

	page.drawText("Issued By:", {
		x: 70,
		y: height - 185,
		size: 10,
		font: fontBold,
		color: rgb(0.3, 0.35, 0.4),
	});
	page.drawText(sanitizeWinAnsiText(issuerName) || "Family Admin", {
		x: 170,
		y: height - 185,
		size: 10,
		font: fontRegular,
		color: rgb(0.2, 0.2, 0.2),
	});

	// リカバリーコードセクション
	page.drawText("YOUR RECOVERY CODE (KEEP SECRET)", {
		x: 50,
		y: height - 240,
		size: 12,
		font: fontBold,
		color: rgb(0.8, 0.2, 0.2),
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

	// リカバリーコードを2行に分けて描画（各16文字/4グループ）
	const chunks = recoveryCode.split("-");
	const line1 = chunks.slice(0, 4).join("-");
	const line2 = chunks.slice(4, 8).join("-");

	page.drawText(line1, {
		x: 75,
		y: height - 295,
		size: 20,
		font: fontMono,
		color: rgb(0.05, 0.1, 0.2),
	});

	page.drawText(line2, {
		x: 75,
		y: height - 335,
		size: 20,
		font: fontMono,
		color: rgb(0.05, 0.1, 0.2),
	});

	// 手順と注意事項
	page.drawText("How to Recover Your MasterKey", {
		x: 50,
		y: height - 410,
		size: 13,
		font: fontBold,
		color: rgb(0.12, 0.15, 0.2),
	});

	const instructions = [
		"1. Access the PoohMa application and click 'Forgot Family Passcode' on the lock screen.",
		"2. Enter the 32-character Recovery Code above or upload this PDF document.",
		"3. Check your registered email address and enter the 6-digit Two-Factor Verification Code (OTP).",
		"4. Set a new Family Passcode to restore full access to your encrypted vault.",
	];

	let curY = height - 435;
	for (const inst of instructions) {
		page.drawText(inst, {
			x: 50,
			y: curY,
			size: 9.5,
			font: fontRegular,
			color: rgb(0.2, 0.25, 0.3),
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
		color: rgb(1.0, 0.97, 0.95),
		borderColor: rgb(0.95, 0.6, 0.4),
		borderWidth: 1,
	});

	page.drawText("CRITICAL SECURITY NOTICE", {
		x: 70,
		y: curY - 22,
		size: 10.5,
		font: fontBold,
		color: rgb(0.75, 0.25, 0.1),
	});

	const warnings = [
		"- This Recovery Kit is the ONLY rescue method if you lose your Family Passcode.",
		"- PoohMa servers DO NOT store this Recovery Code and cannot recover your data for you.",
		"- Store this document in a secure physical location (e.g. fireproof safe) or encrypted drive.",
		"- Never share this code with anyone. PoohMa staff will NEVER ask for your Recovery Code.",
	];

	let warnY = curY - 40;
	for (const w of warnings) {
		page.drawText(w, {
			x: 70,
			y: warnY,
			size: 8.5,
			font: fontRegular,
			color: rgb(0.4, 0.2, 0.15),
		});
		warnY -= 14;
	}

	// フッター
	page.drawLine({
		start: { x: 50, y: 50 },
		end: { x: width - 50, y: 50 },
		thickness: 0.5,
		color: rgb(0.8, 0.8, 0.8),
	});

	page.drawText("PoohMa - End-to-End Encrypted Family Password Vault", {
		x: 50,
		y: 35,
		size: 8,
		font: fontRegular,
		color: rgb(0.5, 0.5, 0.5),
	});

	page.drawText(`Page 1 of 1`, {
		x: width - 95,
		y: 35,
		size: 8,
		font: fontRegular,
		color: rgb(0.5, 0.5, 0.5),
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
 * 画像ファイル（File）から QR コードを読み取り
 */
export async function extractRecoveryCodeFromFile(
	file: File,
): Promise<string | null> {
	if (typeof window === "undefined") return null;

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

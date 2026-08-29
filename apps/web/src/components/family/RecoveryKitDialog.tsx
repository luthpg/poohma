import { useMutation } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	Download,
	HardDrive,
	KeyRound,
	Printer,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { api } from "../../../convex/_generated/api";
import {
	deriveKeyFromRecoveryCode,
	generateRecoveryCode,
	generateSalt,
	RECOVERY_KDF_ITERATIONS,
	RECOVERY_KDF_VERSION,
	wrapMasterKeyWithRecovery,
} from "../../lib/crypto";
import {
	getGoogleAccessToken,
	loadGoogleScripts,
	uploadFileToGoogleDrive,
} from "../../lib/google-drive";
import { generateRecoveryKitPdf } from "../../lib/recovery-kit";
import { usePasscode } from "../PasscodeProvider";

interface RecoveryKitDialogProps {
	isOpen: boolean;
	onClose: () => void;
	familyName: string;
	issuerName: string;
	isReissue?: boolean;
	onSuccess?: () => void;
}

export function RecoveryKitDialog({
	isOpen,
	onClose,
	familyName,
	issuerName,
	isReissue = false,
	onSuccess,
}: RecoveryKitDialogProps) {
	const { getMasterKey, requireUnlock } = usePasscode();
	const registerRecoveryKitMut = useMutation(api.recovery.registerRecoveryKit);

	const [step, setStep] = useState<"initial" | "generating" | "saved">(
		"initial",
	);
	const [generatedCode, setGeneratedCode] = useState<string | null>(null);
	const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
	const [pdfUrl, setPdfUrl] = useState<string | null>(null);
	const [hasSavedLocally, setHasSavedLocally] = useState(false);
	const [hasPrinted, setHasPrinted] = useState(false);
	const [hasSavedDrive, setHasSavedDrive] = useState(false);
	const [isDriveUploading, setIsDriveUploading] = useState(false);

	const handleReset = useCallback(() => {
		if (pdfUrl) {
			URL.revokeObjectURL(pdfUrl);
		}
		setStep("initial");
		setGeneratedCode(null);
		setPdfBlob(null);
		setPdfUrl(null);
		setHasSavedLocally(false);
		setHasPrinted(false);
		setHasSavedDrive(false);
		setIsDriveUploading(false);
	}, [pdfUrl]);

	const handleClose = () => {
		handleReset();
		onClose();
	};

	const handleGenerate = async () => {
		try {
			// 1. パスコードアンロック状態の確認
			let currentMasterKey = getMasterKey();
			if (!currentMasterKey) {
				const unlocked = await requireUnlock();
				if (!unlocked) {
					toast.error("マスターキーのアンロックが必要です");
					return;
				}
				currentMasterKey = getMasterKey();
			}
			if (!currentMasterKey) {
				toast.error("マスターキーを取得できませんでした");
				return;
			}

			setStep("generating");

			// 2. リカバリーコードとソルトの生成
			const recoveryCode = generateRecoveryCode();
			const recoverySalt = generateSalt();
			const issuedAt = Date.now();

			// 3. リカバリーキーの導出とマスターキーのラップ
			const recoveryKey = await deriveKeyFromRecoveryCode(
				recoveryCode,
				recoverySalt,
				RECOVERY_KDF_ITERATIONS,
				RECOVERY_KDF_VERSION,
			);
			const wrapped = await wrapMasterKeyWithRecovery(
				currentMasterKey,
				recoveryKey,
			);

			// 4. バックエンドへの登録（旧リカバリー情報の上書き/無効化）
			await registerRecoveryKitMut({
				recoveryMasterKeyEncrypted: wrapped.encrypted,
				recoveryMasterKeyIv: wrapped.iv,
				recoveryMasterKeySalt: recoverySalt,
				recoveryKdfIterations: RECOVERY_KDF_ITERATIONS,
				recoveryCryptoVersion: RECOVERY_KDF_VERSION,
			});

			// 5. PDFドキュメントの生成
			const pdfBytes = await generateRecoveryKitPdf({
				familyName,
				issuedAt,
				issuerName,
				recoveryCode,
			});

			const blob = new Blob([pdfBytes as Uint8Array<ArrayBuffer>], {
				type: "application/pdf",
			});
			const url = URL.createObjectURL(blob);

			setGeneratedCode(recoveryCode);
			setPdfBlob(blob);
			setPdfUrl(url);
			setStep("saved");
			toast.success(
				isReissue
					? "リカバリーキットを再発行しました"
					: "リカバリーキットを発行しました",
			);
			onSuccess?.();
		} catch (error) {
			console.error("Failed to generate recovery kit:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "リカバリーキットの生成に失敗しました",
			);
			setStep("initial");
		}
	};

	// ローカルに保存（ダウンロード）
	const handleDownload = () => {
		if (!pdfUrl) return;
		const a = document.createElement("a");
		a.href = pdfUrl;
		a.download = `PoohMa-RecoveryKit-${familyName.replace(/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]/g, "")}-${new Date().toISOString().slice(0, 10)}.pdf`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setHasSavedLocally(true);
		toast.success("リカバリーキットPDFをダウンロードしました");
	};

	// 印刷
	const handlePrint = () => {
		if (!pdfUrl) return;
		const printWindow = window.open(pdfUrl);
		if (printWindow) {
			printWindow.focus();
			// ブラウザでPDFが開かれた後、印刷をトリガー
			setTimeout(() => {
				printWindow.print();
			}, 500);
		}
		setHasPrinted(true);
	};

	// Google Drive に保存
	const handleSaveToDrive = async () => {
		if (!pdfBlob) return;
		setIsDriveUploading(true);

		try {
			const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
			if (!clientId) {
				toast.info(
					"Google Drive 連携の Client ID が未設定です。ローカル保存をご利用ください。",
				);
				// フォールバックとしてダウンロード
				handleDownload();
				setIsDriveUploading(false);
				return;
			}

			const loaded = await loadGoogleScripts();
			if (!loaded) {
				toast.error("Google Drive スクリプトの読み込みに失敗しました");
				setIsDriveUploading(false);
				return;
			}

			const accessToken = await getGoogleAccessToken(clientId);
			if (!accessToken) {
				toast.error("Google 認証がキャンセルされたか、失敗しました");
				setIsDriveUploading(false);
				return;
			}

			const fileName = `PoohMa-RecoveryKit-${familyName}-${new Date().toISOString().slice(0, 10)}.pdf`;
			const uploadRes = await uploadFileToGoogleDrive({
				accessToken,
				fileName,
				mimeType: "application/pdf",
				data: pdfBlob,
			});

			if (uploadRes) {
				setHasSavedDrive(true);
				toast.success("Google Drive にリカバリーキットを保存しました");
			} else {
				toast.error("Google Drive へのアップロードに失敗しました");
			}
		} catch (error) {
			console.error("Google drive save error:", error);
			toast.error("Google Drive への保存中にエラーが発生しました");
		} finally {
			setIsDriveUploading(false);
		}
	};

	const hasSavedAtLeastOne = hasSavedLocally || hasPrinted || hasSavedDrive;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 rounded-full bg-primary/10 text-primary">
							<ShieldCheck className="h-6 w-6" />
						</div>
						<div>
							<DialogTitle className="text-xl">
								{isReissue
									? "リカバリーキットの再発行"
									: "リカバリーキットの発行"}
							</DialogTitle>
							<DialogDescription className="text-sm mt-1">
								家族パスコードを忘れた場合に備え、復元コードを保管します
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{step === "initial" && (
					<div className="space-y-4 py-2">
						<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
							<div className="flex items-start gap-3">
								<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
								<div className="text-xs sm:text-sm space-y-1.5 leading-relaxed">
									<p className="font-semibold">
										{isReissue
											? "再発行に伴う重要な注意事項"
											: "リカバリーキットについて"}
									</p>
									<p>
										{isReissue
											? "新しくリカバリーキットを発行すると、過去に発行された古い復元コードはすべて即座に無効化されます。"
											: "家族パスコードを忘れてしまった場合、リカバリーキットと登録メールアドレスへの2段階認証で復元できます。"}
									</p>
									<p>
										発行される復元コードはサーバーに保存されないため、必ずPDFを安全な場所に保管してください。
									</p>
								</div>
							</div>
						</div>

						<div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-xs sm:text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">対象家族:</span>
								<span className="font-medium text-foreground">
									{familyName}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">発行者:</span>
								<span className="font-medium text-foreground">
									{issuerName}
								</span>
							</div>
						</div>

						<DialogFooter className="gap-2 sm:gap-0 mt-4">
							<Button variant="outline" onClick={handleClose}>
								キャンセル
							</Button>
							<Button onClick={handleGenerate} className="gap-2 font-semibold">
								<KeyRound className="h-4 w-4" />
								{isReissue ? "同意して再発行する" : "リカバリーキットを発行"}
							</Button>
						</DialogFooter>
					</div>
				)}

				{step === "generating" && (
					<div className="py-12 flex flex-col items-center justify-center gap-4 text-center">
						<Spinner className="h-8 w-8 text-primary" />
						<div className="space-y-1">
							<p className="text-base font-semibold">暗号鍵とPDFを生成中...</p>
							<p className="text-xs text-muted-foreground">
								高エントロピーな復元コードの生成と暗号化を実行しています
							</p>
						</div>
					</div>
				)}

				{step === "saved" && generatedCode && (
					<div className="space-y-5 py-2">
						<div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-900 dark:text-emerald-200">
							<div className="flex items-center gap-2 font-semibold text-sm">
								<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
								リカバリーキットが正常に作成されました
							</div>
							<p className="text-xs mt-1 text-emerald-800/90 dark:text-emerald-300">
								以下のいずれかの方法でPDFを保管してください。
							</p>
						</div>

						{/* 復元コードプレビュー */}
						<div className="rounded-lg border bg-card p-3.5 space-y-1.5">
							<div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
								復元コード（Recovery Code）
							</div>
							<div className="font-mono text-sm sm:text-base font-bold text-foreground tracking-wider select-all break-all bg-muted/60 p-2.5 rounded border">
								{generatedCode}
							</div>
						</div>

						{/* 保存先オプションボタン一覧 */}
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
							<button
								type="button"
								onClick={handleDownload}
								className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-lg border text-center transition-all ${
									hasSavedLocally
										? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: "border-border bg-card hover:bg-muted text-foreground"
								}`}
							>
								<Download className="h-5 w-5" />
								<span className="text-xs font-semibold">
									{hasSavedLocally ? "ダウンロード済" : "この端末に保存"}
								</span>
							</button>

							<button
								type="button"
								onClick={handlePrint}
								className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-lg border text-center transition-all ${
									hasPrinted
										? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: "border-border bg-card hover:bg-muted text-foreground"
								}`}
							>
								<Printer className="h-5 w-5" />
								<span className="text-xs font-semibold">
									{hasPrinted ? "印刷済" : "印刷する"}
								</span>
							</button>

							<button
								type="button"
								onClick={handleSaveToDrive}
								disabled={isDriveUploading}
								className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-lg border text-center transition-all disabled:opacity-50 ${
									hasSavedDrive
										? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										: "border-border bg-card hover:bg-muted text-foreground"
								}`}
							>
								{isDriveUploading ? (
									<Spinner className="h-5 w-5" />
								) : (
									<HardDrive className="h-5 w-5" />
								)}
								<span className="text-xs font-semibold">
									{hasSavedDrive ? "Drive保存済" : "Google Drive"}
								</span>
							</button>
						</div>

						<DialogFooter className="mt-4">
							<Button
								onClick={handleClose}
								disabled={!hasSavedAtLeastOne}
								className="w-full font-semibold"
							>
								{hasSavedAtLeastOne
									? "完了して閉じる"
									: "PDFを保存してください"}
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

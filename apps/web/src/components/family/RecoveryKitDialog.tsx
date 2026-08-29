import { useMutation } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	Download,
	HardDrive,
	KeyRound,
	Printer,
	Share2,
	ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { useAccount } from "@/hooks/useAccount";
import { api } from "../../../convex/_generated/api";
import {
	deriveKeyFromRecoveryCode,
	generateRecoveryCode,
	generateSalt,
	hashRecoveryCode,
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
	const { activeAccountId } = useAccount();
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
	const [hasShared, setHasShared] = useState(false);
	const [isDriveUploading, setIsDriveUploading] = useState(false);
	const [canShareFile, setCanShareFile] = useState(false);

	// Web Share API でファイル共有が可能か判定
	useEffect(() => {
		if (
			typeof navigator !== "undefined" &&
			typeof navigator.share === "function" &&
			typeof navigator.canShare === "function"
		) {
			try {
				const testFile = new File(["test"], "test.pdf", {
					type: "application/pdf",
				});
				setCanShareFile(navigator.canShare({ files: [testFile] }));
			} catch {
				setCanShareFile(false);
			}
		}
	}, []);

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

			// 4. PDFドキュメントの生成（PDF生成が成功した後にDB登録を行う）
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

			// 5. バックエンドへの登録（PDF生成完了後に旧リカバリー情報の上書き/無効化を実行）
			const recoveryCodeHash = await hashRecoveryCode(recoveryCode);
			await registerRecoveryKitMut({
				accountId: activeAccountId || undefined,
				recoveryMasterKeyEncrypted: wrapped.encrypted,
				recoveryMasterKeyIv: wrapped.iv,
				recoveryMasterKeySalt: recoverySalt,
				recoveryCodeHash,
				recoveryKdfIterations: RECOVERY_KDF_ITERATIONS,
				recoveryCryptoVersion: RECOVERY_KDF_VERSION,
			});

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

	// Web Share API による共有（モバイル / 対応環境）
	const handleShare = async () => {
		if (!pdfBlob) return;
		try {
			const safeFamilyName = familyName.replace(
				/[^a-zA-Z0-9_\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff-]/g,
				"",
			);
			const fileName = `PoohMa-RecoveryKit-${safeFamilyName}-${new Date().toISOString().slice(0, 10)}.pdf`;
			const file = new File([pdfBlob], fileName, { type: "application/pdf" });

			if (navigator.canShare && navigator.canShare({ files: [file] })) {
				await navigator.share({
					files: [file],
					title: `PoohMa リカバリーキット (${familyName})`,
					text: "PoohMa の緊急リカバリーキット PDF です。Google ドライブやファイルアプリ等に安全に保管してください。",
				});
				setHasShared(true);
				toast.success("共有メニューを開きました");
			} else {
				handleDownload();
			}
		} catch (err) {
			if (err instanceof Error && err.name === "AbortError") {
				return;
			}
			console.error("Share failed:", err);
			toast.error("共有に失敗しました。ダウンロードをご利用ください。");
		}
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
			setHasPrinted(true);
		} else {
			toast.error(
				"印刷ウィンドウを開けませんでした。ポップアップブロックを解除してください。",
			);
		}
	};

	// Google Drive に保存（モバイルは共有シート優先、PCはAPI連携）
	const handleSaveToDrive = async () => {
		if (!pdfBlob) return;

		// モバイル等で Web Share API が利用可能な場合は、OAuthブロックを回避して共有シート（Googleドライブアプリ等）を起動
		if (canShareFile) {
			await handleShare();
			return;
		}

		setIsDriveUploading(true);

		try {
			const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
			if (!clientId) {
				toast.info(
					"Google Drive 連携の Client ID が未設定です。ローカル保存をご利用ください。",
				);
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

	const hasSavedAtLeastOne =
		hasSavedLocally || hasPrinted || hasSavedDrive || hasShared;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-[560px]">
				<DialogHeader>
					<div className="flex items-center gap-2">
						<div className="p-2 rounded-full bg-primary/10 text-primary">
							<ShieldCheck className="h-6 w-6" />
						</div>
						<div>
							<DialogTitle className="text-lg sm:text-xl">
								{isReissue
									? "リカバリーキットの再発行"
									: "リカバリーキットの発行"}
							</DialogTitle>
							<DialogDescription className="text-xs sm:text-sm">
								家族「{familyName}」の緊急復元用ドキュメント
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{step === "initial" ? (
					<div className="space-y-4 py-2">
						<div className="rounded-lg border bg-muted/40 p-4 space-y-3">
							<div className="flex items-start gap-2.5">
								<KeyRound className="h-5 w-5 text-primary shrink-0 mt-0.5" />
								<div className="space-y-1">
									<h4 className="text-sm font-semibold">
										リカバリーキットとは？
									</h4>
									<p className="text-xs text-muted-foreground leading-relaxed">
										家族パスコードを忘れた場合に、マスターキーを復元してデータを救出するための緊急バックアップPDFです。
									</p>
								</div>
							</div>

							<div className="flex items-start gap-2.5 pt-2 border-t border-border/60">
								<AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
								<div className="space-y-1">
									<h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
										保管に関する注意事項
									</h4>
									<p className="text-xs text-muted-foreground leading-relaxed">
										リカバリーコードはサーバーに平文保存されず、再表示できません。生成されるPDFを必ず安全な場所（印刷保管、Google
										Drive、パスワード管理ソフト等）に保存してください。
									</p>
								</div>
							</div>
						</div>

						<DialogFooter className="mt-6">
							<Button variant="outline" onClick={handleClose}>
								キャンセル
							</Button>
							<Button
								onClick={handleGenerate}
								className="font-semibold gap-1.5"
							>
								<ShieldCheck className="h-4 w-4" />
								リカバリーキットを生成
							</Button>
						</DialogFooter>
					</div>
				) : (
					<div className="space-y-4 py-2">
						<div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
							<CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
							<div className="space-y-1">
								<h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
									リカバリーキットが生成されました
								</h4>
								<p className="text-xs text-muted-foreground leading-relaxed">
									以下のいずれかの方法でPDFを保管してください。少なくとも1つの保存方法を実行すると完了ボタンが有効になります。
								</p>
							</div>
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
							{canShareFile ? (
								<button
									type="button"
									onClick={handleShare}
									className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-lg border text-center transition-all ${
										hasShared
											? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
											: "border-border bg-card hover:bg-muted text-foreground"
									}`}
								>
									<Share2 className="h-5 w-5 text-primary" />
									<span className="text-xs font-semibold">
										{hasShared ? "共有・保存済" : "アプリ・Driveへ共有"}
									</span>
								</button>
							) : (
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
							)}
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

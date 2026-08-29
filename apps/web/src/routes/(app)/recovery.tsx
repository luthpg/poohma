import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowLeft,
	ArrowRight,
	CheckCircle2,
	Eye,
	EyeOff,
	FileUp,
	KeyRound,
	RotateCcw,
	ShieldAlert,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PasscodeStrengthMeter } from "@/components/PasscodeStrengthMeter";
import { Button } from "@/components/ui/button";
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import {
	CURRENT_KDF_ITERATIONS,
	CURRENT_KDF_VERSION,
	deriveKeyFromPasscode,
	deriveKeyFromRecoveryCode,
	generateSalt,
	isValidRecoveryCode,
	normalizeRecoveryCode,
	unwrapMasterKeyWithRecovery,
	wrapMasterKey,
} from "@/lib/crypto";
import { extractRecoveryCodeFromFile } from "@/lib/recovery-kit";
import {
	evaluatePasscodeStrength,
	MIN_PASSCODE_LENGTH,
} from "@/utils/passcode-strength";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/(app)/recovery")({
	component: RecoveryPageComponent,
});

function RecoveryPageComponent() {
	const navigate = useNavigate();
	const { activeAccountId } = useAccount();

	const family = useQuery(
		api.families.getFamilyMembers,
		activeAccountId ? { accountId: activeAccountId } : {},
	);

	const sendRecoveryOtpMut = useMutation(api.recovery.sendRecoveryOtp);
	const verifyRecoveryOtpMut = useMutation(
		api.recovery.verifyRecoveryOtpAndGetRecoveryData,
	);
	const redeemRecoveryMut = useMutation(
		api.recovery.redeemRecoveryAndRotatePasscode,
	);

	// ステップ管理: 1: コード入力 -> 2: メールOTP認証 -> 3: 新パスコード設定 -> 4: 完了
	const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

	// Step 1: Recovery Code
	const [rawCode, setRawCode] = useState("");
	const [isExtractingFile, setIsExtractingFile] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Step 2: Email OTP
	const [otp, setOtp] = useState("");
	const [isSendingOtp, setIsSendingOtp] = useState(false);
	const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
	const [otpSentEmail, setOtpSentEmail] = useState<string | null>(null);
	const [otpCooldown, setOtpCooldown] = useState(0);

	// Step 3: New Passcode

	const [recoveredMasterKey, setRecoveredMasterKey] =
		useState<CryptoKey | null>(null);
	const [sessionToken, setSessionToken] = useState<string | null>(null);
	const [newPasscode, setNewPasscode] = useState("");
	const [newPasscodeConfirm, setNewPasscodeConfirm] = useState("");
	const [showNewPasscode, setShowNewPasscode] = useState(false);
	const [showNewPasscodeConfirm, setShowNewPasscodeConfirm] = useState(false);
	const [isSubmittingPasscode, setIsSubmittingPasscode] = useState(false);

	// クールダウンタイマー管理
	useEffect(() => {
		if (otpCooldown <= 0) return;
		const timer = setInterval(() => {
			setOtpCooldown((prev) => Math.max(0, prev - 1));
		}, 1000);
		return () => clearInterval(timer);
	}, [otpCooldown]);

	// ファイルアップロードからのQRコード/Recovery Code抽出
	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setIsExtractingFile(true);
		try {
			const extracted = await extractRecoveryCodeFromFile(file);
			if (extracted) {
				setRawCode(extracted);
				toast.success("ファイルからリカバリーコードを読み取りました");
			} else {
				toast.error(
					"ファイルからQRコードを検出できませんでした。コードを手入力してください。",
				);
			}
		} catch (err) {
			console.error("Failed to extract code:", err);
			toast.error("ファイルの解析中にエラーが発生しました");
		} finally {
			setIsExtractingFile(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	};

	// 手入力コードのフォーマット補助（ハイフン付き）
	const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		setRawCode(val);
	};

	// Step 1 -> Step 2: OTP 送信へ進む
	const handleProceedToOtp = async () => {
		const normalized = normalizeRecoveryCode(rawCode);
		if (!isValidRecoveryCode(normalized)) {
			toast.error("有効な32文字のリカバリーコードを入力してください");
			return;
		}

		setIsSendingOtp(true);
		try {
			const res = await sendRecoveryOtpMut({});
			setOtpSentEmail(res.email);
			setOtpCooldown(60);
			setStep(2);
			toast.success(
				`登録メールアドレス（${res.email}）に6桁の認証コードを送信しました`,
			);
		} catch (error) {
			console.error("Failed to send OTP:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "認証コードの送信に失敗しました",
			);
		} finally {
			setIsSendingOtp(false);
		}
	};

	// OTP 再送信
	const handleResendOtp = async () => {
		if (otpCooldown > 0 || isSendingOtp) return;
		setIsSendingOtp(true);
		try {
			const res = await sendRecoveryOtpMut({});
			setOtpCooldown(60);
			toast.success(
				`登録メールアドレス（${res.email}）に認証コードを再送信しました`,
			);
		} catch (error) {
			console.error("Failed to resend OTP:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "認証コードの再送信に失敗しました",
			);
		} finally {
			setIsSendingOtp(false);
		}
	};

	// Step 2 -> Step 3: OTP 検証と MasterKey の復号
	const handleVerifyOtp = async () => {
		if (otp.length !== 6) {
			toast.error("6桁の認証コードを入力してください");
			return;
		}

		setIsVerifyingOtp(true);
		try {
			// 1. バックエンドで OTP と Recovery Code を検証し、Wrapped MasterKey とセッショントークンを取得
			const res = await verifyRecoveryOtpMut({
				otpCode: otp,
				recoveryCode: rawCode,
			});
			if (!res.success) {
				toast.error(res.error);
				setIsVerifyingOtp(false);
				return;
			}

			// 2. クライアント側で Recovery Code から Recovery Key を導出
			const recoveryKey = await deriveKeyFromRecoveryCode(
				rawCode,
				res.recoveryMasterKeySalt,
				res.recoveryKdfIterations,
				res.recoveryCryptoVersion as 1,
			);

			// 3. Wrapped MasterKey をアンラップ（復号）
			const unwrappedKey = await unwrapMasterKeyWithRecovery(
				res.recoveryMasterKeyEncrypted,
				res.recoveryMasterKeyIv,
				recoveryKey,
			);

			setRecoveredMasterKey(unwrappedKey);
			setSessionToken(res.sessionToken);
			setStep(3);

			toast.success(
				"本人確認が完了し、マスターキーの復旧に成功しました。新しいパスコードを設定してください。",
			);
		} catch (error) {
			console.error("Verification failed:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "リカバリーコードまたは認証コードが正しくありません",
			);
		} finally {
			setIsVerifyingOtp(false);
		}
	};

	// Step 3 -> 完了: 新しいパスコードの設定
	const handleSetNewPasscode = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!recoveredMasterKey || !sessionToken) {
			toast.error("復旧されたマスターキーまたは認可セッションが見つかりません");
			return;
		}

		const strength = evaluatePasscodeStrength(newPasscode);
		if (!strength.isValid) {
			toast.error(strength.reasons[0]);
			return;
		}

		if (newPasscode !== newPasscodeConfirm) {
			toast.error("確認用パスコードが一致しません");
			return;
		}

		setIsSubmittingPasscode(true);
		try {
			// 新パスコードでマスターキーを再ラップ
			const newSalt = generateSalt();
			const newPasscodeKey = await deriveKeyFromPasscode(
				newPasscode,
				newSalt,
				CURRENT_KDF_ITERATIONS,
				CURRENT_KDF_VERSION,
			);
			const newWrapped = await wrapMasterKey(
				recoveredMasterKey,
				newPasscodeKey,
			);

			// バックエンドでパスコード情報を更新（ワンタイム認可トークンを消費）
			await redeemRecoveryMut({
				sessionToken,
				masterKeyEncrypted: newWrapped.encrypted,
				masterKeyIv: newWrapped.iv,
				masterKeySalt: newSalt,
				kdfIterations: CURRENT_KDF_ITERATIONS,
				cryptoVersion: CURRENT_KDF_VERSION,
			});

			setStep(4);
			toast.success("新しい家族パスコードを設定しました");
		} catch (error) {
			console.error("Failed to update passcode:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "パスコードの更新に失敗しました",
			);
		} finally {
			setIsSubmittingPasscode(false);
		}
	};

	if (!family) {
		return (
			<div className="mx-auto max-w-2xl p-6">
				<div className="rounded-lg border bg-card p-8 text-center space-y-4">
					<ShieldAlert className="h-10 w-10 text-amber-500 mx-auto" />
					<h2 className="text-xl font-semibold">
						家族グループに所属していません
					</h2>
					<p className="text-sm text-muted-foreground">
						リカバリー機能を利用するには、まず家族グループに所属している必要があります。
					</p>
					<Link
						to="/family"
						className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
					>
						<ArrowLeft className="h-4 w-4" />
						家族設定へ戻る
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
			{/* ヘッダーナビゲーション */}
			<div className="flex items-center justify-between">
				<Link
					to="/family"
					className="flex items-center gap-1.5 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition"
				>
					<ArrowLeft className="h-4 w-4" />
					家族設定に戻る
				</Link>
				<span className="text-xs text-muted-foreground">
					対象家族: <strong className="text-foreground">{family.name}</strong>
				</span>
			</div>

			<div className="rounded-xl border bg-card shadow-card p-6 sm:p-8 space-y-6">
				{/* ウィザード進捗インジケーター */}
				<div className="flex items-center justify-between border-b pb-6">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded-full bg-primary/10 text-primary">
							<RotateCcw className="h-6 w-6" />
						</div>
						<div>
							<h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
								家族マスターキーの復元
							</h1>
							<p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
								リカバリーキットとメール2段階認証で安全に復旧します
							</p>
						</div>
					</div>
				</div>

				{/* ステップ 1: リカバリーコード入力 */}
				{step === 1 && (
					<div className="space-y-6">
						<div className="space-y-2">
							<h2 className="text-base font-semibold flex items-center gap-2">
								<span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
									1
								</span>
								リカバリーコードの入力またはPDFの読込
							</h2>
							<p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
								事前に発行・保管した「PoohMa
								リカバリーキット」のPDFファイルをアップロードするか、記載されている32文字の復元コードを入力してください。
							</p>
						</div>

						{/* PDF / 画像アップロード */}
						<div className="rounded-lg border-2 border-dashed border-border p-6 text-center hover:border-primary/50 transition-colors bg-muted/20">
							<input
								ref={fileInputRef}
								type="file"
								accept="application/pdf,image/*"
								onChange={handleFileUpload}
								className="hidden"
								id="recovery-file-input"
								disabled={isExtractingFile}
							/>
							<label
								htmlFor="recovery-file-input"
								className="flex flex-col items-center gap-2 cursor-pointer select-none"
							>
								{isExtractingFile ? (
									<>
										<Spinner className="h-8 w-8 text-primary" />
										<span className="text-sm font-medium">
											ファイルを解析中...
										</span>
									</>
								) : (
									<>
										<FileUp className="h-8 w-8 text-muted-foreground" />
										<div className="space-y-1">
											<span className="text-sm font-semibold text-primary hover:underline">
												PDFまたは画像ファイルを選択
											</span>
											<p className="text-xs text-muted-foreground">
												QRコードから自動的にリカバリーコードを読み取ります
											</p>
										</div>
									</>
								)}
							</label>
						</div>

						<div className="relative flex items-center justify-center">
							<div className="border-t border-border w-full" />
							<span className="bg-card px-3 text-xs text-muted-foreground uppercase font-medium">
								または手入力
							</span>
						</div>

						{/* 手入力テキストフィールド */}
						<div className="space-y-2">
							<label
								htmlFor="recovery-code-input"
								className="block text-xs sm:text-sm font-medium text-foreground"
							>
								復元コード（Recovery Code）
							</label>
							<input
								id="recovery-code-input"
								type="text"
								value={rawCode}
								onChange={handleCodeChange}
								placeholder="ABCD-EFGH-JKMN-PQRT-WXYZ-2345-6789-BCDF"
								className="w-full font-mono text-sm sm:text-base tracking-wider rounded-lg border bg-background p-3 focus:outline-none focus:ring-2 focus:ring-primary uppercase"
								autoCapitalize="characters"
								autoCorrect="off"
								spellCheck={false}
							/>
							<p className="text-[11px] text-muted-foreground">
								※ハイフンや空白の有無、大文字小文字は自動調整されます。
							</p>
						</div>

						<div className="pt-2 flex justify-end">
							<Button
								onClick={handleProceedToOtp}
								disabled={!rawCode.trim() || isSendingOtp}
								className="gap-2 font-semibold"
							>
								{isSendingOtp ? (
									<>
										<Spinner className="h-4 w-4" />
										認証コード送信中...
									</>
								) : (
									<>
										次へ（2段階認証）
										<ArrowRight className="h-4 w-4" />
									</>
								)}
							</Button>
						</div>
					</div>
				)}

				{/* ステップ 2: メール 2段階認証 (OTP) */}
				{step === 2 && (
					<div className="space-y-6">
						<div className="space-y-2">
							<h2 className="text-base font-semibold flex items-center gap-2">
								<span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
									2
								</span>
								登録メールアドレスでの2段階認証
							</h2>
							<p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
								第三者による不正復元を防ぐため、ご登録のメールアドレス（
								<strong className="text-foreground">{otpSentEmail}</strong>
								）に届いた6桁の認証コードを入力してください。
							</p>
						</div>

						{/* 6桁 OTP 入力 (shadcn InputOTP) */}
						<div className="flex flex-col items-center justify-center py-4 space-y-4">
							<InputOTP
								maxLength={6}
								value={otp}
								onChange={(val) => setOtp(val)}
								autoFocus
							>
								<InputOTPGroup>
									<InputOTPSlot index={0} />
									<InputOTPSlot index={1} />
									<InputOTPSlot index={2} />
									<InputOTPSlot index={3} />
									<InputOTPSlot index={4} />
									<InputOTPSlot index={5} />
								</InputOTPGroup>
							</InputOTP>

							<div className="text-xs text-muted-foreground flex items-center gap-2">
								<span>認証コードが届かない場合:</span>
								<button
									type="button"
									onClick={handleResendOtp}
									disabled={otpCooldown > 0 || isSendingOtp}
									className="text-primary hover:underline font-medium disabled:opacity-50 disabled:no-underline cursor-pointer"
								>
									{otpCooldown > 0
										? `再送信 (${otpCooldown}秒)`
										: "コードを再送信"}
								</button>
							</div>
						</div>

						<div className="pt-2 flex justify-between">
							<Button
								variant="outline"
								onClick={() => setStep(1)}
								disabled={isVerifyingOtp}
							>
								戻る
							</Button>
							<Button
								onClick={handleVerifyOtp}
								disabled={otp.length !== 6 || isVerifyingOtp}
								className="gap-2 font-semibold"
							>
								{isVerifyingOtp ? (
									<>
										<Spinner className="h-4 w-4" />
										認証 & 復号中...
									</>
								) : (
									<>
										認証して復元する
										<ShieldCheck className="h-4 w-4" />
									</>
								)}
							</Button>
						</div>
					</div>
				)}

				{/* ステップ 3: 新しい家族パスコードの設定 */}
				{step === 3 && (
					<form onSubmit={handleSetNewPasscode} className="space-y-6">
						<div className="space-y-2">
							<h2 className="text-base font-semibold flex items-center gap-2">
								<span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
									3
								</span>
								新しい家族パスコードの設定
							</h2>
							<p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
								マスターキーが安全に復元されました。今後家族データの閲覧に使用する新しい家族パスコードを設定してください。
							</p>
						</div>

						<div className="space-y-4">
							<div className="space-y-1.5">
								<label
									htmlFor="recovery-new-passcode"
									className="block text-xs sm:text-sm font-medium text-foreground"
								>
									新しい家族パスコード <span className="text-red-500">*</span>
								</label>
								<div className="relative">
									<input
										id="recovery-new-passcode"
										type={showNewPasscode ? "text" : "password"}
										required
										minLength={MIN_PASSCODE_LENGTH}
										value={newPasscode}
										onChange={(e) => setNewPasscode(e.target.value)}
										disabled={isSubmittingPasscode}
										placeholder="8文字以上の安全なパスコード"
										className="w-full rounded-lg border bg-background p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
									/>
									<button
										type="button"
										onClick={() => setShowNewPasscode(!showNewPasscode)}
										className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
									>
										{showNewPasscode ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
								<PasscodeStrengthMeter passcode={newPasscode} />
							</div>

							<div className="space-y-1.5">
								<label
									htmlFor="recovery-new-passcode-confirm"
									className="block text-xs sm:text-sm font-medium text-foreground"
								>
									新しい家族パスコード（確認）{" "}
									<span className="text-red-500">*</span>
								</label>
								<div className="relative">
									<input
										id="recovery-new-passcode-confirm"
										type={showNewPasscodeConfirm ? "text" : "password"}
										required
										minLength={MIN_PASSCODE_LENGTH}
										value={newPasscodeConfirm}
										onChange={(e) => setNewPasscodeConfirm(e.target.value)}
										disabled={isSubmittingPasscode}
										placeholder="新しい家族パスコード（確認）"
										className="w-full rounded-lg border bg-background p-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
									/>
									<button
										type="button"
										onClick={() =>
											setShowNewPasscodeConfirm(!showNewPasscodeConfirm)
										}
										className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
									>
										{showNewPasscodeConfirm ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>
						</div>

						<div className="pt-2 flex justify-end">
							<Button
								type="submit"
								disabled={
									isSubmittingPasscode ||
									!newPasscode ||
									!newPasscodeConfirm ||
									newPasscode !== newPasscodeConfirm
								}
								className="gap-2 font-semibold w-full sm:w-auto"
							>
								{isSubmittingPasscode ? (
									<>
										<Spinner className="h-4 w-4" />
										暗号化 & 更新中...
									</>
								) : (
									<>
										新しいパスコードを確定
										<KeyRound className="h-4 w-4" />
									</>
								)}
							</Button>
						</div>
					</form>
				)}

				{/* ステップ 4: 復元完了 */}
				{step === 4 && (
					<div className="py-8 text-center space-y-5">
						<div className="inline-flex p-3 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
							<CheckCircle2 className="h-10 w-10" />
						</div>
						<div className="space-y-2">
							<h2 className="text-xl font-bold text-foreground">
								復元が完了しました
							</h2>
							<p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
								家族マスターキーが新しいパスコードで再暗号化され、正常に復旧しました。今後は新しいパスコードでロックを解除してください。
							</p>
						</div>
						<div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
							<Button
								onClick={() => navigate({ to: "/dashboard" })}
								className="w-full sm:w-auto font-semibold"
							>
								ダッシュボードへ戻る
							</Button>
							<Button
								variant="outline"
								onClick={() => navigate({ to: "/family" })}
								className="w-full sm:w-auto"
							>
								家族設定を確認
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

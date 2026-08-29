import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
	useConvex,
	useConvexAuth,
	useMutation,
	useQuery,
	useQuery_experimental,
} from "convex/react";
import { signOut } from "firebase/auth";
import {
	Ban,
	Check,
	Clock,
	Copy,
	Eye,
	EyeOff,
	Plus,
	QrCode,
	Share2,
	X,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { usePasscode } from "@/components/PasscodeProvider";
import { PasscodeStrengthMeter } from "@/components/PasscodeStrengthMeter";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import { LOGOUT_FLAG_KEY } from "@/hooks/useConvexFirebaseAuth";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import {
	isBiometricEnabledForUser,
	updateBiometricPasscode,
} from "@/lib/biometric";
import {
	CURRENT_KDF_ITERATIONS,
	CURRENT_KDF_VERSION,
	deriveKeyFromPasscode,
	generateMasterKey,
	generateSalt,
	type KdfVersion,
	LEGACY_KDF_VERSION,
	LEGACY_PBKDF2_ITERATIONS,
	reEncryptCredentials,
	unwrapMasterKey,
	wrapMasterKey,
} from "@/lib/crypto";
import { logout } from "@/services/auth.functions";
import { auth } from "@/utils/firebase";
import {
	evaluatePasscodeStrength,
	MIN_PASSCODE_LENGTH,
} from "@/utils/passcode-strength";

export const Route = createFileRoute("/(app)/family")({
	validateSearch: (
		search: Record<string, unknown>,
	): { inviteCode?: string } => ({
		inviteCode: search.inviteCode as string | undefined,
	}),
	pendingComponent: FamilyPending,
	component: FamilyComponent,
});

function FamilyPending() {
	return (
		<div className="mx-auto max-w-3xl p-6">
			<div className="mb-8 flex items-center justify-between">
				<h1 className="text-[32px] font-semibold tracking-geist-h1 text-foreground">
					家族管理
				</h1>
				<Skeleton className="h-[36px] w-[120px] rounded-md" />
			</div>

			<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
				<div className="mb-6 flex items-center justify-between border-b border-border pb-4">
					<Skeleton className="h-6 w-32 rounded-md" />
				</div>
				<div className="mb-8">
					<Skeleton className="mb-3 h-5 w-24 rounded-md" />
					<div className="flex items-center gap-3 rounded-md bg-muted/50 p-4 shadow-border-light">
						<Skeleton className="h-6 w-full max-w-[300px] rounded-md" />
						<Skeleton className="h-[32px] w-[60px] rounded-md" />
					</div>
					<Skeleton className="mt-2 h-4 w-64 rounded-md" />
				</div>

				<div>
					<Skeleton className="mb-4 h-5 w-24 rounded-md" />
					<ul className="space-y-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: Skeleton component uses index as key
								key={i}
								className="flex items-center justify-between rounded-md bg-card p-4 shadow-border-light border border-border/50"
							>
								<Skeleton className="h-5 w-24 rounded-md" />
								<Skeleton className="h-4 w-32 rounded-md" />
							</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}

function FamilyComponent() {
	const { isAuthenticated } = useConvexAuth();
	const { activeAccountId, activeAccount } = useAccount();
	const family = useQuery(
		api.families.getFamilyMembers,
		isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
	);
	const myJoinRequest = useQuery(
		api.families.getMyJoinRequest,
		isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
	);
	const pendingRequests = useQuery(
		api.families.getPendingRequests,
		isAuthenticated && family
			? { accountId: activeAccountId || undefined }
			: "skip",
	);
	const search = Route.useSearch();
	const router = useRouter();
	const { queryClient } = Route.useRouteContext();
	const convex = useConvex();
	const handleLogout = async () => {
		try {
			try {
				sessionStorage.setItem(LOGOUT_FLAG_KEY, "1");
			} catch (e) {
				console.warn("Failed to set logout flag in sessionStorage", e);
			}
			if (auth) await signOut(auth);
			await logout();
			clearQueryCache();
			queryClient.clear();
			window.location.href = "/";
		} catch (error) {
			console.error("Logout failed:", error);
			window.location.href = "/";
		}
	};
	const createFamilyInviteMut = useMutation(api.families.createFamilyInvite);
	const revokeFamilyInviteMut = useMutation(api.families.revokeFamilyInvite);

	const familyInvites = useQuery(
		api.families.getFamilyInvites,
		family ? { accountId: activeAccountId || undefined } : "skip",
	);

	const [selectedTtl, setSelectedTtl] = useState(10080); // 7日 (分)
	const [isCreatingInvite, setIsCreatingInvite] = useState(false);
	const [selectedInviteCode, setSelectedInviteCode] = useState<string | null>(
		null,
	);

	const activeInvites =
		familyInvites?.filter((inv) => inv.status === "active") ?? [];
	const currentActiveInvite =
		activeInvites.find((inv) => inv.code === selectedInviteCode) ??
		activeInvites[0] ??
		null;

	const downloadOrShareQrCode = async () => {
		if (!currentActiveInvite) {
			toast.error("有効な招待コードがありません");
			return;
		}
		const canvas = document.getElementById(
			"qr-canvas",
		) as HTMLCanvasElement | null;
		if (!canvas) {
			toast.error("QRコードが見つかりません");
			return;
		}
		try {
			canvas.toBlob(async (blob) => {
				if (!blob) {
					toast.error("画像の生成に失敗しました");
					return;
				}

				const fileName = `poohma-invite-${family?.name || "family"}.png`;
				const file = new File([blob], fileName, { type: "image/png" });

				// Web Share API でファイル共有可能な場合は画像共有を試みる
				if (navigator.share && navigator.canShare?.({ files: [file] })) {
					try {
						await navigator.share({
							files: [file],
							title: "PoohMa 家族招待",
							text: `${family?.name || "家族グループ"}への招待QRコードです。`,
						});
						return;
					} catch (err) {
						if ((err as Error).name === "AbortError") return;
						console.error("Share failed, falling back to download", err);
					}
				}

				// 非対応またはPC環境の場合はダウンロード
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = fileName;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				toast.success("QRコード画像を保存しました");
			}, "image/png");
		} catch (err) {
			console.error(err);
			toast.error("画像の保存に失敗しました");
		}
	};

	const shareInviteUrl = async () => {
		if (!currentActiveInvite) {
			toast.error("有効な招待コードがありません");
			return;
		}
		const inviteUrl = `${window.location.origin}/family?inviteCode=${currentActiveInvite.code}`;
		if (navigator.share) {
			try {
				await navigator.share({
					title: "PoohMa 家族招待",
					text: `${family?.name}への招待コードです。以下のリンクから参加してください。`,
					url: inviteUrl,
				});
			} catch (err) {
				if ((err as Error).name !== "AbortError") {
					console.error(err);
					toast.error("共有に失敗しました");
				}
			}
		} else {
			try {
				await navigator.clipboard.writeText(inviteUrl);
				toast.success("招待URLをクリップボードにコピーしました");
			} catch (err) {
				console.error(err);
				toast.error("コピーに失敗しました");
			}
		}
	};

	const handleCreateInvite = async () => {
		setIsCreatingInvite(true);
		try {
			const res = await createFamilyInviteMut({
				accountId: activeAccountId || undefined,
				ttlMinutes: selectedTtl,
			});
			setSelectedInviteCode(res.code);
			toast.success("招待コードを発行しました");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "招待コードの発行に失敗しました",
			);
		} finally {
			setIsCreatingInvite(false);
		}
	};

	const handleRevokeInvite = async (inviteId: Id<"familyInvites">) => {
		try {
			await revokeFamilyInviteMut({
				accountId: activeAccountId || undefined,
				inviteId,
			});
			toast.success("招待コードを無効化しました");
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "招待コードの無効化に失敗しました",
			);
		}
	};

	const createFamilyMut = useMutation(api.families.createFamily);
	const prepareFamilyMigrationMut = useMutation(
		api.families.prepareFamilyMigration,
	);
	const commitFamilyMigrationMut = useMutation(
		api.families.commitFamilyMigration,
	);
	const abortFamilyMigrationMut = useMutation(
		api.families.abortFamilyMigration,
	);
	const createJoinRequestMut = useMutation(api.families.createJoinRequest);
	const cancelJoinRequestMut = useMutation(api.families.cancelJoinRequest);
	const dismissRejectedRequestMut = useMutation(
		api.families.dismissRejectedRequest,
	);
	const approveJoinRequestMut = useMutation(api.families.approveJoinRequest);
	const rejectJoinRequestMut = useMutation(api.families.rejectJoinRequest);
	const rotatePasscodeMut = useMutation(api.families.rotatePasscode);

	const [createName, setCreateName] = useState("");
	const [createPasscode, setCreatePasscode] = useState("");
	const [createPasscodeConfirm, setCreatePasscodeConfirm] = useState("");
	const [joinCode, setJoinCode] = useState(search.inviteCode || "");
	const [joinPasscode, setJoinPasscode] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [showCreatePasscode, setShowCreatePasscode] = useState(false);
	const [showCreatePasscodeConfirm, setShowCreatePasscodeConfirm] =
		useState(false);
	const [showJoinPasscode, setShowJoinPasscode] = useState(false);

	const publicFamilyInfoQuery = useQuery_experimental({
		query: api.families.getFamilyPublicInfo,
		args: joinCode.trim()
			? {
					accountId: activeAccountId || undefined,
					code: joinCode.trim(),
				}
			: "skip",
	});
	const publicFamilyInfo =
		publicFamilyInfoQuery.status === "success"
			? publicFamilyInfoQuery.data
			: publicFamilyInfoQuery.status === "error"
				? null
				: undefined;

	const [isChangingPasscode, setIsChangingPasscode] = useState(false);
	const [currentPasscode, setCurrentPasscode] = useState("");
	const [newPasscode, setNewPasscode] = useState("");
	const [newPasscodeConfirm, setNewPasscodeConfirm] = useState("");
	const [showRotatePasscodeForm, setShowRotatePasscodeForm] = useState(false);
	const [showCurrentPasscode, setShowCurrentPasscode] = useState(false);
	const [showNewPasscode, setShowNewPasscode] = useState(false);
	const [showNewPasscodeConfirm, setShowNewPasscodeConfirm] = useState(false);

	const { getMasterKey, requireUnlock, unlock } = usePasscode();
	const [isChangingFamily, setIsChangingFamily] = useState(
		!!search.inviteCode && family !== undefined && family !== null,
	);

	// 参加申請を送信する
	const handleSendJoinRequest = useCallback(
		async (code: string) => {
			setIsLoading(true);
			try {
				await createJoinRequestMut({
					accountId: activeAccountId || undefined,
					code,
				});
				toast.success(
					"参加申請を送信しました。家族メンバーの承認をお待ちください。",
				);
			} catch (error) {
				const msg =
					error instanceof Error ? error.message : "参加申請に失敗しました";
				toast.error(msg);
			} finally {
				setIsLoading(false);
			}
		},
		[createJoinRequestMut, activeAccountId],
	);

	// 家族移行（承認後に移行を完了する。家族未所属ユーザーにも対応）
	const handleCompleteTransfer = useCallback(async () => {
		if (myJoinRequest?.status !== "approved") return;

		if (!joinPasscode || joinPasscode.length < 8) {
			toast.error("新しい家族のパスコードを入力してください（8文字以上）");
			return;
		}

		setIsLoading(true);
		let currentMigrationId: Id<"familyMigrations"> | null = null;
		try {
			// 1. prepare
			const { migrationId } = await prepareFamilyMigrationMut({
				accountId: activeAccountId || undefined,
				action: "join",
				familyId: myJoinRequest.familyId,
			});
			currentMigrationId = migrationId;

			// 2. 移行先の家族情報を取得
			const existingFamily = await convex.query(
				api.families.getFamilyInfoByFamilyId,
				{
					accountId: activeAccountId || undefined,
					familyId: myJoinRequest.familyId,
				},
			);
			if (
				!existingFamily.masterKeyEncrypted ||
				!existingFamily.masterKeyIv ||
				!existingFamily.masterKeySalt
			) {
				throw new Error("既存家族の暗号化情報が不正です");
			}
			const wrappingKey = await deriveKeyFromPasscode(
				joinPasscode,
				existingFamily.masterKeySalt,
				existingFamily.kdfIterations ?? LEGACY_PBKDF2_ITERATIONS,
				(existingFamily.cryptoVersion ?? LEGACY_KDF_VERSION) as KdfVersion,
			);
			const newMasterKey = await unwrapMasterKey(
				existingFamily.masterKeyEncrypted,
				existingFamily.masterKeyIv,
				wrappingKey,
			);

			// 3. 所有するレコードの暗号化対象を取得し再ラップ
			const migrationData = await convex.query(
				api.families.getMigrationForEncryption,
				{ migrationId },
			);
			let reEncryptedCredentials: Awaited<
				ReturnType<typeof reEncryptCredentials>
			> = [];
			if (migrationData.records.length > 0) {
				if (!getMasterKey()) {
					const unlocked = await requireUnlock();
					if (!unlocked) {
						await abortFamilyMigrationMut({
							accountId: activeAccountId || undefined,
							migrationId,
						});
						currentMigrationId = null;
						return;
					}
				}
				const oldMasterKey = getMasterKey();
				if (!oldMasterKey) {
					throw new Error("旧マスターキーが利用できません");
				}
				reEncryptedCredentials = await reEncryptCredentials(
					migrationData.records,
					oldMasterKey,
					newMasterKey,
				);
			}

			// 4. commit
			await commitFamilyMigrationMut({
				accountId: activeAccountId || undefined,
				migrationId,
				credentials: reEncryptedCredentials,
			});

			await queryClient.invalidateQueries({ queryKey: ["authUser"] });
			toast.success("家族グループへの参加が完了しました");
			setIsChangingFamily(false);
			await router.invalidate();
		} catch (error) {
			if (currentMigrationId) {
				try {
					await abortFamilyMigrationMut({
						accountId: activeAccountId || undefined,
						migrationId: currentMigrationId,
					});
				} catch (abortError) {
					console.error("Failed to abort migration:", abortError);
				}
			}
			console.error(error);
			toast.error(
				"家族の変更に失敗しました（パスコードが間違っている可能性があります）",
			);
		} finally {
			setIsLoading(false);
		}
	}, [
		myJoinRequest,
		joinPasscode,
		getMasterKey,
		requireUnlock,
		prepareFamilyMigrationMut,
		convex,
		commitFamilyMigrationMut,
		abortFamilyMigrationMut,
		queryClient,
		router,
		activeAccountId,
	]);

	const handleChangeFamily = async (
		action: "create" | "join",
		e: React.SubmitEvent,
	) => {
		e.preventDefault();
		if (action === "create") {
			const strength = evaluatePasscodeStrength(createPasscode);
			if (!strength.isValid) {
				toast.error(strength.reasons[0]);
				return;
			}
			if (createPasscode !== createPasscodeConfirm) {
				toast.error("パスコードが一致しません");
				return;
			}

			setIsLoading(true);
			let currentMigrationId: Id<"familyMigrations"> | null = null;
			try {
				// 1. セッションに旧マスターキーがあるか確認、なければロック解除を要求
				if (!getMasterKey()) {
					const unlocked = await requireUnlock();
					if (!unlocked) {
						setIsLoading(false);
						return;
					}
				}

				// 2. 新しいマスターキーの準備
				const salt = generateSalt();
				const passcodeKey = await deriveKeyFromPasscode(
					createPasscode,
					salt,
					CURRENT_KDF_ITERATIONS,
					CURRENT_KDF_VERSION,
				);
				const newMasterKey = await generateMasterKey();
				const wrapped = await wrapMasterKey(newMasterKey, passcodeKey);

				// 3. prepare
				const { migrationId } = await prepareFamilyMigrationMut({
					accountId: activeAccountId || undefined,
					action: "create",
					name: createName,
					masterKeyEncrypted: wrapped.encrypted,
					masterKeyIv: wrapped.iv,
					masterKeySalt: salt,
					kdfIterations: CURRENT_KDF_ITERATIONS,
					cryptoVersion: CURRENT_KDF_VERSION,
				});
				currentMigrationId = migrationId;

				// 4. 所有するレコードの暗号化対象を取得し再ラップ
				const migrationData = await convex.query(
					api.families.getMigrationForEncryption,
					{
						accountId: activeAccountId || undefined,
						migrationId,
					},
				);
				const oldMasterKey = getMasterKey();
				if (!oldMasterKey) {
					throw new Error("旧マスターキーが利用できません");
				}
				const reEncryptedCredentials = await reEncryptCredentials(
					migrationData.records,
					oldMasterKey,
					newMasterKey,
				);

				// 5. commit
				await commitFamilyMigrationMut({
					accountId: activeAccountId || undefined,
					migrationId,
					credentials: reEncryptedCredentials,
				});

				await queryClient.invalidateQueries({ queryKey: ["authUser"] });
				toast.success("家族グループを変更し、データを移行しました");
				setIsChangingFamily(false);
				await router.invalidate();
			} catch (error) {
				if (currentMigrationId) {
					try {
						await abortFamilyMigrationMut({
							accountId: activeAccountId || undefined,
							migrationId: currentMigrationId,
						});
					} catch (abortError) {
						console.error("Failed to abort migration:", abortError);
					}
				}
				console.error(error);
				toast.error("家族の変更に失敗しました");
			} finally {
				setIsLoading(false);
			}
		} else {
			// 「参加」の場合は、承認制のためリクエスト送信に切り替え
			await handleSendJoinRequest(joinCode);
		}
	};

	const handleCreate = async (e: React.SubmitEvent) => {
		e.preventDefault();
		const strength = evaluatePasscodeStrength(createPasscode);
		if (!strength.isValid) {
			toast.error(strength.reasons[0]);
			return;
		}
		if (createPasscode !== createPasscodeConfirm) {
			toast.error("パスコードが一致しません");
			return;
		}
		setIsLoading(true);
		try {
			// E2EE: マスターキーの生成とラップ
			const salt = generateSalt();
			const passcodeKey = await deriveKeyFromPasscode(
				createPasscode,
				salt,
				CURRENT_KDF_ITERATIONS,
				CURRENT_KDF_VERSION,
			);
			const masterKey = await generateMasterKey();
			const wrapped = await wrapMasterKey(masterKey, passcodeKey);

			await createFamilyMut({
				accountId: activeAccountId || undefined,
				name: createName,
				masterKeyEncrypted: wrapped.encrypted,
				masterKeyIv: wrapped.iv,
				masterKeySalt: salt,
				kdfIterations: CURRENT_KDF_ITERATIONS,
				cryptoVersion: CURRENT_KDF_VERSION,
			});
			await queryClient.invalidateQueries({ queryKey: ["authUser"] });
			toast.success("家族グループを作成しました。");
			await router.invalidate();
		} catch {
			toast.error("作成に失敗しました");
		} finally {
			setIsLoading(false);
		}
	};

	const handleChangePasscode = async (e: React.SubmitEvent) => {
		e.preventDefault();
		const strength = evaluatePasscodeStrength(newPasscode);
		if (!strength.isValid) {
			toast.error(strength.reasons[0]);
			return;
		}
		if (newPasscode !== newPasscodeConfirm) {
			toast.error("新しいパスコードが一致しません");
			return;
		}
		if (newPasscode === currentPasscode) {
			toast.error("現在のパスコードと異なるものを設定してください");
			return;
		}
		if (
			!family?.masterKeyEncrypted ||
			!family.masterKeyIv ||
			!family.masterKeySalt
		) {
			toast.error("家族の暗号化情報が初期化されていません");
			return;
		}

		setIsChangingPasscode(true);
		try {
			const unlocked = await unlock(currentPasscode);
			if (!unlocked) {
				return;
			}
			const masterKey = getMasterKey();
			if (!masterKey) {
				toast.error("マスターキーの取得に失敗しました");
				return;
			}

			const previousMasterKeyEncrypted = family.masterKeyEncrypted;
			const newSalt = generateSalt();
			const newWrappingKey = await deriveKeyFromPasscode(
				newPasscode,
				newSalt,
				CURRENT_KDF_ITERATIONS,
				CURRENT_KDF_VERSION,
			);
			const wrapped = await wrapMasterKey(masterKey, newWrappingKey);

			try {
				await unwrapMasterKey(wrapped.encrypted, wrapped.iv, newWrappingKey);
			} catch (error) {
				console.error("Self-check failed:", error);
				toast.error("鍵の再暗号化に失敗しました。もう一度お試しください");
				return;
			}

			await rotatePasscodeMut({
				accountId: activeAccountId || undefined,
				previousMasterKeyEncrypted,
				masterKeyEncrypted: wrapped.encrypted,
				masterKeyIv: wrapped.iv,
				masterKeySalt: newSalt,
				kdfIterations: CURRENT_KDF_ITERATIONS,
				cryptoVersion: CURRENT_KDF_VERSION,
			});

			const targetId = activeAccount?.id || (auth?.currentUser?.uid ?? "");
			if (targetId) {
				const hasBiometric = await isBiometricEnabledForUser(targetId);
				if (hasBiometric) {
					try {
						await updateBiometricPasscode(targetId, newPasscode);
					} catch (error) {
						console.error("Biometric passcode update failed:", error);
						toast.error(
							"生体認証のロック解除情報の更新に失敗しました。設定画面から再設定してください。",
						);
					}
				}
			}

			await queryClient.invalidateQueries({ queryKey: ["authUser"] });
			await router.invalidate();
			toast.success("家族パスコードを変更しました");
			setCurrentPasscode("");
			setNewPasscode("");
			setNewPasscodeConfirm("");
			setShowRotatePasscodeForm(false);
		} catch (error) {
			console.error(error);
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("CONFLICT")) {
				toast.error(
					"他の操作と競合しました。ページを再読み込みしてやり直してください",
				);
			} else {
				toast.error("パスコードの変更に失敗しました");
			}
		} finally {
			setIsChangingPasscode(false);
		}
	};

	const handleJoin = async (e: React.SubmitEvent) => {
		e.preventDefault();
		await handleSendJoinRequest(joinCode);
	};

	// family がまだロード中の場合はペンディングコンポーネントを表示
	if (family === undefined) {
		return <FamilyPending />;
	}

	// 保留中・却下済み申請がある場合のUI（家族未所属ユーザー向け）
	if (!family && myJoinRequest) {
		return (
			<div className="mx-auto max-w-3xl p-6">
				<div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
						家族管理
					</h1>
					<div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
						<AccountSwitcher />
						<button
							type="button"
							onClick={handleLogout}
							className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-red-500 shadow-border hover:bg-accent transition cursor-pointer"
						>
							ログアウト
						</button>
					</div>
				</div>

				{myJoinRequest.status === "pending" && (
					<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
						<div className="mb-4 flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
								<Spinner className="h-5 w-5 text-orange-500" />
							</div>
							<div>
								<h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
									承認待ち
								</h2>
								<p className="text-[13px] text-muted-foreground">
									家族「{myJoinRequest.familyName}」への参加申請を送信しました
								</p>
							</div>
						</div>
						<p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
							家族メンバーがあなたの参加申請を承認するまでお待ちください。
							承認されると自動的に家族グループに参加できます。
						</p>
						<button
							type="button"
							disabled={isLoading}
							onClick={async () => {
								setIsLoading(true);
								try {
									await cancelJoinRequestMut({
										accountId: activeAccountId || undefined,
										requestId: myJoinRequest.id as Id<"joinRequests">,
									});
									toast.success("参加申請をキャンセルしました");
								} catch {
									toast.error("キャンセルに失敗しました");
								} finally {
									setIsLoading(false);
								}
							}}
							className="flex items-center justify-center w-full rounded-md bg-card px-4 py-2.5 text-[14px] font-medium text-red-500 shadow-border transition hover:bg-accent disabled:opacity-50 cursor-pointer"
						>
							{isLoading ? (
								<>
									<Spinner className="mr-2 h-4 w-4" />
									キャンセル中...
								</>
							) : (
								"参加申請をキャンセル"
							)}
						</button>
					</div>
				)}

				{myJoinRequest.status === "rejected" && (
					<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
						<div className="mb-4 flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
								<X className="h-5 w-5 text-red-500" />
							</div>
							<div>
								<h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
									参加申請が見送られました
								</h2>
								<p className="text-[13px] text-muted-foreground">
									家族「{myJoinRequest.familyName}
									」への参加申請は承認されませんでした
								</p>
							</div>
						</div>
						<p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
							詳細については家族メンバーへ直接ご確認ください。
							別の家族グループに申請する場合は、下のボタンを押してください。
						</p>
						<button
							type="button"
							disabled={isLoading}
							onClick={async () => {
								setIsLoading(true);
								try {
									await dismissRejectedRequestMut({
										accountId: activeAccountId || undefined,
										requestId: myJoinRequest.id as Id<"joinRequests">,
									});
								} catch {
									toast.error("操作に失敗しました");
								} finally {
									setIsLoading(false);
								}
							}}
							className="flex items-center justify-center w-full rounded-md bg-foreground px-4 py-2.5 text-[14px] font-medium text-background shadow-border transition hover:bg-foreground/90 disabled:opacity-50 cursor-pointer"
						>
							別の家族グループに申請する
						</button>
					</div>
				)}

				{myJoinRequest.status === "approved" && (
					<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
						<div className="mb-4 flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
								<Check className="h-5 w-5 text-green-500" />
							</div>
							<div>
								<h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
									参加申請が承認されました！
								</h2>
								<p className="text-[13px] text-muted-foreground">
									家族「{myJoinRequest.familyName}」への参加が承認されました
								</p>
							</div>
						</div>
						<p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
							家族グループのパスコードを入力して、参加を完了してください。
						</p>
						<div className="space-y-4">
							<div>
								<label
									htmlFor="join-passcode-approved-input"
									className="mb-1.5 block text-[14px] font-medium text-foreground"
								>
									家族パスコード <span className="text-red-500">*</span>
								</label>
								<div className="relative">
									<input
										id="join-passcode-approved-input"
										type={showJoinPasscode ? "text" : "password"}
										required
										minLength={8}
										autoCapitalize="off"
										autoCorrect="off"
										spellCheck={false}
										value={joinPasscode}
										onChange={(e) => setJoinPasscode(e.target.value)}
										placeholder="8文字以上"
										className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
									/>
									<button
										type="button"
										onClick={() => setShowJoinPasscode(!showJoinPasscode)}
										className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
									>
										{showJoinPasscode ? (
											<EyeOff className="h-4 w-4" />
										) : (
											<Eye className="h-4 w-4" />
										)}
									</button>
								</div>
								<p className="mt-1.5 text-[12px] text-muted-foreground">
									参加する家族のパスコードを入力してください。
								</p>
							</div>
							<button
								type="button"
								disabled={isLoading}
								onClick={handleCompleteTransfer}
								className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
							>
								{isLoading ? (
									<>
										<Spinner className="mr-2 h-4 w-4" />
										参加処理中...
									</>
								) : (
									"家族への参加を完了する"
								)}
							</button>
						</div>
					</div>
				)}
			</div>
		);
	}

	// 家族移行中に承認を受けた場合のUI
	if (family && isChangingFamily && myJoinRequest?.status === "approved") {
		return (
			<div className="mx-auto max-w-3xl p-6">
				<div className="mb-6 sm:mb-8 flex items-center justify-between">
					<h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
						家族管理
					</h1>
					<button
						type="button"
						onClick={() => setIsChangingFamily(false)}
						className="text-[13px] sm:text-[14px] px-3 py-1.5 bg-background rounded-md border shadow-sm text-foreground hover:bg-accent transition cursor-pointer"
					>
						キャンセル
					</button>
				</div>

				<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
					<div className="mb-4 flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
							<Check className="h-5 w-5 text-green-500" />
						</div>
						<div>
							<h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
								移行先の家族から承認されました
							</h2>
							<p className="text-[13px] text-muted-foreground">
								家族「{myJoinRequest.familyName}
								」への移行を完了してください
							</p>
						</div>
					</div>
					<p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
						移行を完了するには、新しい家族のパスコードを入力してください。あなたが所有するパスワードヒントは自動的に再暗号化されます。
					</p>
					<div className="space-y-4">
						<div>
							<label
								htmlFor="transfer-passcode-input"
								className="mb-1.5 block text-[14px] font-medium text-foreground"
							>
								新しい家族のパスコード <span className="text-red-500">*</span>
							</label>
							<div className="relative">
								<input
									type={showJoinPasscode ? "text" : "password"}
									id="transfer-passcode-input"
									required
									minLength={8}
									autoCapitalize="off"
									autoCorrect="off"
									spellCheck={false}
									value={joinPasscode}
									onChange={(e) => setJoinPasscode(e.target.value)}
									placeholder="8文字以上"
									className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
								/>
								<button
									type="button"
									onClick={() => setShowJoinPasscode(!showJoinPasscode)}
									className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
								>
									{showJoinPasscode ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
								</button>
							</div>
							<p className="mt-1.5 text-[12px] text-muted-foreground">
								移行先の家族のパスコードを入力してください。
							</p>
						</div>
						<button
							type="button"
							disabled={isLoading}
							onClick={handleCompleteTransfer}
							className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
						>
							{isLoading ? (
								<>
									<Spinner className="mr-2 h-4 w-4" />
									移行中...
								</>
							) : (
								"移行を完了する"
							)}
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl p-6">
			<div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
					家族管理
				</h1>
				<div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
					{family ? (
						<Link
							to="/dashboard"
							className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition"
						>
							ダッシュボードへ
						</Link>
					) : (
						<>
							<AccountSwitcher />
							<button
								type="button"
								onClick={handleLogout}
								className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-red-500 shadow-border hover:bg-accent transition cursor-pointer"
							>
								ログアウト
							</button>
						</>
					)}
				</div>
			</div>

			{family && !isChangingFamily ? (
				<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
					<div className="mb-6 flex items-center justify-between border-b border-border pb-4">
						<h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
							{family.name}
						</h2>
					</div>
					<div className="mb-8">
						<div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
							<h3 className="text-[14px] font-medium text-foreground">
								招待コード管理
							</h3>
							{/* 招待コード新規発行 */}
							<div className="flex items-center gap-2">
								<select
									value={selectedTtl}
									onChange={(e) => setSelectedTtl(Number(e.target.value))}
									disabled={isCreatingInvite}
									className="rounded-md bg-card px-2.5 py-1.5 text-[13px] font-medium text-foreground shadow-border border border-border focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer"
								>
									<option value={60}>有効期限: 1時間</option>
									<option value={1440}>有効期限: 1日</option>
									<option value={10080}>有効期限: 7日（推奨）</option>
									<option value={43200}>有効期限: 30日</option>
								</select>
								<button
									type="button"
									onClick={handleCreateInvite}
									disabled={isCreatingInvite}
									className="flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-[13px] font-medium text-white shadow-border hover:bg-orange-600 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
								>
									{isCreatingInvite ? (
										<Spinner className="h-3.5 w-3.5" />
									) : (
										<Plus className="h-3.5 w-3.5" />
									)}
									コードを発行
								</button>
							</div>
						</div>

						{currentActiveInvite ? (
							<div className="flex flex-col md:flex-row items-center gap-6 rounded-md bg-muted/50 p-6 shadow-border-light">
								<div className="bg-white p-2 rounded-md shadow-sm shrink-0">
									<QRCodeCanvas
										id="qr-canvas"
										value={`${typeof window !== "undefined" ? window.location.origin : ""}/family?inviteCode=${currentActiveInvite.code}`}
										size={120}
									/>
								</div>
								<div className="flex-1 w-full space-y-3 min-w-0">
									<div className="flex items-center justify-between gap-2">
										<div className="flex flex-wrap items-center gap-2">
											<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
												<Check className="h-3 w-3" />
												有効な招待
											</span>
											<span className="text-xs text-muted-foreground">
												有効期限:{" "}
												{new Date(currentActiveInvite.expiresAt).toLocaleString(
													"ja-JP",
												)}
											</span>
										</div>
										<button
											type="button"
											onClick={() =>
												handleRevokeInvite(currentActiveInvite._id)
											}
											className="text-xs text-red-500 hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
										>
											<Ban className="h-3 w-3" />
											無効化
										</button>
									</div>
									<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
										<code className="flex-1 font-mono text-[13px] md:text-[14px] font-semibold text-foreground bg-card p-2.5 rounded-md shadow-sm border border-border break-all">
											{currentActiveInvite.code}
										</code>
										<button
											type="button"
											onClick={() => {
												navigator.clipboard.writeText(currentActiveInvite.code);
												toast.success("招待コードをコピーしました");
											}}
											className="rounded-md bg-card px-4 py-2.5 text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5"
										>
											<Copy className="h-4 w-4" />
											コピー
										</button>
									</div>
									<Separator className="my-2" />
									<div className="flex flex-col sm:flex-row gap-2 pt-1">
										<button
											type="button"
											onClick={downloadOrShareQrCode}
											className="rounded-md bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
										>
											<QrCode className="h-4 w-4" />
											QRコード画像を保存
										</button>
										<button
											type="button"
											onClick={shareInviteUrl}
											className="rounded-md bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
										>
											<Share2 className="h-4 w-4" />
											{typeof navigator !== "undefined" && "share" in navigator
												? "招待URLを共有"
												: "招待URLをコピー"}
										</button>
									</div>
									<Separator className="my-2" />
									<p className="text-[13px] text-muted-foreground">
										このコードまたはQRコードを家族に共有して参加してもらいます。
										<br />
										参加には家族メンバーの承認が必要です。
									</p>
								</div>
							</div>
						) : (
							<div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
								<Clock className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
								<p className="text-[14px] font-medium text-foreground">
									現在有効な招待コードがありません
								</p>
								<p className="text-[12px] text-muted-foreground mt-1 mb-4">
									家族メンバーを招待するには、上の「コードを発行」ボタンから有効期限を指定して招待コードを発行してください。
								</p>
							</div>
						)}

						{/* 発行履歴一覧（存在する場合） */}
						{familyInvites && familyInvites.length > 0 && (
							<div className="mt-4">
								<details className="group rounded-md border border-border bg-card p-3 text-xs">
									<summary className="font-medium text-foreground cursor-pointer select-none flex items-center justify-between">
										<span>
											発行済み招待コード履歴 ({familyInvites.length}件)
										</span>
										<span className="text-muted-foreground group-open:rotate-180 transition-transform">
											▼
										</span>
									</summary>
									<div className="mt-3 divide-y divide-border overflow-x-auto">
										{familyInvites.map((inv) => {
											const isSelected = currentActiveInvite?._id === inv._id;
											return (
												<div
													key={inv._id}
													className={`py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isSelected ? "bg-accent/40 -mx-3 px-3 rounded" : ""}`}
												>
													<div className="flex flex-wrap items-center gap-2 min-w-0">
														<span
															className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
																inv.status === "active"
																	? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
																	: inv.status === "expired"
																		? "bg-muted text-muted-foreground border border-border"
																		: "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
															}`}
														>
															{inv.status === "active"
																? "有効"
																: inv.status === "expired"
																	? "期限切れ"
																	: "無効化済"}
														</span>
														<code className="font-mono font-medium text-foreground text-[11px] truncate max-w-[180px] sm:max-w-none">
															{inv.code}
														</code>
														<span className="text-muted-foreground text-[11px]">
															(申請: {inv.useCount}回)
														</span>
													</div>
													<div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
														<span className="text-muted-foreground text-[11px]">
															{inv.status === "revoked"
																? `無効化日時: ${
																		// biome-ignore lint/style/noNonNullAssertion: revokedAt is set when status is revoked
																		new Date(inv.revokedAt!).toLocaleString(
																			"ja-JP",
																		)
																	}`
																: `期限: ${new Date(inv.expiresAt).toLocaleString("ja-JP")}`}
														</span>
														<button
															type="button"
															onClick={() => {
																navigator.clipboard.writeText(inv.code);
																toast.success("招待コードをコピーしました");
															}}
															className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition cursor-pointer"
															title="コードをコピー"
														>
															<Copy className="h-3.5 w-3.5" />
														</button>
														{inv.status === "active" && (
															<>
																<button
																	type="button"
																	onClick={() =>
																		setSelectedInviteCode(inv.code)
																	}
																	className="px-1.5 py-0.5 text-[11px] text-foreground bg-muted hover:bg-accent rounded border border-border transition cursor-pointer"
																>
																	QR表示
																</button>
																<button
																	type="button"
																	onClick={() => handleRevokeInvite(inv._id)}
																	className="px-1.5 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10 rounded transition cursor-pointer"
																>
																	無効化
																</button>
															</>
														)}
													</div>
												</div>
											);
										})}
									</div>
								</details>
							</div>
						)}
					</div>

					<div>
						<h3 className="mb-4 text-[14px] font-medium text-foreground">
							メンバー一覧
						</h3>
						<ul className="space-y-3">
							{family.users.map((u) => {
								const isCurrentAccount = activeAccountId === u.id;
								const isMyOtherAccount =
									auth?.currentUser?.uid === u.userId && !isCurrentAccount;
								return (
									<li
										key={u.id}
										className="flex items-center justify-between rounded-md bg-card p-4 shadow-border-light"
									>
										<div className="flex flex-col">
											<span className="text-[14px] font-medium text-foreground flex items-center gap-2">
												{u.displayName || "名無し"}
												{isCurrentAccount && (
													<span className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium px-2 py-0.5 rounded-md">
														選択中のアカウント
													</span>
												)}
												{isMyOtherAccount && (
													<span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
														あなたの別アカウント
													</span>
												)}
											</span>
											<span className="text-[12px] text-muted-foreground">
												{u.email}
											</span>
										</div>
									</li>
								);
							})}
						</ul>
					</div>

					{/* 参加リクエスト一覧 */}
					{pendingRequests && pendingRequests.length > 0 && (
						<div className="mt-8 border-t border-border pt-6">
							<h3 className="mb-4 text-[14px] font-medium text-foreground flex items-center gap-2">
								参加リクエスト
								<span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-orange-500 text-[11px] font-semibold text-white">
									{pendingRequests.length}
								</span>
							</h3>
							<ul className="space-y-3">
								{pendingRequests.map((req) => (
									<li
										key={req.id}
										className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md bg-orange-500/5 p-4 shadow-border-light border border-orange-500/20"
									>
										<div className="flex flex-col min-w-0">
											<span className="text-[14px] font-medium text-foreground">
												{req.displayName}
											</span>
											<span className="text-[12px] text-muted-foreground truncate">
												{req.email}
											</span>
											<span className="text-[11px] text-muted-foreground mt-0.5">
												{new Date(req.createdAt).toLocaleString("ja-JP")}
											</span>
										</div>
										<div className="flex gap-2 shrink-0">
											<button
												type="button"
												disabled={isLoading}
												onClick={async () => {
													setIsLoading(true);
													try {
														await approveJoinRequestMut({
															accountId: activeAccountId || undefined,
															requestId: req.id as Id<"joinRequests">,
														});
														toast.success(
															`${req.displayName} さんの参加を承認しました`,
														);
													} catch {
														toast.error("承認に失敗しました");
													} finally {
														setIsLoading(false);
													}
												}}
												className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-[13px] font-medium text-white shadow-border transition hover:bg-green-700 disabled:opacity-50 cursor-pointer"
											>
												<Check className="h-3.5 w-3.5" />
												承認
											</button>
											<button
												type="button"
												disabled={isLoading}
												onClick={async () => {
													setIsLoading(true);
													try {
														await rejectJoinRequestMut({
															accountId: activeAccountId || undefined,
															requestId: req.id as Id<"joinRequests">,
														});
														toast.success(
															`${req.displayName} さんの参加を却下しました`,
														);
													} catch {
														toast.error("却下に失敗しました");
													} finally {
														setIsLoading(false);
													}
												}}
												className="flex items-center gap-1.5 rounded-md bg-card px-4 py-2 text-[13px] font-medium text-red-500 shadow-border transition hover:bg-accent disabled:opacity-50 cursor-pointer"
											>
												<X className="h-3.5 w-3.5" />
												却下
											</button>
										</div>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* 家族パスコードの変更 */}
					<div className="mt-8 border-t border-border pt-6">
						<div className="flex items-center justify-between mb-4">
							<div>
								<h3 className="text-[14px] font-medium text-foreground">
									家族パスコードの変更
								</h3>
								<p className="text-[12px] text-muted-foreground mt-0.5">
									家族グループやメンバー構成は変更せず、パスコードのみを変更します。
								</p>
							</div>
							<button
								type="button"
								onClick={() =>
									setShowRotatePasscodeForm(!showRotatePasscodeForm)
								}
								className="rounded-md bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition shrink-0 cursor-pointer"
							>
								{showRotatePasscodeForm ? "閉じる" : "パスコードを変更"}
							</button>
						</div>

						{showRotatePasscodeForm && (
							<div className="rounded-md bg-muted/30 p-4 border border-border/50 space-y-4 mt-3">
								<p className="text-[12px] text-muted-foreground leading-relaxed">
									パスコード変更後、
									<strong>
										他の家族メンバーおよび別端末では次回新パスコードでのロック解除が必要
									</strong>
									となり、生体認証をご利用の場合は再登録が必要になります。
								</p>
								<form onSubmit={handleChangePasscode} className="space-y-3">
									<div>
										<label
											htmlFor="rotate-current-passcode"
											className="block text-[13px] font-medium text-foreground mb-1"
										>
											現在のパスコード <span className="text-red-500">*</span>
										</label>
										<div className="relative">
											<input
												type={showCurrentPasscode ? "text" : "password"}
												id="rotate-current-passcode"
												required
												autoCapitalize="off"
												autoCorrect="off"
												spellCheck={false}
												value={currentPasscode}
												onChange={(e) => setCurrentPasscode(e.target.value)}
												disabled={isChangingPasscode}
												placeholder="現在のパスコード"
												className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
											/>
											<button
												type="button"
												onClick={() =>
													setShowCurrentPasscode(!showCurrentPasscode)
												}
												className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
											>
												{showCurrentPasscode ? (
													<EyeOff className="h-4 w-4" />
												) : (
													<Eye className="h-4 w-4" />
												)}
											</button>
										</div>
									</div>

									<div>
										<label
											htmlFor="rotate-new-passcode"
											className="block text-[13px] font-medium text-foreground mb-1"
										>
											新しいパスコード（{MIN_PASSCODE_LENGTH}文字以上）{" "}
											<span className="text-red-500">*</span>
										</label>
										<div className="relative">
											<input
												type={showNewPasscode ? "text" : "password"}
												id="rotate-new-passcode"
												required
												minLength={MIN_PASSCODE_LENGTH}
												autoCapitalize="off"
												autoCorrect="off"
												spellCheck={false}
												value={newPasscode}
												onChange={(e) => setNewPasscode(e.target.value)}
												disabled={isChangingPasscode}
												placeholder={`新しいパスコード（${MIN_PASSCODE_LENGTH}文字以上）`}
												className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
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
										{newPasscode && (
											<div className="mt-2">
												<PasscodeStrengthMeter passcode={newPasscode} />
											</div>
										)}
									</div>

									<div>
										<label
											htmlFor="rotate-new-passcode-confirm"
											className="block text-[13px] font-medium text-foreground mb-1"
										>
											新しいパスコード（確認）{" "}
											<span className="text-red-500">*</span>
										</label>
										<div className="relative">
											<input
												type={showNewPasscodeConfirm ? "text" : "password"}
												id="rotate-new-passcode-confirm"
												required
												minLength={MIN_PASSCODE_LENGTH}
												autoCapitalize="off"
												autoCorrect="off"
												spellCheck={false}
												value={newPasscodeConfirm}
												onChange={(e) => setNewPasscodeConfirm(e.target.value)}
												disabled={isChangingPasscode}
												placeholder="新しいパスコード（確認）"
												className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
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

									<div className="pt-2 flex justify-end gap-2">
										<button
											type="button"
											onClick={() => {
												setShowRotatePasscodeForm(false);
												setCurrentPasscode("");
												setNewPasscode("");
												setNewPasscodeConfirm("");
											}}
											className="rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium shadow-sm transition hover:bg-accent text-foreground cursor-pointer"
										>
											キャンセル
										</button>
										<button
											type="submit"
											disabled={
												isChangingPasscode ||
												!currentPasscode ||
												!newPasscode ||
												!newPasscodeConfirm
											}
											className="flex items-center rounded-md bg-foreground px-6 py-2 text-[13px] font-medium text-background shadow-lg transition hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
										>
											{isChangingPasscode ? (
												<>
													<Spinner className="mr-2 h-4 w-4" />
													変更中...
												</>
											) : (
												"パスコードを変更する"
											)}
										</button>
									</div>
								</form>
							</div>
						)}
					</div>

					<div className="mt-8 border-t border-border pt-6 text-center">
						<button
							type="button"
							onClick={() => setIsChangingFamily(true)}
							className="text-[14px] font-medium text-red-500 hover:text-red-600 transition underline underline-offset-4"
						>
							家族グループを変更・脱退する
						</button>
						<p className="mt-2 text-[12px] text-muted-foreground">
							※あなたが所有するパスワードヒントは新しいグループのパスコードで再暗号化され、元の家族からは見られなくなります。
						</p>
					</div>
				</div>
			) : (
				<div className="space-y-6">
					{!family ? (
						<>
							{search.inviteCode && (
								<div className="rounded-lg bg-orange-500/10 p-4 border border-orange-500/30 flex flex-col gap-1.5">
									<span className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
										招待リンクからのアクセス
									</span>
									<p className="text-sm font-medium text-foreground">
										招待コード「
										<code className="font-mono bg-background/80 px-1.5 py-0.5 rounded border">
											{search.inviteCode}
										</code>
										」が自動入力されています。
									</p>
									<p className="text-xs text-muted-foreground">
										「
										<strong>
											{activeAccount?.displayName ||
												activeAccount?.name ||
												"アカウント"}
										</strong>
										」で参加申請します。別のアカウントで参加したい場合は、ヘッダーのアカウント切り替えメニューをご利用ください。
									</p>
								</div>
							)}
							<div className="rounded-lg bg-orange-500/10 p-4 border border-orange-500/20">
								<h2 className="text-[16px] font-semibold text-orange-700 dark:text-orange-400 mb-2">
									はじめに：家族グループの作成・参加
								</h2>
								<p className="text-[14px] text-orange-700/80 dark:text-orange-400/80 leading-relaxed">
									PoohMaは家族間でのアカウント情報の共有を前提としています。
									<br />
									ダッシュボードやその他の機能を利用するには、まず家族グループを作成するか、既存の家族グループに参加してください。
								</p>
							</div>
						</>
					) : (
						<div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20 mb-6">
							<div className="flex justify-between items-start mb-2">
								<h2 className="text-[16px] font-semibold text-red-700 dark:text-red-400">
									家族グループの変更
								</h2>
								<button
									type="button"
									onClick={() => setIsChangingFamily(false)}
									className="text-[14px] px-3 py-1 bg-background rounded-md border shadow-sm text-foreground hover:bg-accent transition"
								>
									キャンセル
								</button>
							</div>
							<p className="text-[14px] text-red-700/80 dark:text-red-400/80 leading-relaxed">
								新しい家族を作成するか、別の家族の招待コードを入力して参加申請を送信してください。
								<br />
								<strong>注意:</strong>{" "}
								あなたが所有するパスワードヒントは、自動的に新しいグループ用に再暗号化されます。現在のパスコードの入力が求められる場合があります。
							</p>
						</div>
					)}

					{/* 操作対象アカウントの明示 */}
					<div className="rounded-lg border border-border bg-card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs">
						<div className="flex items-center gap-2 min-w-0">
							<span className="text-muted-foreground shrink-0">
								操作対象アカウント:
							</span>
							<span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-none">
								{activeAccount?.displayName ||
									activeAccount?.name ||
									"アカウント"}
							</span>
						</div>
						<div className="flex items-center gap-2 ml-auto shrink-0">
							<AccountSwitcher />
						</div>
					</div>

					<div className="grid gap-6 md:grid-cols-2">
						{/* 家族を作成 */}
						<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
							<h2 className="mb-6 text-[18px] font-semibold tracking-geist-ui text-foreground">
								家族グループを作成
							</h2>
							<form
								onSubmit={
									isChangingFamily
										? (e) => handleChangeFamily("create", e)
										: handleCreate
								}
								className="space-y-5"
							>
								<div>
									<label
										htmlFor="family-name-input"
										className="mb-1.5 block text-[14px] font-medium text-foreground"
									>
										グループ名
									</label>
									<input
										type="text"
										id="family-name-input"
										required
										value={createName}
										onChange={(e) => setCreateName(e.target.value)}
										placeholder="例: 田中家"
										className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
									/>
								</div>
								<div>
									<label
										htmlFor="family-passcode-input"
										className="mb-1.5 block text-[14px] font-medium text-foreground"
									>
										パスコード <span className="text-red-500">*</span>
									</label>
									<div className="relative">
										<input
											type={showCreatePasscode ? "text" : "password"}
											id="family-passcode-input"
											required
											minLength={MIN_PASSCODE_LENGTH}
											autoCapitalize="off"
											autoCorrect="off"
											spellCheck={false}
											value={createPasscode}
											onChange={(e) => setCreatePasscode(e.target.value)}
											placeholder={`${MIN_PASSCODE_LENGTH}文字以上`}
											className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
										/>
										<button
											type="button"
											onClick={() => setShowCreatePasscode(!showCreatePasscode)}
											className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
										>
											{showCreatePasscode ? (
												<EyeOff className="h-4 w-4" />
											) : (
												<Eye className="h-4 w-4" />
											)}
										</button>
									</div>
									{createPasscode.length > 0 && (
										<PasscodeStrengthMeter passcode={createPasscode} />
									)}
									<p className="mt-1.5 text-[12px] text-muted-foreground">
										暗号化に使用します。忘れるとヒントを復元できません。
									</p>
								</div>
								<div>
									<label
										htmlFor="family-passcode-confirm-input"
										className="mb-1.5 block text-[14px] font-medium text-foreground"
									>
										パスコード（確認）
									</label>
									<div className="relative">
										<input
											type={showCreatePasscodeConfirm ? "text" : "password"}
											id="family-passcode-confirm-input"
											required
											minLength={8}
											autoCapitalize="off"
											autoCorrect="off"
											spellCheck={false}
											value={createPasscodeConfirm}
											onChange={(e) => setCreatePasscodeConfirm(e.target.value)}
											placeholder="もう一度入力"
											className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
										/>
										<button
											type="button"
											onClick={() =>
												setShowCreatePasscodeConfirm(!showCreatePasscodeConfirm)
											}
											className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
										>
											{showCreatePasscodeConfirm ? (
												<EyeOff className="h-4 w-4" />
											) : (
												<Eye className="h-4 w-4" />
											)}
										</button>
									</div>
								</div>
								<button
									type="submit"
									disabled={isLoading}
									className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 disabled:opacity-50"
								>
									{isLoading ? (
										<>
											<Spinner className="mr-2 h-4 w-4" />
											作成中...
										</>
									) : (
										"作成する"
									)}
								</button>
							</form>
						</div>

						{/* 家族に参加（申請送信） */}
						<div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
							<h2 className="mb-6 text-[18px] font-semibold tracking-geist-ui text-foreground">
								既存の家族に参加
							</h2>
							<form
								onSubmit={
									isChangingFamily
										? (e) => handleChangeFamily("join", e)
										: handleJoin
								}
								className="space-y-5"
							>
								<div>
									<label
										htmlFor="family-join-input"
										className="mb-1.5 block text-[14px] font-medium text-foreground"
									>
										招待コード
									</label>
									<input
										id="family-join-input"
										type="text"
										required
										value={joinCode}
										onChange={(e) => setJoinCode(e.target.value)}
										placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
										className="w-full font-mono rounded-md bg-card p-2.5 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
									/>
									{joinCode.trim().length > 0 && (
										<div className="mt-2 rounded-md bg-muted/40 p-2.5 border border-border text-xs">
											{publicFamilyInfo === undefined ? (
												<div className="flex items-center gap-1.5 text-muted-foreground">
													<Spinner className="h-3 w-3" />
													<span>招待コードを確認中...</span>
												</div>
											) : publicFamilyInfo ? (
												<div className="flex flex-col gap-0.5">
													<div className="flex items-center gap-1.5 font-medium text-green-600 dark:text-green-400">
														<Check className="h-3.5 w-3.5" />
														<span>
															参加先: <strong>{publicFamilyInfo.name}</strong>
														</span>
													</div>
													<div className="text-muted-foreground text-[11px]">
														有効期限:{" "}
														{new Date(
															publicFamilyInfo.expiresAt,
														).toLocaleString("ja-JP")}
													</div>
												</div>
											) : (
												<div className="flex items-center gap-1.5 text-red-500">
													<Ban className="h-3.5 w-3.5" />
													<span>無効または期限切れの招待コードです</span>
												</div>
											)}
										</div>
									)}
								</div>
								<p className="text-[12px] text-muted-foreground leading-relaxed">
									招待コードを入力して参加申請を送信します。家族メンバーの承認後に参加が完了します。
								</p>
								<button
									type="submit"
									disabled={isLoading}
									className="flex items-center justify-center w-full rounded-md bg-foreground px-4 py-2.5 text-[14px] font-medium text-background shadow-border transition hover:bg-foreground/90 disabled:opacity-50"
								>
									{isLoading ? (
										<>
											<Spinner className="mr-2 h-4 w-4" />
											送信中...
										</>
									) : (
										"参加申請を送信"
									)}
								</button>
							</form>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

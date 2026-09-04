import {
	createFileRoute,
	getRouteApi,
	Link,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { Check, Share2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { usePasscode } from "@/components/PasscodeProvider";
import { RecordForm } from "@/components/records/RecordForm";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import { useRecordForm } from "@/hooks/useRecordForm";

export const Route = createFileRoute("/(app)/records/$id")({
	loader: ({ params }) => {
		return { id: params.id as Id<"serviceRecords"> };
	},
	pendingComponent: RecordDetailPending,
	component: RecordDetailWrapper,
});

function RecordDetailPending() {
	useEffect(() => {
		window.scrollTo(0, 0);
	}, []);

	return (
		<div className="mx-auto max-w-3xl p-6">
			<div className="sticky top-16 z-10 -mx-6 -mt-6 mb-6 bg-background/95 px-6 pb-4 pt-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<Skeleton className="h-5 w-32 rounded-md" />
			</div>

			<div className="overflow-hidden rounded-lg bg-card shadow-card">
				{/* OGP ヘッダー */}
				<Skeleton className="relative aspect-video w-full md:aspect-[21/9] rounded-none" />

				{/* 基本情報 */}
				<div className="p-6 md:p-8">
					<div className="mb-6 flex items-start justify-between">
						<Skeleton className="h-8 w-1/2 rounded-md" />
						<Skeleton className="h-6 w-20 rounded-full" />
					</div>

					<div className="mb-8 flex gap-2">
						<Skeleton className="h-6 w-16 rounded-md" />
						<Skeleton className="h-6 w-20 rounded-md" />
					</div>

					<div className="mb-10">
						<Skeleton className="mb-6 h-6 w-32 rounded-md" />
						<div className="grid gap-4 sm:grid-cols-2">
							<Skeleton className="h-40 w-full rounded-md" />
							<Skeleton className="h-40 w-full rounded-md" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

const routeApi = getRouteApi("/(app)/records/$id");

function RecordDetailWrapper() {
	const { id } = routeApi.useLoaderData();
	const { isAuthenticated } = useConvexAuth();
	const { activeAccountId } = useAccount();
	const availableTags = useQuery(
		api.records.getAvailableTags,
		isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
	);
	const record = useQuery(
		api.records.getRecordDetail,
		isAuthenticated ? { id, accountId: activeAccountId || undefined } : "skip",
	);
	const familyMembers = useQuery(
		api.families.getFamilyMembers,
		isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
	);

	if (record === undefined || availableTags === undefined) {
		return <RecordDetailPending />;
	}

	return (
		<RecordDetailComponent
			record={record}
			availableTags={availableTags}
			activeAccountId={activeAccountId}
			familyMembers={familyMembers?.users || []}
		/>
	);
}

function RecordDetailComponent({
	record,
	availableTags,
	activeAccountId,
	familyMembers,
}: {
	record: NonNullable<(typeof api.records.getRecordDetail)["_returnType"]>;
	availableTags: string[];
	activeAccountId?: Id<"users"> | null;
	familyMembers: {
		id: Id<"users">;
		userId: string;
		email?: string;
		displayName?: string;
	}[];
}) {
	const effectiveAccountId = activeAccountId || record.accountId;
	const isOwner =
		(record.ownerType ?? "user") === "user" &&
		record.accountId === effectiveAccountId;
	const isShared = record.ownerType === "family";
	const isAdmin =
		isOwner ||
		(isShared &&
			(record.admins ?? []).includes(effectiveAccountId as Id<"users">));
	const isEditable = isOwner || isShared;

	const navigate = useNavigate();
	const router = useRouter();

	useEffect(() => {
		window.scrollTo(0, 0);
	}, []);

	const [isEditing, setIsEditing] = useState(false);
	const [isNavigating, setIsNavigating] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const [shareSuccess, setShareSuccess] = useState(false);

	// 同時編集管理用ステート
	const [initialUpdatedAt, setInitialUpdatedAt] = useState<number | null>(null);
	const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
	const [pendingPayload, setPendingPayload] = useState<
		Parameters<Parameters<typeof form.submit>[0]>[0] | null
	>(null);

	const form = useRecordForm();

	// 編集セッション情報のリアルタイム購読
	const activeEditors = useQuery(api.records.getActiveEditors, {
		recordId: record._id,
		accountId: activeAccountId || undefined,
	});
	const otherEditors = (activeEditors ?? []).filter(
		(editor) => editor.accountId !== effectiveAccountId,
	);
	const isBeingEditedByOther = otherEditors.length > 0;

	// 編集開始後に他者によって更新されたか判定
	const isRecordStale =
		isEditing &&
		initialUpdatedAt != null &&
		record.updatedAt !== initialUpdatedAt;

	const formatLastActive = (updatedAt: number) => {
		const diffSec = Math.floor((Date.now() - updatedAt) / 1000);
		if (diffSec < 60) return "たった今";
		const diffMin = Math.floor(diffSec / 60);
		return `約${diffMin}分前`;
	};

	const handleWebShare = async () => {
		if (typeof window === "undefined") return;

		const shareData = {
			title: record.title ? `${record.title} - PoohMa` : "PoohMa レコード",
			text: record.title ? `「${record.title}」の共有` : "アカウント情報の共有",
			url: window.location.href,
		};

		if (
			typeof navigator !== "undefined" &&
			navigator.share &&
			navigator.canShare?.(shareData)
		) {
			try {
				await navigator.share(shareData);
				setShareSuccess(true);
				setTimeout(() => setShareSuccess(false), 2000);
			} catch (err) {
				if ((err as Error)?.name !== "AbortError") {
					console.error("シェア処理に失敗しました:", err);
					toast.error("共有に失敗しました");
				}
			}
		} else if (typeof navigator !== "undefined" && navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(window.location.href);
				setCopied(true);
				toast.success("URLをクリップボードにコピーしました");
				setTimeout(() => setCopied(false), 2000);
			} catch (err) {
				console.error("クリップボードコピーに失敗しました:", err);
				toast.error("URLのコピーに失敗しました");
			}
		}
	};

	const getOgpInfo = useAction(api.actions.getOgpInfo);
	const updateRecord = useMutation(api.records.updateRecord);
	const deleteRecord = useMutation(api.records.deleteRecord);
	const shareRecord = useMutation(api.records.shareRecord);
	const startEditingSession = useMutation(api.records.startEditingSession);
	const heartbeatEditingSession = useMutation(
		api.records.heartbeatEditingSession,
	);
	const endEditingSession = useMutation(api.records.endEditingSession);

	const { decryptHint, requireUnlock } = usePasscode();

	// 編集モード中の定期ハートビートと復帰（visibilitychange）対応
	useEffect(() => {
		if (!isEditing) return;

		// 30秒ごとの定期ハートビート
		const intervalId = setInterval(() => {
			heartbeatEditingSession({
				recordId: record._id,
				accountId: activeAccountId || undefined,
			}).catch((e) => {
				console.error("Heartbeat failed:", e);
			});
		}, 30_000);

		// タブ・アプリ復帰（visibilitychange: visible）時の即時ハートビート
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				heartbeatEditingSession({
					recordId: record._id,
					accountId: activeAccountId || undefined,
				}).catch((e) => {
					console.error("Heartbeat on visible failed:", e);
				});
			}
		};

		// ページ離脱時のセッション破棄試行
		const handlePageHide = () => {
			endEditingSession({
				recordId: record._id,
				accountId: activeAccountId || undefined,
			}).catch(() => {});
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("pagehide", handlePageHide);

		return () => {
			clearInterval(intervalId);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("pagehide", handlePageHide);
			endEditingSession({
				recordId: record._id,
				accountId: activeAccountId || undefined,
			}).catch(() => {});
		};
	}, [
		isEditing,
		record._id,
		activeAccountId,
		heartbeatEditingSession,
		endEditingSession,
	]);

	const handleEditStart = async () => {
		const hasEncryptedHints = record.credentials.some(
			(c) => c.passwordHint && c.passwordHintIv,
		);

		let credentials: {
			id?: string;
			label: string;
			loginId: string;
			passwordHint: string;
		}[];

		if (hasEncryptedHints) {
			const unlocked = await requireUnlock();
			if (!unlocked) return; // user cancelled or failed

			credentials = await Promise.all(
				record.credentials.map(async (c) => {
					if (c.passwordHint && c.passwordHintIv) {
						try {
							const plain = await decryptHint(
								c.passwordHint,
								c.passwordHintIv,
								c.passwordHintDekEncrypted,
								c.passwordHintDekIv,
							);
							return {
								id: c.id,
								label: c.label || "",
								loginId: c.loginId || "",
								passwordHint: plain,
							};
						} catch (e) {
							console.error("Failed to decrypt on edit start", e);
							return {
								id: c.id,
								label: c.label || "",
								loginId: c.loginId || "",
								passwordHint: "",
							};
						}
					}
					return {
						id: c.id,
						label: c.label || "",
						loginId: c.loginId || "",
						passwordHint: c.passwordHint || "",
					};
				}),
			);
		} else {
			credentials = record.credentials.map((c) => ({
				id: c.id,
				label: c.label || "",
				loginId: c.loginId || "",
				passwordHint: c.passwordHint || "",
			}));
		}

		form.reset({
			title: record.title,
			titleReading: record.titleReading || "",
			url: record.url || "",
			ogpImage: record.ogpImage || "",
			ogpDescription: record.ogpDescription || "",
			tags: record.tags,
			memo: record.memo || "",
			ownerType: record.ownerType ?? "user",
			credentials,
		});

		setInitialUpdatedAt(record.updatedAt);
		setIsEditing(true);

		try {
			await startEditingSession({
				recordId: record._id,
				accountId: activeAccountId || undefined,
			});
		} catch (e) {
			console.error("Failed to start editing session:", e);
		}
	};

	const handleEditCancel = async () => {
		setIsEditing(false);
		setInitialUpdatedAt(null);
		setPendingPayload(null);
		try {
			await endEditingSession({
				recordId: record._id,
				accountId: activeAccountId || undefined,
			});
		} catch (e) {
			console.error("Failed to end editing session:", e);
		}
	};

	const handleEditSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		let conflictDetected = false;
		const succeeded = await form.submit(async (payload) => {
			try {
				await updateRecord({
					accountId: activeAccountId || undefined,
					id: record._id,
					updatedAt: initialUpdatedAt ?? record.updatedAt,
					data: payload,
				});
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				if (message.includes("CONFLICT")) {
					conflictDetected = true;
					setPendingPayload(payload);
					setConflictDialogOpen(true);
					throw new Error("他のユーザーによる更新と競合しました");
				}
				throw err;
			}
		});
		if (succeeded) {
			toast.success("レコードを更新しました");
			setInitialUpdatedAt(null);
			setPendingPayload(null);
			await router.invalidate();
			setIsEditing(false);
		} else if (conflictDetected) {
			// 競合ダイアログが表示されるため、トースト通知は不要
		}
	};

	// 競合解決: 最新の内容を再読み込み
	const handleResolveReload = async () => {
		setConflictDialogOpen(false);
		setPendingPayload(null);
		setInitialUpdatedAt(null);
		setIsEditing(false);
		await router.invalidate();
		toast.info("最新のレコード情報を再読み込みしました");
	};

	// 競合解決: 強制上書き保存
	const handleResolveForceSave = async () => {
		if (!pendingPayload) return;
		setIsLoading(true);
		try {
			await updateRecord({
				accountId: activeAccountId || undefined,
				id: record._id,
				force: true,
				data: pendingPayload,
			});
			toast.success("レコードを上書き保存しました");
			setConflictDialogOpen(false);
			setPendingPayload(null);
			setInitialUpdatedAt(null);
			await router.invalidate();
			setIsEditing(false);
		} catch (err) {
			console.error("強制上書き保存に失敗しました:", err);
			toast.error("保存に失敗しました");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDelete = async () => {
		setIsLoading(true);

		try {
			await deleteRecord({
				accountId: activeAccountId || undefined,
				id: record._id,
			});
			toast.success("レコードを削除しました");
			await navigate({ to: "/dashboard" });
		} catch (error) {
			console.error("削除エラー:", error);
			toast.error("削除に失敗しました");
		} finally {
			setIsLoading(false);
		}
	};

	if (isEditing) {
		return (
			<div className="mx-auto max-w-3xl p-6">
				<h1 className="mb-4 text-[24px] font-semibold tracking-geist-h2 text-foreground">
					サービス情報を編集
				</h1>

				{/* 編集中に他者が同時編集している場合の警告 */}
				{isBeingEditedByOther && (
					<div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2 shadow-sm">
						<span className="text-base leading-none">⚠️</span>
						<div>
							<span className="font-semibold">同時編集中:</span>{" "}
							{otherEditors
								.map(
									(e) =>
										`${e.displayName || e.email || "メンバー"} (${formatLastActive(e.updatedAt)})`,
								)
								.join("、 ")}{" "}
							もこのレコードを編集中です。保存時の競合にご注意ください。
						</div>
					</div>
				)}

				{/* 編集開始後に他者によって内容が更新された場合の警告 */}
				{isRecordStale && (
					<div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2 shadow-sm">
						<span className="text-base leading-none">⚠️</span>
						<div>
							<span className="font-semibold">内容が更新されました:</span>{" "}
							編集を開始した後に、他のメンバーによってこのレコードが更新されました。このまま保存すると競合が発生します。
						</div>
					</div>
				)}

				<RecordForm
					form={form}
					availableTags={availableTags}
					onSubmit={handleEditSubmit}
					onCancel={handleEditCancel}
					submitIdleLabel="保存する"
					isAdmin={isAdmin}
				/>

				{/* 競合発生時の解決ダイアログ */}
				<AlertDialog
					open={conflictDialogOpen}
					onOpenChange={setConflictDialogOpen}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>編集の競合が発生しました</AlertDialogTitle>
							<AlertDialogDescription className="space-y-2 text-sm text-muted-foreground">
								<p>
									あなたが編集中に、他の家族メンバーによってこのレコードが更新されました。
								</p>
								<p>
									現在の変更内容で上書き保存するか、最新の内容を再読み込みするかを選択してください。
								</p>
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter className="flex-col sm:flex-row gap-2">
							<AlertDialogCancel onClick={handleResolveReload} className="mt-0">
								最新の内容を読み込む
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={handleResolveForceSave}
								disabled={isLoading}
								className="bg-orange-500 hover:bg-orange-600 focus:ring-orange-500"
							>
								{isLoading ? <Spinner className="h-4 w-4 mr-1.5" /> : null}
								上書き保存する
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-3xl p-6">
			{/* ヘッダーナビゲーション（戻るボタン & 共有ボタン） */}
			<div className="sticky top-16 z-10 -mx-6 -mt-6 mb-6 bg-background/95 px-6 pb-4 pt-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-4 border-b border-border/40">
				<button
					type="button"
					disabled={isNavigating}
					onClick={() => {
						setIsNavigating(true);
						if (window.history.length > 2) {
							window.history.back();
						} else {
							router.navigate({ to: "/dashboard" });
						}
					}}
					className="text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
				>
					<span className="text-[16px] leading-none mb-0.5">←</span>{" "}
					ダッシュボードに戻る
				</button>

				<button
					type="button"
					onClick={handleWebShare}
					className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground shadow-sm cursor-pointer"
				>
					{shareSuccess || copied ? (
						<Check className="h-3.5 w-3.5 text-green-500" />
					) : (
						<Share2 className="h-3.5 w-3.5" />
					)}
					<span>
						{copied
							? "URLをコピーしました"
							: shareSuccess
								? "共有しました"
								: "ページを共有"}
					</span>
				</button>
			</div>

			{/* 閲覧中に他メンバーが編集中である場合の警告バナー */}
			{isBeingEditedByOther && (
				<div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-800 dark:text-amber-300 flex items-start gap-3 shadow-sm">
					<span className="text-lg leading-none mt-0.5">⚠️</span>
					<div className="flex-1">
						<p className="font-semibold">家族メンバーが編集中です</p>
						<p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
							{otherEditors
								.map(
									(e) =>
										`${e.displayName || e.email || "メンバー"} (${formatLastActive(e.updatedAt)})`,
								)
								.join("、 ")}{" "}
							が現在このレコードを編集しています。編集を開始する場合や更新時は競合にご注意ください。
						</p>
					</div>
				</div>
			)}

			<div className="overflow-hidden rounded-lg bg-card shadow-card">
				{/* OGP ヘッダー */}
				<div className="relative aspect-video w-full bg-muted md:aspect-[21/9]">
					{record.ogpImage ? (
						<img
							src={record.ogpImage}
							alt={record.title}
							className="h-full w-full object-cover"
						/>
					) : (
						<div className="flex h-full items-center justify-center text-4xl font-bold text-muted-foreground/30">
							{record.title.slice(0, 1)}
						</div>
					)}
					{/* URLリンクがあればオーバーレイ */}
					{record.url && (
						<div className="absolute bottom-4 right-4 flex gap-2">
							<button
								type="button"
								onClick={async () => {
									if (!record.url) return;
									setIsLoading(true);
									try {
										const ogp = await getOgpInfo({ url: record.url });
										await updateRecord({
											id: record._id,
											accountId: activeAccountId || undefined,
											updatedAt: record.updatedAt,
											data: {
												title: record.title,
												url: record.url,
												ogpImage: ogp.image || undefined,
												ogpDescription: ogp.description || undefined,
												memo: record.memo || undefined,
												ownerType: record.ownerType,
												credentials: record.credentials.map((c) => ({
													id: c.id,
													label: c.label || "",
													loginId: c.loginId || "",
													passwordHint: c.passwordHint || "",
													passwordHintIv: c.passwordHintIv || undefined,
													passwordHintDekEncrypted:
														c.passwordHintDekEncrypted || undefined,
													passwordHintDekIv: c.passwordHintDekIv || undefined,
												})),
												tags: record.tags,
											},
										});
										toast.success("OGP情報を更新しました");
										await router.invalidate();
									} catch (e: unknown) {
										console.error(e);
										const msg = e instanceof Error ? e.message : "";
										if (msg.includes("CONFLICT")) {
											toast.error(
												"他のユーザーによる更新と競合したためOGPを更新できませんでした",
											);
										} else {
											toast.error("OGP情報の更新に失敗しました");
										}
									} finally {
										setIsLoading(false);
									}
								}}
								disabled={isLoading}
								className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/80 transition flex items-center gap-2 disabled:opacity-50"
							>
								{isLoading ? <Spinner className="h-4 w-4" /> : "↻"}
								OGP更新
							</button>
							<a
								href={record.url}
								target="_blank"
								rel="noopener noreferrer"
								className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/80 transition"
							>
								サイトを開く ↗
							</a>
						</div>
					)}
				</div>

				{/* 基本情報 */}
				<div className="p-6 md:p-8">
					<div className="mb-6 flex flex-wrap items-center justify-between gap-3">
						<h1 className="text-[24px] font-semibold tracking-geist-h2 text-foreground">
							{record.title}
						</h1>
						<div className="flex items-center gap-2">
							<span
								className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium tracking-wide ${
									isShared
										? "bg-blue-100/50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
										: "bg-secondary text-muted-foreground"
								}`}
							>
								{isShared
									? `共有中${
											(
												record.adminUsers
													? record.adminUsers.length
													: (record.admins?.length ?? 0)
											) > 0
												? ` (${record.adminUsers ? record.adminUsers.length : record.admins?.length}名管理)`
												: ""
										}`
									: "自分のみ"}
							</span>

							{/* ワンタップ共有ボタン (個人所有者の場合) */}
							{isOwner && !isShared && (
								<button
									type="button"
									disabled={isLoading}
									onClick={async () => {
										setIsLoading(true);
										try {
											await shareRecord({
												id: record._id,
												accountId: activeAccountId || undefined,
											});
											toast.success("家族と共有しました");
											await router.invalidate();
										} catch (e) {
											console.error(e);
											toast.error("共有に失敗しました");
										} finally {
											setIsLoading(false);
										}
									}}
									className="rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 px-3 py-1 text-[12px] font-medium transition flex items-center gap-1 cursor-pointer"
								>
									<Share2 className="h-3 w-3" />
									家族と共有する
								</button>
							)}

							{/* 共有設定ボタン (共有レコードの場合) */}
							{isShared && (
								<ShareSettingsDialog
									record={record}
									familyMembers={familyMembers}
									activeAccountId={activeAccountId}
									isAdmin={isAdmin}
									onRecordUpdated={async () => {
										await router.invalidate();
									}}
								/>
							)}
						</div>
					</div>

					{/* オーナー情報 */}
					{record.user?.displayName && (
						<div className="mb-6 flex items-center gap-2 text-[13px] text-muted-foreground">
							<span className="font-medium">作成者:</span>
							<span>
								{record.user.displayName} ({record.user.email})
							</span>
						</div>
					)}

					{/* タグ */}
					{record.tags.length > 0 && (
						<div className="mb-8 flex flex-wrap gap-2">
							{record.tags.map((tag) => (
								<Link
									key={tag}
									to="/dashboard"
									search={{ tag }}
									className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-muted-foreground shadow-sm hover:bg-orange-500 hover:text-white transition"
								>
									#{tag}
								</Link>
							))}
						</div>
					)}

					{/* アカウント情報（ID / ヒント） */}
					<div className="mb-10">
						<h2 className="mb-6 text-[18px] font-semibold text-foreground tracking-geist-ui border-b border-border pb-2">
							アカウント情報
						</h2>
						{record.credentials.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								登録された情報はありません。
							</p>
						) : (
							<div className="grid gap-4 sm:grid-cols-2">
								{record.credentials.map((cred) => (
									<CredentialCard key={cred.id} cred={cred} />
								))}
							</div>
						)}
					</div>

					{/* メモ */}
					{record.memo && (
						<div className="mb-10">
							<h2 className="mb-4 text-[14px] font-semibold text-foreground tracking-wide uppercase">
								メモ
							</h2>
							<div className="rounded-md bg-muted/50 p-4 text-[14px] text-muted-foreground whitespace-pre-wrap shadow-border-light">
								{record.memo}
							</div>
						</div>
					)}

					{/* アクションボタン (編集権限がある場合のみ) */}
					{isEditable && (
						<div className="mt-10 flex justify-end gap-4 border-t border-border pt-6">
							{isAdmin && (
								<AlertDialog>
									<AlertDialogTrigger asChild>
										<button
											type="button"
											className="rounded-md px-6 py-2 text-[14px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
										>
											削除する
										</button>
									</AlertDialogTrigger>
									<AlertDialogContent>
										<AlertDialogHeader>
											<AlertDialogTitle>
												レコードを削除しますか？
											</AlertDialogTitle>
											<AlertDialogDescription>
												この操作は取り消せません。本当に削除してもよろしいですか？
											</AlertDialogDescription>
										</AlertDialogHeader>
										<AlertDialogFooter>
											<AlertDialogCancel>キャンセル</AlertDialogCancel>
											<AlertDialogAction
												onClick={handleDelete}
												className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
											>
												削除する
											</AlertDialogAction>
										</AlertDialogFooter>
									</AlertDialogContent>
								</AlertDialog>
							)}
							<button
								type="button"
								onClick={handleEditStart}
								className="rounded-md bg-foreground px-6 py-2 text-[14px] font-medium text-background hover:bg-foreground/90 transition"
							>
								編集する
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ShareSettingsDialog({
	record,
	familyMembers,
	activeAccountId,
	isAdmin,
	onRecordUpdated,
}: {
	record: Doc<"serviceRecords"> & {
		adminUsers?: { _id: Id<"users">; displayName?: string; email?: string }[];
	};
	familyMembers: {
		id: Id<"users">;
		userId: string;
		email?: string;
		displayName?: string;
	}[];
	activeAccountId?: Id<"users"> | null;
	isAdmin: boolean;
	onRecordUpdated: () => Promise<void>;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [selectedMemberId, setSelectedMemberId] = useState<string>("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const addRecordAdmin = useMutation(api.records.addRecordAdmin);
	const removeRecordAdmin = useMutation(api.records.removeRecordAdmin);
	const unshareRecord = useMutation(api.records.unshareRecord);

	// 有効な管理者一覧の特定（adminUsers を優先し、未設定時は familyMembers から解決できるものだけに限定）
	const activeAdminUsers =
		record.adminUsers ??
		(record.admins ?? [])
			.map((id) => familyMembers.find((f) => f.id === id))
			.filter((m): m is NonNullable<typeof m> => m != null)
			.map((m) => ({
				_id: m.id,
				displayName: m.displayName,
				email: m.email,
			}));
	const activeAdminIds = activeAdminUsers.map((a) => a._id);
	const nonAdminMembers = familyMembers.filter(
		(m) => !activeAdminIds.includes(m.id),
	);

	const handleAddAdmin = async () => {
		if (!selectedMemberId) return;
		setIsSubmitting(true);
		try {
			await addRecordAdmin({
				id: record._id,
				targetAccountId: selectedMemberId as Id<"users">,
				accountId: activeAccountId || undefined,
			});
			toast.success("管理者を設定しました");
			setSelectedMemberId("");
			await onRecordUpdated();
		} catch (e) {
			console.error(e);
			toast.error("管理者の追加に失敗しました");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleRemoveAdmin = async (targetId: Id<"users">) => {
		setIsSubmitting(true);
		try {
			await removeRecordAdmin({
				id: record._id,
				targetAccountId: targetId,
				accountId: activeAccountId || undefined,
			});
			toast.success("管理者を解除しました");
			await onRecordUpdated();
		} catch (e: unknown) {
			console.error(e);
			const raw = e instanceof Error ? e.message : "";
			toast.error(
				raw.includes("管理者が0人になるため削除できません")
					? "管理者が0人になるため削除できません"
					: "管理者の解除に失敗しました",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleUnshare = async () => {
		setIsSubmitting(true);
		try {
			await unshareRecord({
				id: record._id,
				accountId: activeAccountId || undefined,
			});
			toast.success("共有を解除し、個人用レコードにしました");
			setIsOpen(false);
			await onRecordUpdated();
		} catch (e) {
			console.error(e);
			toast.error("共有解除に失敗しました");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<button
					type="button"
					className="rounded-full bg-secondary hover:bg-accent text-foreground px-3 py-1 text-[12px] font-medium transition flex items-center gap-1 cursor-pointer"
				>
					<Users className="h-3 w-3" />
					共有設定
				</button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isAdmin ? "共有と管理者の設定" : "共有設定"}
					</DialogTitle>
					<DialogDescription>
						{isAdmin
							? "家族共有レコードの管理者権限の追加・削除や共有の解除を行えます。"
							: "家族共有レコードの管理者および共有メンバーを確認できます。"}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6 py-2">
					{/* 管理者一覧 */}
					<div>
						<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
							現在の管理者 ({activeAdminUsers.length}名)
						</h3>
						<div className="space-y-2 max-h-40 overflow-y-auto">
							{activeAdminUsers.map((admin) => (
								<div
									key={admin._id}
									className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm"
								>
									<div>
										<div className="font-medium text-foreground">
											{admin.displayName || "メンバー"}
											{admin._id === activeAccountId && " (あなた)"}
										</div>
										{admin.email && (
											<div className="text-xs text-muted-foreground">
												{admin.email}
											</div>
										)}
									</div>
									{isAdmin && activeAdminUsers.length > 1 && (
										<button
											type="button"
											disabled={isSubmitting}
											onClick={() => handleRemoveAdmin(admin._id)}
											className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 p-1 cursor-pointer"
											title="管理者から外す"
										>
											解除
										</button>
									)}
								</div>
							))}
						</div>
					</div>

					{/* 共有メンバー一覧 */}
					<div className="border-t border-border pt-4">
						<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
							共有メンバー ({familyMembers.length}名)
						</h3>
						<div className="space-y-2 max-h-40 overflow-y-auto">
							{familyMembers.map((member) => {
								const isMemberAdmin = activeAdminIds.includes(member.id);
								return (
									<div
										key={member.id}
										className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm"
									>
										<div>
											<div className="font-medium text-foreground">
												{member.displayName || "メンバー"}
												{member.id === activeAccountId && " (あなた)"}
											</div>
											{member.email && (
												<div className="text-xs text-muted-foreground">
													{member.email}
												</div>
											)}
										</div>
										{isMemberAdmin && (
											<span className="rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0.5 font-medium">
												管理者
											</span>
										)}
									</div>
								);
							})}
						</div>
					</div>

					{/* 管理者を追加 (管理者のみ) */}
					{isAdmin && nonAdminMembers.length > 0 && (
						<div className="border-t border-border pt-4">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
								管理者の追加
							</h3>
							<div className="flex gap-2">
								<select
									aria-label="管理者に追加する家族メンバー"
									value={selectedMemberId}
									onChange={(e) => setSelectedMemberId(e.target.value)}
									className="flex-1 rounded-md bg-card p-2 text-xs shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
								>
									<option value="">家族メンバーを選択...</option>
									{nonAdminMembers.map((m) => (
										<option key={m.id} value={m.id}>
											{m.displayName || "メンバー"} ({m.email})
										</option>
									))}
								</select>
								<button
									type="button"
									disabled={!selectedMemberId || isSubmitting}
									onClick={handleAddAdmin}
									className="rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-border hover:bg-orange-600 disabled:opacity-50 transition cursor-pointer"
								>
									追加
								</button>
							</div>
						</div>
					)}

					{/* 共有解除 (管理者のみ) */}
					{isAdmin && (
						<div className="border-t border-border pt-4">
							<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
								共有の解除
							</h3>
							<p className="text-xs text-muted-foreground mb-3">
								共有を解除すると、このレコードはあなたの個人用（自分のみ）になり、他の家族メンバーは閲覧できなくなります。
							</p>
							<button
								type="button"
								disabled={isSubmitting}
								onClick={handleUnshare}
								className="w-full rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50 transition cursor-pointer"
							>
								共有を解除して個人用にする
							</button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// E2EE対応: 暗号化されたヒントの復号表示カード
function CredentialCard({
	cred,
}: {
	cred: {
		id: string;
		label?: string;
		loginId?: string;
		passwordHint?: string;
		passwordHintIv?: string;
		passwordHintDekEncrypted?: string;
		passwordHintDekIv?: string;
	};
}) {
	const { decryptHint, requireUnlock, masterKey } = usePasscode();
	const [decryptedHint, setDecryptedHint] = useState<string | null>(null);
	const [isDecrypting, setIsDecrypting] = useState(false);

	useEffect(() => {
		if (masterKey == null) {
			setDecryptedHint(null);
		}
	}, [masterKey]);

	const isEncrypted = !!cred.passwordHintIv && !!cred.passwordHint;

	const handleReveal = async () => {
		if (!isEncrypted || !cred.passwordHint || !cred.passwordHintIv) return;
		setIsDecrypting(true);
		try {
			const unlocked = await requireUnlock();
			if (!unlocked) return; // user cancelled or failed

			const plaintext = await decryptHint(
				cred.passwordHint,
				cred.passwordHintIv,
				cred.passwordHintDekEncrypted,
				cred.passwordHintDekIv,
			);
			setDecryptedHint(plaintext);
		} catch (error) {
			console.error("Decrypt failed:", error);
			toast.error("復号に失敗しました");
		} finally {
			setIsDecrypting(false);
		}
	};

	const displayedHint = isEncrypted ? decryptedHint : cred.passwordHint;

	return (
		<div className="rounded-md bg-muted/50 p-5 shadow-border-light relative">
			{cred.label && (
				<div className="mb-2 text-xs font-bold text-orange-600">
					{cred.label}
				</div>
			)}
			<div className="mb-4">
				<div className="flex items-center justify-between mb-1">
					<div className="text-xs text-muted-foreground">ログインID</div>
					{cred.loginId && (
						<CopyButton text={cred.loginId} label="ログインID" />
					)}
				</div>
				<div className="font-mono text-sm text-foreground select-all">
					{cred.loginId || "-"}
				</div>
			</div>
			<div>
				<div className="flex items-center justify-between mb-1">
					<div className="text-xs text-muted-foreground">パスワードヒント</div>
					{displayedHint && (
						<CopyButton text={displayedHint} label="パスワードヒント" />
					)}
				</div>
				<div className="font-sans text-sm text-foreground whitespace-pre-wrap">
					{displayedHint ? (
						displayedHint
					) : isEncrypted ? (
						<button
							type="button"
							onClick={handleReveal}
							disabled={isDecrypting}
							className="inline-flex items-center gap-1.5 rounded bg-orange-300/10 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-500/20 transition disabled:opacity-50"
						>
							{isDecrypting ? (
								<>
									<Spinner className="h-3 w-3" />
									復号中...
								</>
							) : (
								"🔒 クリックして表示"
							)}
						</button>
					) : (
						"-"
					)}
				</div>
			</div>
		</div>
	);
}

function CopyButton({ text, label }: { text: string; label: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			toast.success(`${label}をコピーしました`);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("コピーに失敗しました");
		}
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="text-[11px] text-muted-foreground hover:text-foreground transition"
		>
			{copied ? (
				<>
					<span aria-hidden="true" className="text-green-500">
						✓
					</span>
					<span className="ml-1 text-green-600">コピー済</span>
				</>
			) : (
				<span>コピー</span>
			)}
		</button>
	);
}

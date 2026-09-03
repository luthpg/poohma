import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { useConvex, useMutation } from "convex/react";
import { signOut } from "firebase/auth";
import {
	BookOpen,
	Download,
	Gavel,
	HelpCircle,
	Laptop,
	LogOut,
	Moon,
	ScrollText,
	Sun,
	Upload,
	UserCog,
	Users,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { usePasscode } from "@/components/PasscodeProvider";
import { useTheme } from "@/components/theme-provider";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useExportCsv } from "@/hooks/use-export-csv";
import { useAccount } from "@/hooks/useAccount";
import { LOGOUT_FLAG_KEY } from "@/hooks/useConvexFirebaseAuth";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import { logout } from "@/services/auth.functions";
import { processInChunks } from "@/utils/chunk-processor";
import { auth } from "@/utils/firebase";

export function UserMenu({
	user,
}: {
	user: {
		displayName?: string | null;
		email?: string | null;
		photoURL?: string | null;
	};
}) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const convex = useConvex();
	const { activeAccount, activeAccountId } = useAccount();
	const importRecordsMut = useMutation(api.records.importRecords);
	const { theme, setTheme } = useTheme();
	const [isImporting, setIsImporting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { masterKey, requireUnlock, encryptHint } = usePasscode();
	const { handleExport, isExporting } = useExportCsv();
	const [isSheetOpen, setIsSheetOpen] = useState(false);

	const displayName =
		activeAccount?.displayName || user?.displayName || "ユーザー";
	const photoURL = activeAccount?.photoURL || user?.photoURL || undefined;
	const email = activeAccount?.email || user?.email || "";

	const handleLogout = async () => {
		try {
			try {
				localStorage.setItem(LOGOUT_FLAG_KEY, String(Date.now()));
			} catch (e) {
				console.warn("Failed to set logout flag in localStorage", e);
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

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;

		const toastId = toast.loading("CSVを解析中...");
		setIsImporting(true);
		const Papa = (await import("papaparse")).default;
		Papa.parse(file, {
			header: true,
			skipEmptyLines: true,
			complete: async (results) => {
				try {
					toast.loading("データを処理中...", { id: toastId });
					const data = results.data as Record<string, string>[];

					if (data.length > 500) {
						toast.error(
							"一度にインポートできるデータは最大500行までです。ファイルを分割して再度お試しください。",
							{ id: toastId, duration: 8000 },
						);
						setIsImporting(false);
						if (fileInputRef.current) fileInputRef.current.value = "";
						return;
					}

					// --- 早期バリデーション (Fail Fast) ---
					const isOversized = data.some((row) =>
						Object.values(row).some((val) => val && val.length > 10000),
					);
					if (isOversized) {
						toast.error(
							"文字数が上限（10,000文字）を超えているフィールドが含まれています。",
							{ id: toastId, duration: 8000 },
						);
						setIsImporting(false);
						if (fileInputRef.current) fileInputRef.current.value = "";
						return;
					}

					let hasHintsToEncrypt = false;
					for (const row of data) {
						for (let i = 1; i <= 10; i++) {
							if (row[`PasswordHint${i}`]) {
								hasHintsToEncrypt = true;
								break;
							}
						}
						if (hasHintsToEncrypt) break;
					}

					if (hasHintsToEncrypt && !masterKey) {
						const unlocked = await requireUnlock();
						if (!unlocked) {
							setIsImporting(false);
							if (fileInputRef.current) fileInputRef.current.value = "";
							return;
						}
					}

					const encryptedData = await processInChunks(
						data,
						async (row) => {
							const newRow = { ...row };

							// OGP情報を取得（既に画像や説明がある場合はスキップ）
							if (newRow.URL && !newRow.ogpImage && !newRow.ogpDescription) {
								try {
									const ogp = await convex.action(api.actions.getOgpInfo, {
										url: newRow.URL,
									});
									if (ogp.image) newRow.ogpImage = ogp.image;
									if (ogp.description) newRow.ogpDescription = ogp.description;
									if (ogp.title && !newRow.Title) newRow.Title = ogp.title;
								} catch (e) {
									console.error(`Failed to fetch OGP for ${newRow.URL}`, e);
								}
							}

							// ルビ情報の取得（Titleがあり、かつ未設定の場合）
							if (newRow.Title && !newRow.titleReading) {
								try {
									const reading = await convex.action(api.actions.getFurigana, {
										text: newRow.Title,
									});
									if (reading && reading !== newRow.Title) {
										newRow.titleReading = reading;
									}
								} catch (e) {
									console.error(
										`Failed to fetch furigana for ${newRow.Title}`,
										e,
									);
								}
							}

							for (let i = 1; i <= 10; i++) {
								const hint = newRow[`PasswordHint${i}`];
								if (hint) {
									const { encrypted, iv, dekEncrypted, dekIv } =
										await encryptHint(hint);
									newRow[`PasswordHint${i}`] = encrypted;
									newRow[`PasswordHintIv${i}`] = iv;
									newRow[`PasswordHintDekEncrypted${i}`] = dekEncrypted;
									newRow[`PasswordHintDekIv${i}`] = dekIv;
								}
							}
							return newRow;
						},
						10, // 10件ごとにスレッドを解放
						(current, total) => {
							toast.loading(`データを処理中... (${current}/${total})`, {
								id: toastId,
							});
						},
					);

					const recordsToImport = encryptedData.map((row) => {
						const credentials = [];
						for (let i = 1; i <= 10; i++) {
							const label = row[`Label${i}`];
							const loginId = row[`LoginID${i}`];
							const passwordHint = row[`PasswordHint${i}`];
							const passwordHintIv = row[`PasswordHintIv${i}`];
							const passwordHintDekEncrypted =
								row[`PasswordHintDekEncrypted${i}`];
							const passwordHintDekIv = row[`PasswordHintDekIv${i}`];
							if (label || loginId || passwordHint) {
								credentials.push({
									id: crypto.randomUUID(),
									label: String(label || "") || undefined,
									loginId: String(loginId || "") || undefined,
									passwordHint: String(passwordHint || "") || undefined,
									passwordHintIv: passwordHintIv
										? String(passwordHintIv)
										: undefined,
									passwordHintDekEncrypted: passwordHintDekEncrypted
										? String(passwordHintDekEncrypted)
										: undefined,
									passwordHintDekIv: passwordHintDekIv
										? String(passwordHintDekIv)
										: undefined,
								});
							}
						}
						const tags =
							typeof row.Tags === "string"
								? row.Tags.split(",")
										.map((t: string) => t.trim())
										.filter(Boolean)
								: [];
						return {
							title: String(row.Title || ""),
							titleReading: row.titleReading
								? String(row.titleReading)
								: undefined,
							url: row.URL ? String(row.URL) : undefined,
							ogpImage: row.ogpImage ? String(row.ogpImage) : undefined,
							ogpDescription: row.ogpDescription
								? String(row.ogpDescription)
								: undefined,
							memo: row.Memo ? String(row.Memo) : undefined,
							ownerType: (row.OwnerType === "family" ? "family" : "user") as
								| "user"
								| "family",
							adminEmails:
								typeof row.Admins === "string" && row.Admins.trim()
									? row.Admins.split(",")
											.map((a: string) => a.trim())
											.filter(Boolean)
									: undefined,
							credentials,
							tags,
						};
					});

					const response = await importRecordsMut({
						accountId: activeAccountId || undefined,
						records: recordsToImport,
					});

					if (response.failures && response.failures.length > 0) {
						toast.error(
							<div className="flex flex-col gap-1">
								<p className="font-semibold">
									{response.successes}件成功、{response.failures.length}件失敗
								</p>
								<ul className="max-h-32 overflow-y-auto text-xs space-y-1 mt-1 opacity-90 list-disc list-inside">
									{response.failures.map((f) => (
										<li key={`failure-${f.row}`}>
											{f.row}行目: {f.reason}
										</li>
									))}
								</ul>
							</div>,
							{ id: toastId, duration: 10000 },
						);
					} else {
						toast.success(
							`${response.successes}件のデータをインポートしました`,
							{ id: toastId },
						);
					}
					await router.invalidate();
				} catch (error) {
					console.error(error);
					toast.error("インポートに失敗しました", { id: toastId });
				} finally {
					setIsImporting(false);
					if (fileInputRef.current) fileInputRef.current.value = "";
				}
			},
		});
	};

	const avatarButton = (
		<button
			type="button"
			className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary shadow-border outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 transition-transform hover:scale-105 active:scale-95 cursor-pointer"
		>
			<Avatar className="h-8 w-8">
				<AvatarImage src={photoURL} alt={displayName} />
				<AvatarFallback className="bg-orange-500 text-white text-[12px] font-semibold">
					{(displayName || email || "U").slice(0, 1).toUpperCase()}
				</AvatarFallback>
			</Avatar>
		</button>
	);

	return (
		<>
			<input
				type="file"
				ref={fileInputRef}
				onChange={handleFileChange}
				accept=".csv"
				className="hidden"
			/>

			{/* --- モバイル用 Bottom Sheet (sm未満) --- */}
			<div className="block sm:hidden">
				<Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
					<SheetTrigger asChild>{avatarButton}</SheetTrigger>
					<SheetContent
						side="bottom"
						className="rounded-t-2xl max-h-[90vh] overflow-y-auto p-6"
					>
						<SheetHeader className="text-left p-0 pb-4 border-b border-border/50">
							<div className="flex items-center gap-3">
								<Avatar className="h-10 w-10">
									<AvatarImage src={photoURL} alt={displayName} />
									<AvatarFallback className="bg-orange-500 text-white text-sm font-semibold">
										{(displayName || email || "U").slice(0, 1).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div>
									<SheetTitle className="text-base font-semibold">
										{displayName}
									</SheetTitle>
									<p className="text-xs text-muted-foreground">{email}</p>
								</div>
							</div>
						</SheetHeader>

						<div className="py-4 space-y-5">
							{/* アカウント・家族管理 */}
							<div className="space-y-1">
								<Link
									to="/settings"
									onClick={() => setIsSheetOpen(false)}
									className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-sm font-medium transition cursor-pointer"
								>
									<UserCog className="h-5 w-5 text-orange-500" />
									<span>アカウント設定</span>
								</Link>
								<Link
									to="/family"
									onClick={() => setIsSheetOpen(false)}
									className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent text-sm font-medium transition cursor-pointer"
								>
									<Users className="h-5 w-5 text-orange-500" />
									<span>家族管理</span>
								</Link>
							</div>

							<div className="h-[1px] bg-border/50" />

							{/* データ管理 */}
							<div className="space-y-2">
								<p className="text-xs font-semibold text-muted-foreground px-1">
									データ管理
								</p>
								<div className="grid grid-cols-2 gap-2">
									<button
										type="button"
										onClick={() => {
											setIsSheetOpen(false);
											handleExport();
										}}
										disabled={isExporting}
										className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border bg-card hover:bg-accent text-xs font-medium transition cursor-pointer"
									>
										{isExporting ? (
											<Spinner className="h-4 w-4" />
										) : (
											<Download className="h-4 w-4 text-blue-500" />
										)}
										<span>
											{isExporting ? "エクスポート中..." : "CSVエクスポート"}
										</span>
									</button>
									<button
										type="button"
										onClick={() => {
											setIsSheetOpen(false);
											fileInputRef.current?.click();
										}}
										disabled={isImporting}
										className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border bg-card hover:bg-accent text-xs font-medium transition cursor-pointer"
									>
										{isImporting ? (
											<Spinner className="h-4 w-4" />
										) : (
											<Upload className="h-4 w-4 text-green-500" />
										)}
										<span>
											{isImporting ? "インポート中..." : "CSVインポート"}
										</span>
									</button>
								</div>
							</div>

							<div className="h-[1px] bg-border/50" />

							{/* テーマ切り替え */}
							<div className="space-y-2">
								<p className="text-xs font-semibold text-muted-foreground px-1">
									テーマ
								</p>
								<div className="grid grid-cols-3 gap-2 bg-muted/50 p-1 rounded-xl">
									<button
										type="button"
										onClick={() => {
											setTheme("light");
											setIsSheetOpen(false);
										}}
										className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition ${
											theme === "light"
												? "bg-card text-foreground shadow-sm font-semibold"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										<Sun className="h-4 w-4 text-amber-500" />
										<span>ライト</span>
									</button>
									<button
										type="button"
										onClick={() => {
											setTheme("dark");
											setIsSheetOpen(false);
										}}
										className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition ${
											theme === "dark"
												? "bg-card text-foreground shadow-sm font-semibold"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										<Moon className="h-4 w-4 text-indigo-400" />
										<span>ダーク</span>
									</button>
									<button
										type="button"
										onClick={() => {
											setTheme("system");
											setIsSheetOpen(false);
										}}
										className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition ${
											theme === "system"
												? "bg-card text-foreground shadow-sm font-semibold"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										<Laptop className="h-4 w-4 text-gray-400" />
										<span>自動</span>
									</button>
								</div>
							</div>

							<div className="h-[1px] bg-border/50" />

							{/* ヘルプ & 規約 */}
							<div className="grid grid-cols-2 gap-1 text-xs">
								<Link
									to="/usage"
									onClick={() => setIsSheetOpen(false)}
									className="flex items-center gap-2 p-2 rounded.md hover:bg-accent text-muted-foreground hover:text-foreground transition"
								>
									<BookOpen className="h-4 w-4" />
									<span>使い方</span>
								</Link>
								<Link
									to="/faq"
									onClick={() => setIsSheetOpen(false)}
									className="flex items-center gap-2 p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition"
								>
									<HelpCircle className="h-4 w-4" />
									<span>FAQ</span>
								</Link>
								<Link
									to="/terms-of-service"
									onClick={() => setIsSheetOpen(false)}
									className="flex items-center gap-2 p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition"
								>
									<Gavel className="h-4 w-4" />
									<span>利用規約</span>
								</Link>
								<Link
									to="/privacy-policy"
									onClick={() => setIsSheetOpen(false)}
									className="flex items-center gap-2 p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition"
								>
									<ScrollText className="h-4 w-4" />
									<span>プライバシー</span>
								</Link>
							</div>

							<div className="h-[1px] bg-border/50" />

							{/* ログアウト */}
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<button
										type="button"
										className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-medium transition cursor-pointer"
									>
										<LogOut className="h-4 w-4" />
										<span>ログアウト</span>
									</button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>ログアウトしますか？</AlertDialogTitle>
										<AlertDialogDescription>
											セッションが終了し、ログイン画面に戻ります。
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>キャンセル</AlertDialogCancel>
										<AlertDialogAction
											onClick={handleLogout}
											className="text-white bg-red-500 hover:bg-red-600 focus:ring-red-500"
										>
											ログアウト
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</SheetContent>
				</Sheet>
			</div>

			{/* --- デスクトップ用 DropdownMenu (sm以上, ネスト全廃フラット構成) --- */}
			<div className="hidden sm:block">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>{avatarButton}</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-60">
						<DropdownMenuLabel className="font-normal">
							<div className="flex flex-col space-y-1">
								<p className="text-sm font-medium leading-none text-foreground">
									{displayName}
								</p>
								<p className="text-xs leading-none text-muted-foreground">
									{email}
								</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<Link to="/settings" className="cursor-pointer">
									<UserCog className="mr-2 h-4 w-4" />
									<span>アカウント設定</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="/family" className="cursor-pointer">
									<Users className="mr-2 h-4 w-4" />
									<span>家族管理</span>
								</Link>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />

						{/* データ管理 (フラット配置) */}
						<DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal py-1">
							データ管理
						</DropdownMenuLabel>
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={handleExport} disabled={isExporting}>
								{isExporting ? (
									<Spinner className="mr-2 h-4 w-4" />
								) : (
									<Download className="mr-2 h-4 w-4 text-blue-500" />
								)}
								<span>
									{isExporting ? "エクスポート中..." : "CSVエクスポート"}
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => fileInputRef.current?.click()}
								disabled={isImporting}
							>
								{isImporting ? (
									<Spinner className="mr-2 h-4 w-4" />
								) : (
									<Upload className="mr-2 h-4 w-4 text-green-500" />
								)}
								<span>{isImporting ? "インポート中..." : "CSVインポート"}</span>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />

						{/* テーマ切り替え (フラット配置) */}
						<DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal py-1">
							テーマ
						</DropdownMenuLabel>
						<DropdownMenuGroup>
							<DropdownMenuItem onClick={() => setTheme("light")}>
								<Sun className="mr-2 h-4 w-4 text-amber-500" />
								<span className={theme === "light" ? "font-semibold" : ""}>
									ライト
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setTheme("dark")}>
								<Moon className="mr-2 h-4 w-4 text-indigo-400" />
								<span className={theme === "dark" ? "font-semibold" : ""}>
									ダーク
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setTheme("system")}>
								<Laptop className="mr-2 h-4 w-4 text-gray-400" />
								<span className={theme === "system" ? "font-semibold" : ""}>
									システム設定
								</span>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />

						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<Link to="/usage" className="cursor-pointer">
									<BookOpen className="mr-2 h-4 w-4" />
									<span>使い方</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="/faq" className="cursor-pointer">
									<HelpCircle className="mr-2 h-4 w-4" />
									<span>FAQ</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="/terms-of-service" className="cursor-pointer">
									<Gavel className="mr-2 h-4 w-4" />
									<span>利用規約</span>
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link to="/privacy-policy" className="cursor-pointer">
									<ScrollText className="mr-2 h-4 w-4" />
									<span>プライバシーポリシー</span>
								</Link>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<DropdownMenuItem
									onSelect={(e) => e.preventDefault()}
									className="text-red-500 focus:text-red-500 cursor-pointer"
								>
									<LogOut className="mr-2 h-4 w-4" />
									<span>ログアウト</span>
								</DropdownMenuItem>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>ログアウトしますか？</AlertDialogTitle>
									<AlertDialogDescription>
										セッションが終了し、ログイン画面に戻ります。
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>キャンセル</AlertDialogCancel>
									<AlertDialogAction
										onClick={handleLogout}
										className="text-white bg-red-500 hover:bg-red-600 focus:ring-red-500"
									>
										ログアウト
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</>
	);
}

import { Check, Plus, Users } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";

interface AccountSwitcherProps {
	className?: string;
}

export function AccountSwitcher({ className = "" }: AccountSwitcherProps) {
	const {
		accounts,
		activeAccount,
		activeAccountId,
		switchAccount,
		createAccount,
		isLoading,
	} = useAccount();

	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [newAccountName, setNewAccountName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleCreateSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = newAccountName.trim();
		if (!trimmed) {
			toast.error("アカウント名を入力してください");
			return;
		}

		try {
			setIsSubmitting(true);
			await createAccount(trimmed);
			setNewAccountName("");
			setIsCreateOpen(false);
		} catch (error) {
			console.error(error);
			toast.error("アカウントの作成に失敗しました");
		} finally {
			setIsSubmitting(false);
		}
	};

	const currentDisplayName = isLoading
		? "読み込み中..."
		: activeAccount?.displayName || activeAccount?.name || "アカウント";
	const currentFamilyName = isLoading
		? "読み込み中..."
		: activeAccount?.family?.name || "ファミリー未所属";

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					className={`flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
				>
					<div className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold text-[10px]">
						{isLoading ? (
							<Spinner className="h-3 w-3 animate-spin" />
						) : (
							currentDisplayName.charAt(0).toUpperCase()
						)}
					</div>
					<div className="flex flex-col items-start text-left max-w-[120px] sm:max-w-[160px]">
						<span className="truncate font-medium text-foreground text-xs leading-tight">
							{currentDisplayName}
						</span>
						<span className="truncate text-[10px] text-muted-foreground leading-tight">
							{currentFamilyName}
						</span>
					</div>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-64 p-1">
					<DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center justify-between">
						<span>アカウント切り替え</span>
						<span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-muted">
							{accounts.length} 件
						</span>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />

					<DropdownMenuGroup className="max-h-60 overflow-y-auto">
						{accounts.map((account) => {
							const isSelected = account._id === activeAccountId;
							const name =
								account.displayName || account.name || "名無しアカウント";
							const familyName = account.family?.name || "未所属";

							return (
								<DropdownMenuItem
									key={account._id}
									onClick={() => switchAccount(account._id)}
									className="flex items-center justify-between px-2 py-2 cursor-pointer rounded-md transition-colors"
								>
									<div className="flex items-center gap-2.5 overflow-hidden">
										<Avatar className="h-6 w-6">
											{account.photoURL && (
												<AvatarImage src={account.photoURL} alt={name} />
											)}
											<AvatarFallback className="text-[10px] bg-muted font-medium">
												{name.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<div className="flex flex-col text-left overflow-hidden">
											<span className="truncate text-xs font-medium text-foreground">
												{name}
											</span>
											<span className="truncate text-[10px] text-muted-foreground flex items-center gap-1">
												<Users className="h-2.5 w-2.5 opacity-70" />
												{familyName}
											</span>
										</div>
									</div>
									{isSelected && (
										<Check className="h-4 w-4 text-orange-500 shrink-0 ml-2" />
									)}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuGroup>

					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => setIsCreateOpen(true)}
						className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-orange-600 dark:text-orange-400 cursor-pointer rounded-md focus:bg-orange-500/10"
					>
						<Plus className="h-4 w-4" />
						<span>新しいアカウントを作成</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* 新規アカウント作成モーダル */}
			<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="text-lg font-bold">
							新しいPoohMaアカウントの作成
						</DialogTitle>
						<DialogDescription className="text-xs text-muted-foreground">
							用途ごとに独立したアカウントとファミリー環境を作成できます。
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
						<div className="space-y-1.5">
							<label
								htmlFor="account-name"
								className="text-xs font-medium text-foreground"
							>
								アカウント表示名
							</label>
							<input
								id="account-name"
								type="text"
								value={newAccountName}
								onChange={(e) => setNewAccountName(e.target.value)}
								placeholder="例: 個人用、仕事用、実家用"
								maxLength={30}
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/20"
								disabled={isSubmitting}
								autoFocus
							/>
						</div>

						<DialogFooter className="gap-2 pt-2">
							<button
								type="button"
								onClick={() => setIsCreateOpen(false)}
								disabled={isSubmitting}
								className="rounded-md border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition"
							>
								キャンセル
							</button>
							<button
								type="submit"
								disabled={isSubmitting || !newAccountName.trim()}
								className="flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 transition disabled:opacity-50"
							>
								{isSubmitting ? (
									<>
										<Spinner className="mr-1.5 h-3.5 w-3.5 text-white" />
										作成中...
									</>
								) : (
									"作成する"
								)}
							</button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

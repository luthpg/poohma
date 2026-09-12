import { Check, Plus, Users } from "lucide-react";
import { useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import { cn } from "@/lib/utils";
import { CreateAccountDialog } from "./CreateAccountDialog";

interface AccountSwitcherProps {
  className?: string;
}

export function AccountSwitcher({ className = "" }: AccountSwitcherProps) {
  const { accounts, activeAccount, activeAccountId, switchAccount, isLoading } =
    useAccount();

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const currentDisplayName = isLoading
    ? "読み込み中..."
    : activeAccount?.displayName || activeAccount?.name || "アカウント";
  const currentFamilyName = isLoading
    ? "読み込み中..."
    : activeAccount?.family?.name || "家族未所属";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            className,
          )}
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
      <CreateAccountDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </>
  );
}

import { useState } from "react";
import { toast } from "sonner";
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

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateAccountDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateAccountDialogProps) {
  const { createAccount } = useAccount();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("アカウント名を入力してください");
      return;
    }
    try {
      setIsSubmitting(true);
      await createAccount(trimmed);
      setName("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error("アカウントの作成に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            新しいPoohMaアカウントの作成
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            用途ごとに独立したアカウントとファミリー環境を作成できます。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label
              htmlFor="create-account-name-input"
              className="text-xs font-medium text-foreground"
            >
              アカウント表示名
            </label>
            <input
              id="create-account-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="家族メンバーに表示される新アカウント名…"
              maxLength={30}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              disabled={isSubmitting}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="rounded-md border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="flex items-center justify-center rounded-md bg-orange-500 px-4 py-2 text-xs font-medium text-white hover:bg-orange-600 transition disabled:opacity-50 cursor-pointer"
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
  );
}

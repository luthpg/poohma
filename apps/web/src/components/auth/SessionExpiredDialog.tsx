import { signInWithRedirect } from "firebase/auth";
import { Check, Copy, LogIn, ShieldAlert } from "lucide-react";
import { useState } from "react";
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
import type { RecordFormValues } from "@/hooks/useRecordForm";
import { formatDraftAsText } from "@/lib/auth-recovery";
import { auth, googleProvider } from "@/utils/firebase";

export interface SessionExpiredDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: RecordFormValues;
}

export function SessionExpiredDialog({
  open,
  onOpenChange,
  values,
}: SessionExpiredDialogProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [copied, setCopied] = useState(false);

  // 入力内容のテキストコピー（手動データ救済フォールバック）
  const handleCopyText = async () => {
    try {
      const text = formatDraftAsText(values);
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("入力内容をクリップボードにコピーしました");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("クリップボードへのコピーに失敗しました");
    }
  };

  // 再ログイン（ログイン後に現在の画面へ復帰）
  const handleLogin = async () => {
    if (!auth || !googleProvider) {
      toast.error("認証サービスを初期化できませんでした");
      return;
    }

    setIsLoggingIn(true);
    try {
      // 復帰用 URL（現在のパス＋検索クエリ）
      const returnUrl = `${window.location.pathname}${window.location.search}`;
      try {
        localStorage.setItem("poohma_login_redirect", returnUrl);
      } catch {}

      await signInWithRedirect(auth, googleProvider);
    } catch {
      setIsLoggingIn(false);
      toast.error("ログイン処理を開始できませんでした");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[460px]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/60">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-semibold text-foreground">
              ログイン期限が切れました
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground pt-1.5 leading-relaxed">
            セキュリティ保護のためログイン有効期限が切れました。
            <br />
            入力中のデータは安全にローカル保護されています。再ログイン後に通常通り再開できます。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted/60 p-3.5 text-xs text-muted-foreground border border-border/50 space-y-1.5">
          <div className="font-medium text-foreground">
            保護対象データ:「{values.title || "名称未設定サービス"}」
          </div>
          <div>
            登録予定のアカウント情報: {values.credentials?.length ?? 0} 件
          </div>
          <p className="text-[11px] text-muted-foreground/90 pt-0.5">
            ※ 念のため入力内容をテキストとして手動コピーしておくことも可能です。
          </p>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2 sm:gap-2.5 pt-2">
          {/* メイン: 再ログインして入力を引き継ぐ */}
          <Button
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium flex items-center justify-center gap-2 h-10"
          >
            {isLoggingIn ? (
              <>
                <Spinner className="h-4 w-4" />
                <span>ログイン画面へ移動中...</span>
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                <span>再ログインして入力を再開する</span>
              </>
            )}
          </Button>

          {/* サブ: 手動テキストコピー */}
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyText}
            className="w-full text-foreground border-border flex items-center justify-center gap-2 h-9 text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  コピー完了
                </span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                <span>念のため入力内容をメモ帳へコピー</span>
              </>
            )}
          </Button>

          {/* 破棄して閉じる */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
          >
            この画面にとどまる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

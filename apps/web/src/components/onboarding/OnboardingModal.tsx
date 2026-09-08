import { Play, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface OnboardingModalProps {
  isOpen: boolean;
  isLoading: boolean;
  onStartTour: () => void;
  onSkip: () => void;
}

export function OnboardingModal({
  isOpen,
  isLoading,
  onStartTour,
  onSkip,
}: OnboardingModalProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isLoading && onSkip()}
    >
      <DialogContent
        className="sm:max-w-md rounded-2xl p-6 sm:p-8 shadow-xl"
        showCloseButton={!isLoading}
      >
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500">
          <Sparkles className="h-7 w-7" />
        </div>

        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground text-center">
            PoohMaへようこそ！
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-center leading-relaxed mt-2">
            PoohMaは、大切なパスワードヒントを端末上で安全に守り、家族とだけ共有できるアプリです。
            <br />
            まずはサンプルデータを使って、安心の仕組みを体験してみませんか？
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 rounded-xl bg-muted/40 p-3.5 border border-border/50 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>サンプルは端末上で安全に作られ、後から一括削除できます</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>パスワードヒントがどう暗号化・復号されるか確認できます</span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 mt-2">
          <button
            type="button"
            onClick={onStartTour}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Spinner className="h-4 w-4 text-white" />
                <span>サンプルを準備中...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                <span>サンプルデータで体験してみる</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={isLoading}
            className="w-full rounded-xl border border-border/60 hover:bg-muted/50 px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            スキップして空のまま始める
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

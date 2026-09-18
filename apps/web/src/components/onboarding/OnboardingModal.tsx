import { KeyRound, Play, Sparkles } from "lucide-react";
import { JpText } from "@/components/JpText";
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
            <JpText as="span">PoohMaへようこそ！</JpText>
          </DialogTitle>
          <DialogDescription
            className="text-sm text-muted-foreground text-center leading-relaxed mt-2"
            asChild
          >
            <div>
              <JpText as="p">
                PoohMaは、動画配信やネット回線などのサービス情報をひとまとめにし、家族とだけ安全に共有できるアプリです。
              </JpText>
              <JpText as="p" className="mt-1 font-medium text-foreground/80">
                まずはサンプルデータを使って、安心の仕組みを体験してみませんか？
              </JpText>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* 秘密の合言葉（家族パスコード）の事前案内 */}
        <div className="my-2 rounded-xl bg-orange-500/10 border border-orange-500/20 p-3.5 text-xs text-left">
          <div className="flex items-start gap-2.5">
            <KeyRound className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <JpText
                as="span"
                className="font-semibold text-orange-600 dark:text-orange-400 block"
              >
                秘密の合言葉（家族パスコード）について
              </JpText>
              <JpText as="p" className="text-muted-foreground leading-relaxed">
                「体験してみる」を押すと、設定済みの「秘密の合言葉」の入力画面が表示されます。お使いの端末内だけで安全にサンプルを準備するためのものですので、安心してご入力ください。
              </JpText>
            </div>
          </div>
        </div>

        <div className="mb-3 rounded-xl bg-muted/40 p-3 border border-border/50 text-xs text-muted-foreground space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <JpText as="span">
              サンプルは端末内で安全に作られ、後からいつでも一括削除できます
            </JpText>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <JpText as="span">
              「家族で共有」と「自分専用」の使い分けやヒントの保護を体験できます
            </JpText>
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
                <JpText as="span">サンプルを準備中...</JpText>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" />
                <JpText as="span">サンプルデータで体験してみる</JpText>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={isLoading}
            className="w-full rounded-xl border border-border/60 hover:bg-muted/50 px-5 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            <JpText as="span">スキップして空のまま始める</JpText>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { ArrowRight, Globe, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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

export interface BulkVisibilityModalProps {
  isOpen: boolean;
  selectedCount: number;
  privateCount: number;
  sharedCount: number;
  onShare: () => Promise<void>;
  onUnshare: () => Promise<void>;
  onClose: () => void;
}

type Step = "select" | "confirm-share" | "confirm-unshare";

export function BulkVisibilityModal({
  isOpen,
  selectedCount,
  privateCount,
  sharedCount,
  onShare,
  onUnshare,
  onClose,
}: BulkVisibilityModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // モーダルの開閉時にステップを初期状態へリセット
  useEffect(() => {
    if (isOpen) {
      setStep("select");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleConfirmShare = async () => {
    setIsSubmitting(true);
    try {
      await onShare();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmUnshare = async () => {
    setIsSubmitting(true);
    try {
      await onUnshare();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="bulk-visibility-modal"
        className="sm:max-w-md"
        showCloseButton={!isSubmitting}
      >
        {step === "select" && (
          <>
            <DialogHeader>
              <DialogTitle>選択したレコードの共有設定</DialogTitle>
              <DialogDescription>
                選択した {selectedCount}{" "}
                件のレコードの共有状態を一括で変更します。
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 py-2">
              <span className="text-xs text-muted-foreground">現在の内訳:</span>
              <Badge variant="outline" className="text-xs gap-1">
                <Lock className="size-3 text-muted-foreground" />
                自分のみ {privateCount} 件
              </Badge>
              <Badge variant="outline" className="text-xs gap-1">
                <Globe className="size-3 text-blue-500" />
                家族共有 {sharedCount} 件
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2">
              <button
                type="button"
                data-testid="select-unshare-option"
                onClick={() => setStep("confirm-unshare")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-orange-500 hover:bg-orange-500/5 transition text-center cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Lock className="h-6 w-6 text-muted-foreground" />
                <span className="font-semibold text-sm">自分のみ</span>
                <span className="text-xs text-muted-foreground">
                  共有を解除（個人用）
                </span>
              </button>
              <button
                type="button"
                data-testid="select-share-option"
                onClick={() => setStep("confirm-share")}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-blue-500 hover:bg-blue-500/5 transition text-center cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Globe className="h-6 w-6 text-blue-500" />
                <span className="font-semibold text-sm">家族に共有</span>
                <span className="text-xs text-muted-foreground">
                  家族全員で共有
                </span>
              </button>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                data-testid="cancel-visibility-button"
                onClick={onClose}
              >
                キャンセル
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm-share" && (
          <>
            <DialogHeader>
              <DialogTitle>家族共有への一括変更確認</DialogTitle>
              <DialogDescription>
                選択したレコードを家族全員と共有します。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* 変更方向ビジュアル */}
              <div className="flex items-center justify-center gap-3 p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
                <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                  <Lock className="size-4" />
                  <span>自分のみ</span>
                </div>
                <ArrowRight className="size-4 text-blue-500 shrink-0" />
                <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                  <Globe className="size-4" />
                  <span>家族全員に共有</span>
                </div>
              </div>

              {/* 件数と説明 */}
              <div className="text-sm space-y-1.5 bg-secondary/50 p-3.5 rounded-lg border border-border">
                <p className="font-medium text-foreground">
                  対象レコード:{" "}
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    {selectedCount} 件
                  </span>
                </p>
                {sharedCount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    ※ 選択された {selectedCount} 件のうち {sharedCount}{" "}
                    件はすでに家族共有のため、個人用レコード（{privateCount}{" "}
                    件）が新たに家族へ共有されます。
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    選択したすべてのレコード（{selectedCount}{" "}
                    件）が家族全員に共有されます。
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                家族メンバー全員がこのレコードのサービス名やメモ等を閲覧できるようになります。パスワードヒントは家族マスターキーで保護されます。
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                type="button"
                variant="outline"
                data-testid="back-to-select-button"
                disabled={isSubmitting}
                onClick={() => setStep("select")}
              >
                戻る
              </Button>
              <Button
                type="button"
                data-testid="confirm-share-button"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleConfirmShare}
              >
                {isSubmitting ? (
                  <>
                    <Spinner className="size-4 mr-2" />
                    共有中...
                  </>
                ) : (
                  <>
                    <Globe className="size-4 mr-1.5" />
                    家族に共有する
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm-unshare" && (
          <>
            <DialogHeader>
              <DialogTitle>共有解除（個人用）への一括変更確認</DialogTitle>
              <DialogDescription>
                選択したレコードの家族共有を解除し、自分のみの閲覧に変更します。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* 変更方向ビジュアル */}
              <div className="flex items-center justify-center gap-3 p-3.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm">
                <div className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                  <Globe className="size-4" />
                  <span>家族全員に共有</span>
                </div>
                <ArrowRight className="size-4 text-orange-500 shrink-0" />
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Lock className="size-4" />
                  <span>自分のみ（個人用）</span>
                </div>
              </div>

              {/* 件数と説明 */}
              <div className="text-sm space-y-1.5 bg-secondary/50 p-3.5 rounded-lg border border-border">
                <p className="font-medium text-foreground">
                  対象レコード:{" "}
                  <span className="text-orange-600 dark:text-orange-400 font-bold">
                    {selectedCount} 件
                  </span>
                </p>
                {privateCount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    ※ 選択された {selectedCount} 件のうち {privateCount}{" "}
                    件はすでに個人用設定のため、家族共有レコード（{sharedCount}{" "}
                    件）の共有が解除されます。
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    選択したすべてのレコード（{selectedCount}{" "}
                    件）の共有が解除され、自分のみが閲覧可能になります。
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                共有を解除すると、家族メンバーはこのレコードを閲覧できなくなります。
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                type="button"
                variant="outline"
                data-testid="back-to-select-button"
                disabled={isSubmitting}
                onClick={() => setStep("select")}
              >
                戻る
              </Button>
              <Button
                type="button"
                data-testid="confirm-unshare-button"
                disabled={isSubmitting}
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={handleConfirmUnshare}
              >
                {isSubmitting ? (
                  <>
                    <Spinner className="size-4 mr-2" />
                    解除中...
                  </>
                ) : (
                  <>
                    <Lock className="size-4 mr-1.5" />
                    共有を解除する
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

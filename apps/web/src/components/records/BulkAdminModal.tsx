import { useMutation } from "convex/react";
import { ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
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

export interface BulkAdminModalProps {
  isOpen: boolean;
  selectedRecords: Array<{
    _id: Id<"serviceRecords">;
    title: string;
    ownerType?: "user" | "family";
    admins?: Id<"users">[];
  }>;
  familyMembers: Array<{
    id: Id<"users">;
    displayName?: string;
    email?: string;
    familyRole?: "admin" | "viewer";
  }>;
  activeAccountId?: Id<"users"> | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function BulkAdminModal({
  isOpen,
  selectedRecords,
  familyMembers,
  activeAccountId,
  onClose,
  onSuccess,
}: BulkAdminModalProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [action, setAction] = useState<"add" | "remove">("add");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bulkSetRecordAdminMut = useMutation(api.records.bulkSetRecordAdmin);

  // 選択されたレコードのうち、家族共有レコードを抽出
  const sharedRecords = selectedRecords.filter((r) => r.ownerType === "family");
  const viewerMembers = familyMembers.filter((m) => m.familyRole === "viewer");

  useEffect(() => {
    if (isOpen) {
      setSelectedMemberId("");
      setAction("add");
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selectedMemberId) {
      toast.error("対象メンバーを選択してください");
      return;
    }
    if (sharedRecords.length === 0) {
      toast.error("共有レコードが選択されていません");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkSetRecordAdminMut({
        ids: sharedRecords.map((r) => r._id),
        targetAccountId: selectedMemberId as Id<"users">,
        makeAdmin: action === "add",
        accountId: activeAccountId || undefined,
      });

      toast.success(
        action === "add"
          ? `${result.count} 件のレコードに管理者権限を付与しました`
          : `${result.count} 件のレコードの管理者権限を解除しました`,
      );
      await onSuccess();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "一括管理者設定に失敗しました",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isSubmitting && onClose()}
    >
      <DialogContent
        data-testid="bulk-admin-modal"
        className="sm:max-w-md"
        showCloseButton={!isSubmitting}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-orange-500" />
            レコード管理者の一括設定
          </DialogTitle>
          <DialogDescription>
            選択した {selectedRecords.length} 件中、家族共有レコード{" "}
            {sharedRecords.length} 件の個別管理者を一括設定します。
          </DialogDescription>
        </DialogHeader>

        {sharedRecords.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            選択されたレコードの中に家族共有レコードがありません。
            <br />
            （個人用レコードには個別の管理者を設定できません）
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* デフォルト管理者に関する注記 */}
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                💡 デフォルト管理者について:
              </span>
              <br />
              家族の「デフォルト管理者」は全共有レコードの管理権限を自動で保持しているため、個別に追加・解除する必要はありません。
            </div>

            {/* 対象メンバーの選択 */}
            <div className="space-y-1.5">
              <label
                htmlFor="bulk-admin-target-member"
                className="text-xs font-semibold text-foreground"
              >
                対象メンバー（閲覧専用メンバー）
              </label>
              {viewerMembers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  閲覧専用のメンバーが存在しません（全員デフォルト管理者です）。
                </p>
              ) : (
                <select
                  id="bulk-admin-target-member"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full rounded-md bg-card p-2 text-xs shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  <option value="">対象メンバーを選択...</option>
                  {viewerMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || "メンバー"} ({m.email})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 操作内容の選択 */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-foreground">
                操作内容
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAction("add")}
                  className={`flex items-center justify-center gap-1.5 rounded-md p-2.5 text-xs font-medium border transition cursor-pointer ${
                    action === "add"
                      ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  管理者に追加
                </button>
                <button
                  type="button"
                  onClick={() => setAction("remove")}
                  className={`flex items-center justify-center gap-1.5 rounded-md p-2.5 text-xs font-medium border transition cursor-pointer ${
                    action === "remove"
                      ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <UserMinus className="h-4 w-4" />
                  管理者を解除
                </button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          {sharedRecords.length > 0 && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={
                !selectedMemberId || isSubmitting || viewerMembers.length === 0
              }
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isSubmitting && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
              {action === "add" ? "一括追加する" : "一括解除する"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

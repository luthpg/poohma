import { useMutation } from "convex/react";
import { Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** 家族共有レコードの公開範囲と個別管理者を設定するダイアログ。 */
export function ShareSettingsDialog({
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
    familyRole?: "admin" | "viewer";
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
    } catch {
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
      const raw = e instanceof Error ? e.message : "";
      toast.error(
        raw.includes("ファミリー管理者は解除できません") ||
          raw.includes("デフォルト管理者は解除できません")
          ? "ファミリー管理者は解除できません"
          : raw.includes("管理者が0人になるため削除できません")
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
    } catch {
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
              {activeAdminUsers.map((admin) => {
                const member = familyMembers.find((m) => m.id === admin._id);
                const isFamilyAdmin = member?.familyRole === "admin";
                return (
                  <div
                    key={admin._id}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm"
                  >
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {admin.displayName || "メンバー"}
                        {admin._id === activeAccountId && " (あなた)"}
                        {isFamilyAdmin ? (
                          <span className="rounded bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 font-medium">
                            ファミリー管理者
                          </span>
                        ) : (
                          <span className="rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0.5 font-medium">
                            個別管理者
                          </span>
                        )}
                      </div>
                      {admin.email && (
                        <div className="text-xs text-muted-foreground">
                          {admin.email}
                        </div>
                      )}
                    </div>
                    {isAdmin && !isFamilyAdmin && (
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
                );
              })}
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
                const isFamilyAdmin = member.familyRole === "admin";
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
                    <div>
                      {isFamilyAdmin ? (
                        <span className="rounded bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 font-medium">
                          ファミリー管理者
                        </span>
                      ) : isMemberAdmin ? (
                        <span className="rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0.5 font-medium">
                          個別管理者
                        </span>
                      ) : (
                        <span className="rounded border border-border text-muted-foreground text-[10px] px-1.5 py-0.5 font-medium">
                          メンバー
                        </span>
                      )}
                    </div>
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

// エイリアスとしても利用可能にしておく
export const RecordShareDialog = ShareSettingsDialog;

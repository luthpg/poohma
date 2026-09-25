import { AlertTriangle, Download, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

interface MemberActionDialogsProps<
  T extends { id: Id<"users">; displayName?: string; email?: string } = {
    id: Id<"users">;
    displayName?: string;
    email?: string;
  },
> {
  // アカウント削除・退会モーダル
  isDeleteAccountModalOpen: boolean;
  setIsDeleteAccountModalOpen: (open: boolean) => void;
  isMultiAccount: boolean;
  activeAccountDisplayName?: string;
  isDeletingAccount: boolean;
  isExporting: boolean;
  handleExport: () => Promise<void>;
  handleDeleteAccount: () => Promise<void>;

  // メンバーキック確認ダイアログ
  memberToKick: T | null;
  setMemberToKick: (member: T | null) => void;
  isKicking: boolean;
  handleKickMember: () => Promise<void>;

  // キック後のパスコード変更推奨モーダル
  kickSuccessNotice: { memberName: string } | null;
  setKickSuccessNotice: (notice: { memberName: string } | null) => void;
  onOpenRotatePasscode: () => void;
}

export function MemberActionDialogs<
  T extends { id: Id<"users">; displayName?: string; email?: string } = {
    id: Id<"users">;
    displayName?: string;
    email?: string;
  },
>({
  isDeleteAccountModalOpen,
  setIsDeleteAccountModalOpen,
  isMultiAccount,
  activeAccountDisplayName,
  isDeletingAccount,
  isExporting,
  handleExport,
  handleDeleteAccount,
  memberToKick,
  setMemberToKick,
  isKicking,
  handleKickMember,
  kickSuccessNotice,
  setKickSuccessNotice,
  onOpenRotatePasscode,
}: MemberActionDialogsProps<T>) {
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  useEffect(() => {
    if (!isDeleteAccountModalOpen) {
      setDeleteConfirmationText("");
    }
  }, [isDeleteAccountModalOpen]);

  return (
    <>
      {/* アカウント削除・退会確認モーダル */}
      <AlertDialog
        open={isDeleteAccountModalOpen}
        onOpenChange={(open) => {
          if (!open && !isDeletingAccount) {
            setIsDeleteAccountModalOpen(false);
            setDeleteConfirmationText("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">
              {isMultiAccount
                ? `アカウント「${activeAccountDisplayName || "未設定"}」を削除しますか？`
                : "本当に退会しますか？"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-2 text-foreground">
                <div className="rounded-md bg-muted p-3 text-[14px]">
                  <p className="font-semibold mb-2">
                    {isMultiAccount ? "削除時の注意事項" : "退会時の注意事項"}
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {isMultiAccount ? (
                      <>
                        <li>
                          このPoohMaアカウントおよび関連データが削除されます。
                        </li>
                        <li>
                          他のPoohMaアカウントやログイン情報はそのまま保持されます。
                        </li>
                      </>
                    ) : (
                      <li>
                        あなたが登録したアカウント情報はすべて削除され、PoohMa全体から退会となります。
                      </li>
                    )}
                    <li>
                      削除操作は取り消せません。事前にCSVファイルでの保存をおすすめします。
                    </li>
                  </ul>
                </div>

                <div className="flex justify-center py-2">
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex items-center justify-center w-full rounded-md border border-border bg-background px-4 py-2.5 text-[14px] font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  >
                    {isExporting ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" />
                        ダウンロード中...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        CSVファイルをダウンロードする
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="family-confirm-delete"
                    className="text-[14px] font-medium text-foreground"
                  >
                    確認のため、「
                    <span className="font-bold text-red-500">
                      {isMultiAccount ? "削除する" : "退会する"}
                    </span>
                    」と入力してください
                  </label>
                  <input
                    id="family-confirm-delete"
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    placeholder={isMultiAccount ? "削除する" : "退会する"}
                    className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel
              disabled={isDeletingAccount}
              onClick={() => {
                if (isDeletingAccount) return;
                setIsDeleteAccountModalOpen(false);
                setDeleteConfirmationText("");
              }}
              className="mt-2 sm:mt-0"
            >
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const expected = isMultiAccount ? "削除する" : "退会する";
                if (deleteConfirmationText === expected) {
                  handleDeleteAccount();
                }
              }}
              disabled={
                deleteConfirmationText !==
                  (isMultiAccount ? "削除する" : "退会する") ||
                isDeletingAccount ||
                isExporting
              }
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              {isDeletingAccount ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {isMultiAccount ? "削除中..." : "退会処理中..."}
                </>
              ) : isMultiAccount ? (
                "理解した上で削除する"
              ) : (
                "理解した上で退会する"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* メンバーキック確認ダイアログ */}
      <Dialog
        open={memberToKick !== null}
        onOpenChange={(open) => {
          if (!open && !isKicking) setMemberToKick(null);
        }}
      >
        <DialogContent
          className="bg-card shadow-card sm:max-w-md"
          showCloseButton={false}
        >
          {memberToKick && (
            <>
              <div className="flex items-center gap-3 text-red-500">
                <AlertTriangle className="h-6 w-6 shrink-0" />
                <DialogTitle className="text-[18px] text-foreground">
                  メンバーを家族グループから削除
                </DialogTitle>
              </div>
              <DialogDescription asChild>
                <div className="space-y-3 text-[13px] text-muted-foreground leading-relaxed">
                  <p>
                    「
                    <strong className="text-foreground">
                      {memberToKick.displayName}
                    </strong>
                    」（{memberToKick.email}）を家族グループから削除しますか？
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      対象者が「自分のみ」として登録したデータは、本人が旧パスコードを用いて持ち出すことができます。
                    </li>
                    <li>
                      対象者が家族と「共有」していたデータは、家族グループ側に残ります。
                    </li>
                    <li className="text-orange-600 dark:text-orange-400 font-medium">
                      削除されたメンバーはこれまでのパスコードを記憶しているため、削除後はパスコードの変更を強く推奨します。
                    </li>
                  </ul>
                </div>
              </DialogDescription>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  disabled={isKicking}
                  onClick={() => setMemberToKick(null)}
                  className="w-full sm:w-auto rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition cursor-pointer text-center"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  disabled={isKicking}
                  onClick={handleKickMember}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-red-700 transition disabled:opacity-50 cursor-pointer"
                  data-testid="confirm-kick-btn"
                >
                  {isKicking && <Spinner className="h-4 w-4" />}
                  削除する
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* キック後パスコード変更推奨モーダル */}
      <Dialog
        open={kickSuccessNotice !== null}
        onOpenChange={(open) => {
          if (!open) setKickSuccessNotice(null);
        }}
      >
        <DialogContent
          className="bg-card shadow-card sm:max-w-md"
          showCloseButton={false}
        >
          {kickSuccessNotice && (
            <>
              <div className="flex items-center gap-3 text-orange-500">
                <KeyRound className="h-6 w-6 shrink-0" />
                <DialogTitle className="text-[18px] text-foreground">
                  家族パスコードの変更を推奨します
                </DialogTitle>
              </div>
              <DialogDescription className="text-[13px] leading-relaxed">
                メンバー「<strong>{kickSuccessNotice.memberName}</strong>
                」を削除しました。
                <br />
                削除されたメンバーはこれまでの家族パスコードを記憶しているため、家族に残された共有データを確実に保護するには、
                <strong>今すぐパスコードを変更（ローテーション）</strong>
                することをお勧めします。
              </DialogDescription>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setKickSuccessNotice(null)}
                  className="w-full sm:w-auto rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition cursor-pointer text-center"
                >
                  あとで行う
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKickSuccessNotice(null);
                    onOpenRotatePasscode();
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-orange-600 transition cursor-pointer"
                >
                  <KeyRound className="h-4 w-4" />
                  今すぐパスコードを変更
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

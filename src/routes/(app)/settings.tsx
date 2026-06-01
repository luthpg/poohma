import {
  createFileRoute,
  getRouteApi,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { AlertTriangle, Download } from "lucide-react";
import { type SubmitEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useExportCsv } from "@/hooks/use-export-csv";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import { auth } from "@/utils/firebase";

export const Route = createFileRoute("/(app)/settings")({
  loader: async ({ context }) => {
    if (!context.user) {
      throw redirect({ to: "/login" });
    }
    return { user: context.user };
  },
  component: SettingsComponent,
});

const routeApi = getRouteApi("/(app)/settings");

function SettingsComponent() {
  const { user } = routeApi.useLoaderData();
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [displayName, setDisplayName] = useState(user.displayName || "");

  // ローダーデータの user.displayName が変わった場合にフォームの値を同期
  useEffect(() => {
    setDisplayName(user.displayName || "");
  }, [user.displayName]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const { handleExport, isExporting } = useExportCsv();

  const updateProfile = useMutation(api.users.updateProfile);
  const deleteAccount = useMutation(api.users.deleteAccount);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("表示名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("プロフィールを更新しました");
      await router.invalidate();
    } catch (error) {
      console.error(error);
      toast.error("プロフィールの更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) {
        throw new Error("認証情報が見つかりません。再ログインしてください。");
      }

      // 1. Firebase Auth ユーザーの削除を先に実行
      await currentUser.delete();

      // 2. Auth削除成功後にConvexのデータ削除
      await deleteAccount();

      // 3. キャッシュのクリア
      clearQueryCache();

      toast.success("退会処理が完了しました");
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch (error) {
      console.error(error);
      const err = error as { code?: string; message?: string };
      if (err?.code === "auth/requires-recent-login") {
        toast.error(
          "セキュリティ保護のため、最近ログインしていない場合はこの操作を実行できません。一度ログアウトし、再ログインしてからやり直してください。",
        );
      } else {
        toast.error(err?.message || "退会処理に失敗しました");
      }
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* 戻るボタン */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 bg-background/95 px-6 pb-4 pt-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 2) {
              window.history.back();
            } else {
              router.navigate({ to: "/dashboard" });
            }
          }}
          className="text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <span className="text-[16px] leading-none mb-0.5">←</span> 戻る
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-[28px] font-semibold tracking-geist-h1 text-foreground mb-2">
          アカウント設定
        </h1>
        <p className="text-[14px] text-muted-foreground">
          プロフィールの情報を変更できます。
        </p>
      </div>

      <div className="rounded-lg bg-card p-6 shadow-card border border-border/50">
        <h2 className="text-[18px] font-semibold text-foreground tracking-geist-ui mb-6 border-b border-border pb-4">
          プロフィール
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="email-input"
              className="block text-[14px] font-medium text-muted-foreground mb-1"
            >
              メールアドレス
            </label>
            <input
              id="email-input"
              type="text"
              value={user.email}
              disabled
              className="w-full rounded-md bg-muted p-2.5 text-base md:text-[14px] text-muted-foreground shadow-sm focus:outline-none opacity-80 cursor-not-allowed"
            />
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              メールアドレスは変更できません。
            </p>
          </div>

          <div>
            <label
              htmlFor="display-name-input"
              className="block text-[14px] font-medium text-foreground mb-1"
            >
              表示名 <span className="text-red-500">*</span>
            </label>
            <input
              id="display-name-input"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              placeholder="表示名を入力"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSaving || displayName.trim() === user.displayName}
              className="flex items-center rounded-md bg-foreground px-6 py-2.5 text-[14px] font-medium text-background shadow-lg transition hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  保存中...
                </>
              ) : (
                "保存する"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/5 p-6 shadow-sm">
        <h2 className="text-[18px] font-semibold text-red-600 dark:text-red-400 tracking-geist-ui mb-2 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h2>
        <p className="text-[14px] text-muted-foreground mb-6">
          アカウントの削除（退会）を行います。この操作は取り消すことができません。
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-6 py-2.5 text-[14px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 w-full md:w-auto"
            >
              退会する
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600 dark:text-red-400">
                本当に退会しますか？
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 pt-2 text-foreground">
                  <div className="rounded-md bg-muted p-3 text-[14px]">
                    <p className="font-semibold mb-2">退会時の注意事項</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>
                        あなたが登録したアカウント情報はすべて削除されます。
                      </li>
                      <li>
                        家族と「共有
                        (Shared)」に設定している情報も、他の家族から見られなくなります。
                      </li>
                      <li>
                        退会操作は取り消せません。事前にCSVエクスポートをおすすめします。
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
                          エクスポート中...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          CSVエクスポートする
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="confirm-delete"
                      className="text-[14px] font-medium text-foreground"
                    >
                      確認のため、「
                      <span className="font-bold text-red-500">退会する</span>
                      」と入力してください
                    </label>
                    <input
                      id="confirm-delete"
                      type="text"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="退会する"
                      className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel
                onClick={() => setDeleteConfirmation("")}
                className="mt-2 sm:mt-0"
              >
                キャンセル
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteConfirmation === "退会する") {
                    handleDeleteAccount();
                  }
                }}
                disabled={deleteConfirmation !== "退会する" || isDeleting}
                className="bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {isDeleting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    退会処理中...
                  </>
                ) : (
                  "理解した上で退会する"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

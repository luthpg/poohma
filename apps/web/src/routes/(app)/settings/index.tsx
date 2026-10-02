import {
  createFileRoute,
  getRouteApi,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  signOut,
} from "firebase/auth";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronRight,
  Database,
  Download,
  Mail,
} from "lucide-react";
import { type SubmitEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { SubHeader } from "@/components/common/SubHeader";
import { usePasscode } from "@/components/PasscodeProvider";
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
import { useAccount } from "@/hooks/useAccount";
import { LOGOUT_FLAG_KEY } from "@/hooks/useConvexFirebaseAuth";
import { useExportCsv } from "@/hooks/useExportCsv";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import { isBiometricEnabledForUser } from "@/lib/biometric";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth.functions";
import { auth } from "@/utils/firebase";

export const Route = createFileRoute("/(app)/settings/")({
  loader: ({ context }) => {
    return { user: context.user ?? null };
  },
  component: SettingsComponent,
});

const routeApi = getRouteApi("/(app)/settings/");

function SettingsComponent() {
  const { user } = routeApi.useLoaderData();
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  const {
    accounts,
    activeAccount,
    activeAccountId,
    deleteAccount: deletePoohMaAccount,
  } = useAccount();
  const { disableBiometric, lockTimeoutMinutes, setLockTimeoutMinutes } =
    usePasscode();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const currentAccount = activeAccount || user;
  const [displayName, setDisplayName] = useState(
    currentAccount?.displayName || "",
  );
  const [hasBiometric, setHasBiometric] = useState(false);

  useEffect(() => {
    const targetId = activeAccount?.id || user?.id;
    if (targetId) {
      isBiometricEnabledForUser(targetId).then(setHasBiometric);
    }
  }, [activeAccount?.id, user?.id]);

  const handleClearBiometric = async () => {
    try {
      await disableBiometric();
      setHasBiometric(false);
      toast.success("この端末の生体認証データを削除しました");
    } catch {
      toast.error("生体認証データの削除に失敗しました");
    }
  };

  // アクティブアカウントが変わった場合にフォームの値を同期
  useEffect(() => {
    setDisplayName(currentAccount?.displayName ?? "");
  }, [currentAccount?.displayName]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingSubAccount, setIsDeletingSubAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteSubAccountConfirmation, setDeleteSubAccountConfirmation] =
    useState("");
  const [isDeleteSubAccountDialogOpen, setIsDeleteSubAccountDialogOpen] =
    useState(false);
  const { handleExport, isExporting } = useExportCsv();

  const updateProfile = useMutation(api.users.updateProfile);
  const deleteAllAccountsConvex = useMutation(api.users.deleteAllAccounts);
  const updateEmailSettingsMutation = useMutation(
    api.users.updateEmailNotificationSettings,
  );

  const [emailSettings, setEmailSettings] = useState({
    notifyRecordChanges:
      currentAccount?.emailNotificationSettings?.notifyRecordChanges ?? true,
    notifyFamilyActivity:
      currentAccount?.emailNotificationSettings?.notifyFamilyActivity ?? true,
    notifyDataExport:
      currentAccount?.emailNotificationSettings?.notifyDataExport ?? true,
    notifySecuritySettings:
      currentAccount?.emailNotificationSettings?.notifySecuritySettings ?? true,
  });
  const [isUpdatingEmailSettings, setIsUpdatingEmailSettings] = useState(false);

  useEffect(() => {
    setEmailSettings({
      notifyRecordChanges:
        currentAccount?.emailNotificationSettings?.notifyRecordChanges ?? true,
      notifyFamilyActivity:
        currentAccount?.emailNotificationSettings?.notifyFamilyActivity ?? true,
      notifyDataExport:
        currentAccount?.emailNotificationSettings?.notifyDataExport ?? true,
      notifySecuritySettings:
        currentAccount?.emailNotificationSettings?.notifySecuritySettings ??
        true,
    });
  }, [currentAccount?.emailNotificationSettings]);

  const handleToggleEmailSetting = async (
    key:
      | "notifyRecordChanges"
      | "notifyFamilyActivity"
      | "notifyDataExport"
      | "notifySecuritySettings",
    newValue: boolean,
  ) => {
    if (isUpdatingEmailSettings) return;
    setIsUpdatingEmailSettings(true);
    const updated = { ...emailSettings, [key]: newValue };
    setEmailSettings(updated);
    try {
      await updateEmailSettingsMutation({
        accountId: activeAccountId || undefined,
        settings: { [key]: newValue },
      });
      toast.success("メール通知設定を更新しました");
    } catch (_error) {
      setEmailSettings(emailSettings);
      toast.error("メール通知設定の更新に失敗しました");
    } finally {
      setIsUpdatingEmailSettings(false);
    }
  };

  const handleBatchToggleEmailSettings = async (enabled: boolean) => {
    if (isUpdatingEmailSettings) return;
    setIsUpdatingEmailSettings(true);
    const previous = { ...emailSettings };
    const updated = {
      notifyRecordChanges: enabled,
      notifyFamilyActivity: enabled,
      notifyDataExport: enabled,
      notifySecuritySettings: enabled,
    };
    setEmailSettings(updated);
    try {
      await updateEmailSettingsMutation({
        accountId: activeAccountId || undefined,
        settings: updated,
      });
      toast.success(
        enabled
          ? "すべてのメール通知をオンにしました"
          : "すべてのメール通知をオフにしました",
      );
    } catch (_error) {
      setEmailSettings(previous);
      toast.error("メール通知設定の一括更新に失敗しました");
    } finally {
      setIsUpdatingEmailSettings(false);
    }
  };

  const isAllEmailEnabled =
    emailSettings.notifyRecordChanges &&
    emailSettings.notifyFamilyActivity &&
    emailSettings.notifyDataExport &&
    emailSettings.notifySecuritySettings;

  const isAllEmailDisabled =
    !emailSettings.notifyRecordChanges &&
    !emailSettings.notifyFamilyActivity &&
    !emailSettings.notifyDataExport &&
    !emailSettings.notifySecuritySettings;

  if (!currentAccount) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-orange-500" />
      </div>
    );
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error("表示名を入力してください");
      return;
    }

    setIsSaving(true);
    try {
      // activeAccount が存在する場合はそのアカウント ID を渡し、
      // 存在しない場合は undefined（= デフォルトアカウントを更新）
      await updateProfile({
        accountId: activeAccount?._id || undefined,
        displayName: displayName.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("プロフィールを更新しました");
      await router.invalidate();
    } catch {
      toast.error("プロフィールの更新に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSingleAccount = async () => {
    if (!activeAccountId) return;
    setIsDeletingSubAccount(true);
    try {
      await deletePoohMaAccount(activeAccountId);
      setDeleteSubAccountConfirmation("");
      setIsDeleteSubAccountDialogOpen(false);
    } catch {
      toast.error("アカウントの削除に失敗しました");
    } finally {
      setIsDeletingSubAccount(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    let convexDeletionCompleted = false;
    try {
      const currentUser = auth?.currentUser;
      if (!currentUser) {
        throw new Error("認証情報が見つかりません。再ログインしてください。");
      }

      // 1. Firebase 再認証を最初に実行（セキュリティ確認）
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({
          prompt: "select_account",
        });
        await reauthenticateWithPopup(currentUser, provider);
      } catch {
        throw new Error("再認証に失敗しました。操作をキャンセルします。");
      }

      // 2. 再認証成功後、Convexで全アカウント削除を実行
      await deleteAllAccountsConvex({});
      convexDeletionCompleted = true;

      // 3. Convex削除成功後にFirebase Auth ユーザーの削除
      await currentUser.delete();

      try {
        localStorage.setItem(LOGOUT_FLAG_KEY, String(Date.now()));
      } catch (_e) {
        // localStorage利用不可時は無視
      }
      try {
        await logout();
      } catch (_e) {
        // サーバーセッション失効失敗時も遷移を継続
      }
      try {
        if (auth) await signOut(auth);
      } catch (_e) {
        // Firebaseサインアウト失敗時も継続
      }
      clearQueryCache();
      queryClient.clear();

      toast.success("退会処理が完了しました");
      window.location.href = "/";
    } catch (error) {
      if (convexDeletionCompleted) {
        try {
          localStorage.setItem(LOGOUT_FLAG_KEY, String(Date.now()));
        } catch (_e) {
          // localStorage利用不可時は無視
        }
        try {
          await logout();
        } catch (_e) {
          // サーバーセッション失効失敗時も後続のクリーンアップを継続
        }
        try {
          if (auth) await signOut(auth);
        } catch (_e) {
          // Firebase認証解除失敗時もキャッシュ削除を継続
        }
        clearQueryCache();
        queryClient.clear();
        toast.error(
          "退会処理中にエラーが発生しましたが、アカウントデータは削除されました。",
        );
        window.location.href = "/";
        return;
      }
      const err = error as { code?: string; message?: string };
      if (err?.code === "auth/requires-recent-login") {
        toast.error(
          "セキュリティ保護のため、最近ログインしていない場合はこの操作を実行できません。一度ログアウトし、再ログインしてからやり直してください。",
        );
      } else {
        toast.error(
          "退会処理に失敗しました。時間をおいてもう一度お試しください。",
        );
      }
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      {/* 共通スマート子ヘッダー */}
      <SubHeader backLabel="ダッシュボードに戻る" fallbackTo="/dashboard" />

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
              value={currentAccount.email}
              disabled
              className="input-base cursor-not-allowed opacity-75"
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
              className="input-base"
              placeholder="表示名を入力"
            />
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={
                isSaving || displayName.trim() === currentAccount.displayName
              }
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

      <div className="rounded-lg bg-card p-6 shadow-card border border-border/50 mt-8">
        <h2 className="text-[18px] font-semibold text-foreground tracking-geist-ui mb-2 border-b border-border pb-4">
          セキュリティ設定
        </h2>
        <div className="space-y-6 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium text-foreground">
                オートロック（無操作タイムアウト）
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                一定時間操作がない場合、または設定時間以上バックグラウンドに置かれた状態からアプリに戻った際、自動で暗号化キーをロックします。
                <br />
                なお、この設定値は端末ごと（またはブラウザごと）に保存されます。
              </p>
            </div>
            <label htmlFor="autolock-timeout" className="sr-only">
              オートロック時間
            </label>
            <select
              id="autolock-timeout"
              value={lockTimeoutMinutes}
              onChange={(e) => {
                const val = Number(e.target.value);
                setLockTimeoutMinutes(val);
                toast.success(
                  val === 0
                    ? "オートロックを無効にしました"
                    : `オートロック時間を ${val} 分に設定しました`,
                );
              }}
              className="rounded-md border border-border/50 bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 w-full sm:w-auto shrink-0"
            >
              <option value={1}>1分</option>
              <option value={3}>3分</option>
              <option value={5}>5分（デフォルト）</option>
              <option value={10}>10分</option>
              <option value={15}>15分</option>
              <option value={30}>30分</option>
              <option value={0}>無効</option>
            </select>
          </div>

          {hasBiometric && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-border/40">
              <div>
                <p className="text-[14px] font-medium text-foreground">
                  生体認証の解除
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  この端末に保存されている生体認証（FaceID/指紋）のロック解除設定を削除します。
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearBiometric}
                className="rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground shrink-0"
              >
                設定を削除
              </button>
            </div>
          )}
        </div>
      </div>

      {/* メール通知設定セクション */}
      <div className="rounded-lg bg-card p-6 shadow-card border border-border/50 mt-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-orange-500" />
            <h2 className="text-[18px] font-semibold text-foreground tracking-geist-ui">
              メール通知設定
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground hidden sm:inline">
              一括操作:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isUpdatingEmailSettings}
                onClick={() => handleBatchToggleEmailSettings(true)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-all shadow-xs cursor-pointer border",
                  isAllEmailEnabled
                    ? "bg-orange-500 text-white border-orange-500 font-semibold shadow-orange-500/20"
                    : "bg-background text-foreground border-border hover:bg-accent hover:border-foreground/20",
                  isUpdatingEmailSettings && "opacity-50 cursor-not-allowed",
                )}
              >
                <Check className="h-3.5 w-3.5" />
                <span>すべてオン</span>
              </button>
              <button
                type="button"
                disabled={isUpdatingEmailSettings}
                onClick={() => handleBatchToggleEmailSettings(false)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium transition-all shadow-xs cursor-pointer border",
                  isAllEmailDisabled
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900 border-stone-800 dark:border-stone-200 font-semibold"
                    : "bg-background text-foreground border-border hover:bg-accent hover:border-foreground/20",
                  isUpdatingEmailSettings && "opacity-50 cursor-not-allowed",
                )}
              >
                <Ban className="h-3.5 w-3.5" />
                <span>すべてオフ</span>
              </button>
            </div>
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-6">
          各種イベント発生時にお送りする通知メールの受信設定を管理できます。
        </p>

        <div className="space-y-5">
          {/* レコード共有・権限変更通知 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium text-foreground">
                レコードの共有・管理者変更通知
              </p>
              <p className="text-[12px] text-muted-foreground">
                アカウント情報の家族共有への追加・解除や、管理者権限の変更時に通知します。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              disabled={isUpdatingEmailSettings}
              aria-label="レコードの共有・管理者変更通知"
              aria-checked={emailSettings.notifyRecordChanges}
              onClick={() =>
                handleToggleEmailSetting(
                  "notifyRecordChanges",
                  !emailSettings.notifyRecordChanges,
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                emailSettings.notifyRecordChanges
                  ? "bg-orange-500"
                  : "bg-muted-foreground/30"
              } ${isUpdatingEmailSettings ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  emailSettings.notifyRecordChanges
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 家族アクティビティ通知 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border/40">
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium text-foreground">
                家族のアクティビティ通知
              </p>
              <p className="text-[12px] text-muted-foreground">
                家族への参加申請の受信や、新しいメンバーの加入・脱退時に通知します。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              disabled={isUpdatingEmailSettings}
              aria-label="家族のアクティビティ通知"
              aria-checked={emailSettings.notifyFamilyActivity}
              onClick={() =>
                handleToggleEmailSetting(
                  "notifyFamilyActivity",
                  !emailSettings.notifyFamilyActivity,
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                emailSettings.notifyFamilyActivity
                  ? "bg-orange-500"
                  : "bg-muted-foreground/30"
              } ${isUpdatingEmailSettings ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  emailSettings.notifyFamilyActivity
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* CSVデータエクスポート通知 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border/40">
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium text-foreground">
                CSVデータエクスポート通知
              </p>
              <p className="text-[12px] text-muted-foreground">
                保管データのCSV一括エクスポートが実行された際に通知します。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              disabled={isUpdatingEmailSettings}
              aria-label="CSVデータエクスポート通知"
              aria-checked={emailSettings.notifyDataExport}
              onClick={() =>
                handleToggleEmailSetting(
                  "notifyDataExport",
                  !emailSettings.notifyDataExport,
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                emailSettings.notifyDataExport
                  ? "bg-orange-500"
                  : "bg-muted-foreground/30"
              } ${isUpdatingEmailSettings ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  emailSettings.notifyDataExport
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* セキュリティ設定変更通知 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-border/40">
            <div className="space-y-0.5">
              <p className="text-[14px] font-medium text-foreground">
                端末セキュリティ設定通知
              </p>
              <p className="text-[12px] text-muted-foreground">
                生体認証（Touch ID/Face
                ID）の登録や解除が行われた際に通知します。
              </p>
            </div>
            <button
              type="button"
              role="switch"
              disabled={isUpdatingEmailSettings}
              aria-label="端末セキュリティ設定通知"
              aria-checked={emailSettings.notifySecuritySettings}
              onClick={() =>
                handleToggleEmailSetting(
                  "notifySecuritySettings",
                  !emailSettings.notifySecuritySettings,
                )
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                emailSettings.notifySecuritySettings
                  ? "bg-orange-500"
                  : "bg-muted-foreground/30"
              } ${isUpdatingEmailSettings ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  emailSettings.notifySecuritySettings
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-md bg-muted/40 p-3 text-[11px] text-muted-foreground">
          ※ワンタイムパスワード（OTP）や新端末ログイン検知、マスターパスコード変更、リカバリーキット発行、アカウント削除などの重要セキュリティ通知は、アカウント保護のため配信停止できません。
        </div>
      </div>

      {/* データ管理セクション */}
      <div className="rounded-lg bg-card p-6 shadow-card border border-border/50 mt-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-[18px] font-semibold text-foreground tracking-geist-ui">
              データ管理（CSV）
            </h2>
            <p className="text-[12px] text-muted-foreground">
              登録データの一括エクスポート、および編集したCSVの差分プレビュー一括インポートが行えます。
            </p>
          </div>
          <Link
            to="/settings/bulk"
            className="inline-flex items-center justify-center rounded-md bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-[13px] font-medium transition shrink-0 gap-1.5 cursor-pointer shadow-sm"
          >
            <Database className="h-4 w-4" />
            データ管理を開く
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="mt-8 danger-zone-container">
        <h2 className="danger-zone-title mb-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Danger Zone
        </h2>
        <p className="text-[14px] text-muted-foreground mb-6">
          アカウントの削除を行います。この操作は取り消すことができません。
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          {accounts.length > 1 && (
            <AlertDialog
              open={isDeleteSubAccountDialogOpen}
              onOpenChange={(open) => {
                setIsDeleteSubAccountDialogOpen(open);
                if (!open) setDeleteSubAccountConfirmation("");
              }}
            >
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[14px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 w-full sm:w-auto cursor-pointer"
                >
                  このアカウント（{currentAccount.displayName}）のみ削除
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-600 dark:text-red-400">
                    アカウント「{currentAccount.displayName}」を削除しますか？
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-4 pt-2 text-foreground">
                      <div className="rounded-md bg-muted p-3 text-[14px]">
                        <p className="font-semibold mb-2">削除時の注意事項</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li>
                            他の家族メンバーがいる場合、このアカウントの個人データのみ削除され、共有データは残ります。
                          </li>
                          <li>
                            このアカウントが最後のメンバーの場合、所属ファミリーと共有データも削除されます。
                          </li>
                          <li>
                            他のPoohMaアカウントやFirebaseログインはそのまま保持されます。
                          </li>
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
                          htmlFor="confirm-delete-subaccount"
                          className="text-[14px] font-medium text-foreground"
                        >
                          確認のため、「
                          <span className="font-bold text-red-500">
                            削除する
                          </span>
                          」と入力してください
                        </label>
                        <input
                          id="confirm-delete-subaccount"
                          type="text"
                          value={deleteSubAccountConfirmation}
                          onChange={(e) =>
                            setDeleteSubAccountConfirmation(e.target.value)
                          }
                          placeholder="削除する"
                          className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] border border-border shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        />
                      </div>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-6">
                  <AlertDialogCancel
                    disabled={isDeletingSubAccount}
                    onClick={() => {
                      if (isDeletingSubAccount) return;
                      setIsDeleteSubAccountDialogOpen(false);
                      setDeleteSubAccountConfirmation("");
                    }}
                    className="mt-2 sm:mt-0"
                  >
                    キャンセル
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      if (deleteSubAccountConfirmation === "削除する") {
                        handleDeleteSingleAccount();
                      }
                    }}
                    disabled={
                      deleteSubAccountConfirmation !== "削除する" ||
                      isDeletingSubAccount ||
                      isExporting
                    }
                    className="bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  >
                    {isDeletingSubAccount ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" />
                        削除中...
                      </>
                    ) : (
                      "理解した上で削除する"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <AlertDialog
            onOpenChange={(open) => {
              if (!open) setDeleteConfirmation("");
            }}
          >
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 px-6 py-2.5 text-[14px] font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 w-full sm:w-auto cursor-pointer"
              >
                PoohMa全体から退会する
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
                          他の家族メンバーがいる場合、所属ファミリーの共有データは残ります（最後のメンバーの場合は所属ファミリーと共有データも削除されます）。
                        </li>
                        <li>
                          退会操作は取り消せません。事前にCSVファイルでの保存をおすすめします。
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
                  disabled={isDeleting}
                  onClick={() => {
                    if (isDeleting) return;
                    setDeleteConfirmation("");
                  }}
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
                  disabled={
                    deleteConfirmation !== "退会する" ||
                    isDeleting ||
                    isExporting
                  }
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
    </div>
  );
}

import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  GoogleAuthProvider,
  reauthenticateWithPopup,
  signOut,
} from "firebase/auth";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FileEdit,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  UserMinus,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { FamilyAuditLogsSection } from "@/components/family/FamilyAuditLogsSection";
import { FamilyInviteSection } from "@/components/family/FamilyInviteSection";
import { FamilySetupView } from "@/components/family/FamilySetupView";
import { MemberActionDialogs } from "@/components/family/MemberActionDialogs";
import { PasscodeRotateSection } from "@/components/family/PasscodeRotateSection";
import { RecoveryKitDialog } from "@/components/family/RecoveryKitDialog";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { usePasscode } from "@/components/PasscodeProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import { LOGOUT_FLAG_KEY } from "@/hooks/useConvexFirebaseAuth";
import { useExportCsv } from "@/hooks/useExportCsv";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import {
  CURRENT_KDF_ITERATIONS,
  CURRENT_KDF_VERSION,
  deriveKeyFromPasscode,
  generateMasterKey,
  generateSalt,
  type KdfVersion,
  LEGACY_KDF_VERSION,
  LEGACY_PBKDF2_ITERATIONS,
  reEncryptCredentials,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";
import { familyCreatedSteps } from "@/lib/onboarding/tours";
import { logout } from "@/services/auth.functions";
import { auth } from "@/utils/firebase";

export const Route = createFileRoute("/(app)/family")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { inviteCode?: string } => ({
    inviteCode: search.inviteCode as string | undefined,
  }),
  pendingComponent: FamilyPending,
  component: FamilyComponent,
});

function FamilyPending() {
  return (
    <div data-testid="family-pending" className="mx-auto max-w-3xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-[32px] font-semibold tracking-geist-h1 text-foreground">
          家族管理
        </h1>
        <Skeleton className="h-[36px] w-[120px] rounded-md" />
      </div>

      <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
        <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
          <Skeleton className="h-6 w-32 rounded-md" />
        </div>
        <div className="mb-8">
          <Skeleton className="mb-3 h-5 w-24 rounded-md" />
          <div className="flex items-center gap-3 rounded-md bg-muted/50 p-4 shadow-border-light">
            <Skeleton className="h-6 w-full max-w-[300px] rounded-md" />
            <Skeleton className="h-[32px] w-[60px] rounded-md" />
          </div>
          <Skeleton className="mt-2 h-4 w-64 rounded-md" />
        </div>

        <div>
          <Skeleton className="mb-4 h-5 w-24 rounded-md" />
          <ul className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton component uses index as key
                key={i}
                className="flex items-center justify-between rounded-md bg-card p-4 shadow-border-light border border-border/50"
              >
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-4 w-32 rounded-md" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** 家族グループの作成、参加、メンバー管理を提供する設定画面。 */
function FamilyComponent() {
  const { isAuthenticated } = useConvexAuth();
  const {
    activeAccountId,
    activeAccount,
    accounts,
    deleteAccount: deletePoohMaAccount,
  } = useAccount();
  const { handleExport, isExporting } = useExportCsv();
  const isMultiAccount = accounts.length > 1;
  const family = useQuery(
    api.families.getFamilyMembers,
    isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
  );
  const myJoinRequest = useQuery(
    api.families.getMyJoinRequest,
    isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
  );
  const pendingRequests = useQuery(
    api.families.getPendingRequests,
    isAuthenticated && family
      ? { accountId: activeAccountId || undefined }
      : "skip",
  );
  const recoveryStatus = useQuery(
    api.recovery.getRecoveryStatus,
    isAuthenticated && family
      ? { accountId: activeAccountId || undefined }
      : "skip",
  );
  const pendingExportVault = useQuery(
    api.families.getMyPendingExportVault,
    isAuthenticated && !family
      ? { accountId: activeAccountId || undefined }
      : "skip",
  );
  const [isRecoveryKitModalOpen, setIsRecoveryKitModalOpen] = useState(false);

  const search = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const [showFamilyCreatedTour, setShowFamilyCreatedTour] = useState(false);

  const { queryClient } = Route.useRouteContext();
  const convex = useConvex();
  const handleLogout = async () => {
    try {
      try {
        localStorage.setItem(LOGOUT_FLAG_KEY, String(Date.now()));
      } catch (_e) {
        // localStorage利用不可時は無視
      }
      await logout();
      if (auth) await signOut(auth);
      clearQueryCache();
      queryClient.clear();
      window.location.href = "/";
    } catch (_error) {
      window.location.href = "/";
    }
  };

  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] =
    useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const deleteAllAccountsConvex = useMutation(api.users.deleteAllAccounts);

  const handleDeleteAccount = async () => {
    if (isMultiAccount) {
      // サブアカウント（複数アカウント保有時）: 現在のアカウントのみ削除
      if (!activeAccountId) return;
      setIsDeletingAccount(true);
      try {
        await deletePoohMaAccount(activeAccountId);
        setIsDeleteAccountModalOpen(false);
      } catch {
        toast.error("アカウントの削除に失敗しました");
      } finally {
        setIsDeletingAccount(false);
      }
    } else {
      // 単一アカウント（PoohMa全体からの退会）: Firebase 再認証 + 全削除 + 退会
      setIsDeletingAccount(true);
      let convexDeletionCompleted = false;
      try {
        const currentUser = auth?.currentUser;
        if (!currentUser) {
          throw new Error("認証情報が見つかりません。再ログインしてください。");
        }

        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({
            prompt: "select_account",
          });
          await reauthenticateWithPopup(currentUser, provider);
        } catch {
          throw new Error("再認証に失敗しました。操作をキャンセルします。");
        }

        await deleteAllAccountsConvex({});
        convexDeletionCompleted = true;
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
        setIsDeletingAccount(false);
      }
    }
  };

  const familyInvites = useQuery(
    api.families.getFamilyInvites,
    family ? { accountId: activeAccountId || undefined } : "skip",
  );

  const prepareFamilyMigrationMut = useMutation(
    api.families.prepareFamilyMigration,
  );
  const commitFamilyMigrationMut = useMutation(
    api.families.commitFamilyMigration,
  );
  const abortFamilyMigrationMut = useMutation(
    api.families.abortFamilyMigration,
  );
  const createJoinRequestMut = useMutation(api.families.createJoinRequest);
  const cancelJoinRequestMut = useMutation(api.families.cancelJoinRequest);
  const dismissRejectedRequestMut = useMutation(
    api.families.dismissRejectedRequest,
  );
  const approveJoinRequestMut = useMutation(api.families.approveJoinRequest);
  const rejectJoinRequestMut = useMutation(api.families.rejectJoinRequest);
  const kickMemberMut = useMutation(api.families.kickMember);
  const updateMemberRoleMut = useMutation(api.families.updateMemberRole);
  const updateFamilyNameMut = useMutation(api.families.updateFamilyName);
  const abandonPendingExportVaultMut = useMutation(
    api.families.abandonPendingExportVault,
  );

  const [isEditingFamilyName, setIsEditingFamilyName] = useState(false);
  const [familyNameInput, setFamilyNameInput] = useState("");
  const [isUpdatingFamilyName, setIsUpdatingFamilyName] = useState(false);

  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const currentMember =
    family?.users.find((u) => u.id === activeAccountId) ??
    family?.users.find((u) => u.userId === activeAccount?.userId);
  const isFamilyAdmin = currentMember?.familyRole === "admin";

  const handleStartEditFamilyName = () => {
    setFamilyNameInput(family?.name || "");
    setIsEditingFamilyName(true);
  };

  const handleCancelEditFamilyName = () => {
    setIsEditingFamilyName(false);
    setFamilyNameInput(family?.name || "");
  };

  const handleSaveFamilyName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!family) return;

    const trimmed = familyNameInput.trim();
    if (!trimmed) {
      toast.error("家族名を入力してください");
      return;
    }
    if (trimmed.length > 100) {
      toast.error("家族名は100文字以内で入力してください");
      return;
    }

    if (trimmed === family.name) {
      setIsEditingFamilyName(false);
      return;
    }

    setIsUpdatingFamilyName(true);
    try {
      await updateFamilyNameMut({
        accountId: activeAccountId || undefined,
        name: trimmed,
      });
      toast.success("家族名を変更しました");
      setIsEditingFamilyName(false);
    } catch (_error) {
      toast.error("家族名の変更に失敗しました");
    } finally {
      setIsUpdatingFamilyName(false);
    }
  };
  const adminCount =
    family?.users.filter((u) => u.familyRole === "admin").length ?? 0;

  const handleRoleChange = async (
    targetAccountId: Id<"users">,
    newRole: "admin" | "viewer",
  ) => {
    if (!activeAccountId) return;
    setIsUpdatingRole(true);
    try {
      await updateMemberRoleMut({
        accountId: activeAccountId as Id<"users">,
        targetAccountId,
        role: newRole,
      });
      toast.success(
        newRole === "admin"
          ? "ファミリー管理者に変更しました"
          : "メンバーに変更しました",
      );
    } catch (_error) {
      toast.error("ロールの変更に失敗しました");
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // キック実行用 state
  const [memberToKick, setMemberToKick] = useState<{
    id: Id<"users">;
    userId: string;
    displayName: string;
    email: string;
  } | null>(null);
  const [isKicking, setIsKicking] = useState(false);
  const [kickSuccessNotice, setKickSuccessNotice] = useState<{
    memberName: string;
  } | null>(null);

  // 被キックユーザーの Export Vault 解除用 state
  const [vaultPasscode, setVaultPasscode] = useState("");
  const [showVaultPasscode, setShowVaultPasscode] = useState(false);
  const [isVerifyingVault, setIsVerifyingVault] = useState(false);
  const [vaultUnlockedKey, setVaultUnlockedKey] = useState<CryptoKey | null>(
    null,
  );
  const [isAbandoningVault, setIsAbandoningVault] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  const [joinPasscode, setJoinPasscode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showJoinPasscode, setShowJoinPasscode] = useState(false);
  const [showRotatePasscodeForm, setShowRotatePasscodeForm] = useState(false);

  const { getMasterKey, requireUnlock } = usePasscode();
  const [isChangingFamily, setIsChangingFamily] = useState(
    !!search.inviteCode && family !== undefined && family !== null,
  );

  const handleKickMember = async () => {
    if (!memberToKick) return;
    setIsKicking(true);
    try {
      await kickMemberMut({
        accountId: activeAccountId || undefined,
        targetAccountId: memberToKick.id,
      });
      const kickedName = memberToKick.displayName;
      toast.success(`「${kickedName}」を家族から削除しました`);
      setMemberToKick(null);
      setKickSuccessNotice({ memberName: kickedName });
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      await router.invalidate();
    } catch (_error) {
      toast.error("メンバーの削除に失敗しました");
    } finally {
      setIsKicking(false);
    }
  };

  const handleVerifyVaultPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingExportVault) return;
    if (!vaultPasscode || vaultPasscode.length < 8) {
      toast.error("旧家族のパスコードを入力してください（8文字以上）");
      return;
    }

    setIsVerifyingVault(true);
    try {
      const wrappingKey = await deriveKeyFromPasscode(
        vaultPasscode,
        pendingExportVault.masterKeySalt,
        pendingExportVault.kdfIterations ?? LEGACY_PBKDF2_ITERATIONS,
        (pendingExportVault.cryptoVersion ?? LEGACY_KDF_VERSION) as KdfVersion,
      );
      const unwrapResult = await unwrapMasterKey(
        pendingExportVault.masterKeyEncrypted,
        pendingExportVault.masterKeyIv,
        wrappingKey,
      );
      setVaultUnlockedKey(unwrapResult);
      toast.success(
        "旧家族のパスコードを確認しました。新しい家族を作成または参加してください",
      );
    } catch (_error) {
      toast.error("パスコードが一致しません。もう一度お試しください");
    } finally {
      setIsVerifyingVault(false);
    }
  };

  const handleAbandonVault = async () => {
    setIsAbandoningVault(true);
    try {
      await abandonPendingExportVaultMut({
        accountId: activeAccountId || undefined,
      });
      toast.success("旧家族のデータを破棄しました");
      setShowAbandonConfirm(false);
      setVaultUnlockedKey(null);
      setVaultPasscode("");
      await router.invalidate();
    } catch (_error) {
      toast.error("データの破棄に失敗しました");
    } finally {
      setIsAbandoningVault(false);
    }
  };

  // 参加申請を送信する
  const handleSendJoinRequest = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        await createJoinRequestMut({
          accountId: activeAccountId || undefined,
          code: code.trim(),
        });
        toast.success(
          "参加申請を送信しました。家族メンバーの承認をお待ちください。",
        );
      } catch (error) {
        const rawMsg = error instanceof Error ? error.message : "";
        if (rawMsg.includes("Invalid invite code")) {
          toast.error("招待コードが無効です。内容をご確認ください。");
        } else if (rawMsg.includes("revoked")) {
          toast.error("この招待リンクは無効化されています。");
        } else if (rawMsg.includes("expired")) {
          toast.error("この招待リンクは有効期限が切れています。");
        } else if (rawMsg.includes("already a member")) {
          toast.error("すでにこの家族グループに参加しています。");
        } else if (rawMsg.includes("pending")) {
          toast.error("すでに申請中の参加リクエストがあります。");
        } else {
          toast.error("参加申請に失敗しました。もう一度お試しください。");
        }
      } finally {
        setIsLoading(false);
      }
    },
    [createJoinRequestMut, activeAccountId],
  );

  // 家族移行（承認後に移行を完了する。家族未所属ユーザーにも対応）
  const handleCompleteTransfer = useCallback(async () => {
    if (myJoinRequest?.status !== "approved") return;

    if (!joinPasscode || joinPasscode.length < 8) {
      toast.error("新しい家族のパスコードを入力してください（8文字以上）");
      return;
    }

    setIsLoading(true);
    let currentMigrationId: Id<"familyMigrations"> | null = null;
    try {
      // 1. prepare
      const { migrationId } = await prepareFamilyMigrationMut({
        accountId: activeAccountId || undefined,
        action: "join",
        familyId: myJoinRequest.familyId,
      });
      currentMigrationId = migrationId;

      // 2. 移行先の家族情報を取得
      const existingFamily = await convex.query(
        api.families.getFamilyInfoByFamilyId,
        {
          accountId: activeAccountId || undefined,
          familyId: myJoinRequest.familyId,
        },
      );
      if (
        !existingFamily.masterKeyEncrypted ||
        !existingFamily.masterKeyIv ||
        !existingFamily.masterKeySalt
      ) {
        throw new Error("既存家族の暗号化情報が不正です");
      }
      const wrappingKey = await deriveKeyFromPasscode(
        joinPasscode,
        existingFamily.masterKeySalt,
        existingFamily.kdfIterations ?? LEGACY_PBKDF2_ITERATIONS,
        (existingFamily.cryptoVersion ?? LEGACY_KDF_VERSION) as KdfVersion,
      );
      const newMasterKey = await unwrapMasterKey(
        existingFamily.masterKeyEncrypted,
        existingFamily.masterKeyIv,
        wrappingKey,
      );

      // 3. 所有するレコードの暗号化対象を取得し再ラップ
      const migrationData = await convex.query(
        api.families.getMigrationForEncryption,
        { migrationId },
      );
      let reEncryptedCredentials: Awaited<
        ReturnType<typeof reEncryptCredentials>
      > = [];
      if (migrationData.records.length > 0) {
        let oldMasterKey = vaultUnlockedKey ?? getMasterKey();
        if (!oldMasterKey) {
          const unlocked = await requireUnlock();
          if (!unlocked) {
            await abortFamilyMigrationMut({
              accountId: activeAccountId || undefined,
              migrationId,
            });
            currentMigrationId = null;
            return;
          }
          oldMasterKey = getMasterKey();
        }
        if (!oldMasterKey) {
          throw new Error("旧マスターキーが利用できません");
        }
        reEncryptedCredentials = await reEncryptCredentials(
          migrationData.records,
          oldMasterKey,
          newMasterKey,
        );
      }

      // 4. commit
      await commitFamilyMigrationMut({
        accountId: activeAccountId || undefined,
        migrationId,
        credentials: reEncryptedCredentials,
      });

      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("家族グループへの参加が完了しました");
      setIsChangingFamily(false);
      setVaultUnlockedKey(null);
      setVaultPasscode("");
      await router.invalidate();
      setShowFamilyCreatedTour(true);
    } catch (_error) {
      if (currentMigrationId) {
        try {
          await abortFamilyMigrationMut({
            accountId: activeAccountId || undefined,
            migrationId: currentMigrationId,
          });
        } catch (_abortError) {
          // abort失敗時は何もしない
        }
      }
      toast.error(
        "家族の変更に失敗しました（パスコードが間違っている可能性があります）",
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    myJoinRequest,
    joinPasscode,
    getMasterKey,
    requireUnlock,
    vaultUnlockedKey,
    prepareFamilyMigrationMut,
    convex,
    commitFamilyMigrationMut,
    abortFamilyMigrationMut,
    queryClient,
    router,
    activeAccountId,
  ]);

  const handleChangeFamily = async (
    action: "create" | "join",
    e: React.SubmitEvent,
    data: {
      createName: string;
      createPasscode: string;
      createPasscodeConfirm: string;
      joinCode: string;
    },
  ) => {
    e.preventDefault();
    if (action === "create") {
      const strengthModule = await import("@/utils/passcode-strength").catch(
        () => null,
      );
      if (!strengthModule) {
        toast.error(
          "パスコード強度の評価を読み込めませんでした。再試行してください",
        );
        return;
      }
      const { evaluatePasscodeStrength } = strengthModule;
      const strength = evaluatePasscodeStrength(data.createPasscode);
      if (!strength.isValid) {
        toast.error(strength.reasons[0]);
        return;
      }
      if (data.createPasscode !== data.createPasscodeConfirm) {
        toast.error("パスコードが一致しません");
        return;
      }

      setIsLoading(true);
      let currentMigrationId: Id<"familyMigrations"> | null = null;
      try {
        // 1. セッションまたはVaultに旧マスターキーがあるか確認、なければロック解除を要求
        let oldMasterKey = vaultUnlockedKey ?? getMasterKey();
        if (!oldMasterKey && family) {
          const unlocked = await requireUnlock();
          if (!unlocked) {
            setIsLoading(false);
            return;
          }
          oldMasterKey = getMasterKey();
        }

        // 2. 新しいマスターキーの準備
        const salt = generateSalt();
        const passcodeKey = await deriveKeyFromPasscode(
          data.createPasscode,
          salt,
          CURRENT_KDF_ITERATIONS,
          CURRENT_KDF_VERSION,
        );
        const newMasterKey = await generateMasterKey();
        const wrapped = await wrapMasterKey(newMasterKey, passcodeKey);

        // 3. prepare
        const { migrationId } = await prepareFamilyMigrationMut({
          accountId: activeAccountId || undefined,
          action: "create",
          name: data.createName,
          masterKeyEncrypted: wrapped.encrypted,
          masterKeyIv: wrapped.iv,
          masterKeySalt: salt,
          kdfIterations: CURRENT_KDF_ITERATIONS,
          cryptoVersion: CURRENT_KDF_VERSION,
        });
        currentMigrationId = migrationId;

        // 4. 所有するレコードの暗号化対象を取得し再ラップ
        const migrationData = await convex.query(
          api.families.getMigrationForEncryption,
          {
            accountId: activeAccountId || undefined,
            migrationId,
          },
        );
        let reEncryptedCredentials: Awaited<
          ReturnType<typeof reEncryptCredentials>
        > = [];
        if (migrationData.records.length > 0) {
          if (!oldMasterKey) {
            throw new Error("旧マスターキーが利用できません");
          }
          reEncryptedCredentials = await reEncryptCredentials(
            migrationData.records,
            oldMasterKey,
            newMasterKey,
          );
        }

        // 5. commit
        await commitFamilyMigrationMut({
          accountId: activeAccountId || undefined,
          migrationId,
          credentials: reEncryptedCredentials,
        });

        await queryClient.invalidateQueries({ queryKey: ["authUser"] });
        toast.success("家族グループを作成し、データを移行しました");
        setIsChangingFamily(false);
        setVaultUnlockedKey(null);
        setVaultPasscode("");
        await router.invalidate();
        setShowFamilyCreatedTour(true);
      } catch (_error) {
        if (currentMigrationId) {
          try {
            await abortFamilyMigrationMut({
              accountId: activeAccountId || undefined,
              migrationId: currentMigrationId,
            });
          } catch (_abortError) {
            // abort失敗時は何もしない
          }
        }
        toast.error("家族の変更に失敗しました");
      } finally {
        setIsLoading(false);
      }
    } else {
      // 「参加」の場合は、承認制のためリクエスト送信に切り替え
      await handleSendJoinRequest(data.joinCode.trim());
    }
  };

  // family がまだロード中の場合はペンディングコンポーネントを表示
  if (family === undefined) {
    return <FamilyPending />;
  }

  // キックされて Export Vault を保有し、まだ旧パスコード認証も放棄もしていない場合の専用画面
  if (!family && pendingExportVault && !vaultUnlockedKey) {
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (pendingExportVault.expiresAt - Date.now()) / (1000 * 60 * 60 * 24),
      ),
    );

    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
            家族管理
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
            <AccountSwitcher />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-red-500 shadow-border hover:bg-accent transition cursor-pointer"
            >
              ログアウト
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-card p-6 shadow-card transition-shadow space-y-6">
          <div className="flex items-start gap-4 border-b border-border pb-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-semibold tracking-geist-ui text-foreground">
                  家族グループ「{pendingExportVault.oldFamilyName}
                  」から削除されました
                </h2>
                <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                  持ち出し期限: あと {daysRemaining} 日
                </span>
              </div>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                あなたが「自分のみ」として登録していたデータは、旧家族のパスコードを使って新しい家族グループへ持ち出すことができます。
                なお、家族と共有していたデータは家族グループ側に残るため、持ち出すことはできません。
              </p>
            </div>
          </div>

          {/* 選択肢1: 旧パスコードでデータを持ち出す */}
          <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-5 space-y-4">
            <div className="flex items-center gap-2 text-foreground font-semibold text-[15px]">
              <KeyRound className="h-4 w-4 text-orange-500" />
              <span>旧家族のパスコードを入力してデータを引き継ぐ</span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              旧家族のパスコードを入力して確認が取れると、個人データを保持したまま新しい家族の作成や別家族への参加へ進めます。
            </p>

            <form onSubmit={handleVerifyVaultPasscode} className="space-y-3">
              <div>
                <label
                  htmlFor="vault-passcode-input"
                  className="block text-[13px] font-medium text-foreground mb-1"
                >
                  旧家族のパスコード
                </label>
                <div className="relative">
                  <input
                    id="vault-passcode-input"
                    type={showVaultPasscode ? "text" : "password"}
                    required
                    minLength={8}
                    value={vaultPasscode}
                    onChange={(e) => setVaultPasscode(e.target.value)}
                    placeholder="8文字以上"
                    className="w-full rounded-md bg-background p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVaultPasscode(!showVaultPasscode)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showVaultPasscode ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isVerifyingVault}
                className="flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-sm hover:bg-orange-600 transition disabled:opacity-50 cursor-pointer"
              >
                {isVerifyingVault && <Spinner className="h-4 w-4" />}
                パスコードを確認して引き継ぐ
              </button>
            </form>
          </div>

          {/* 選択肢2: データを持ち出さずに放棄して進む */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setShowAbandonConfirm(true)}
              className="text-[13px] text-muted-foreground hover:text-red-500 transition underline underline-offset-4 cursor-pointer"
            >
              データを持ち出さずに新規参加・作成する（データ破棄）
            </button>
          </div>
        </div>

        {/* 放棄確認モーダル */}
        <Dialog
          open={showAbandonConfirm}
          onOpenChange={(open) => {
            if (!isAbandoningVault) setShowAbandonConfirm(open);
          }}
        >
          <DialogContent
            className="bg-card shadow-card sm:max-w-md"
            showCloseButton={false}
          >
            <div className="flex items-center gap-3 text-red-500">
              <AlertTriangle className="h-6 w-6" />
              <DialogTitle className="text-[18px] text-foreground">
                旧家族のデータを破棄しますか？
              </DialogTitle>
            </div>
            <DialogDescription className="text-[14px] leading-relaxed">
              旧家族で登録していた「自分のみ」のデータを開く手段がなくなり、二度と閲覧できなくなります。この操作は取り消せません。
            </DialogDescription>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
              <button
                type="button"
                disabled={isAbandoningVault}
                onClick={() => setShowAbandonConfirm(false)}
                className="w-full sm:w-auto rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground hover:bg-accent transition cursor-pointer text-center"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={isAbandoningVault}
                onClick={handleAbandonVault}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-red-700 transition disabled:opacity-50 cursor-pointer"
              >
                {isAbandoningVault && <Spinner className="h-4 w-4" />}
                データを破棄して進む
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // 保留中・却下済み申請がある場合のUI（家族未所属ユーザー向け）
  if (!family && myJoinRequest) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
            家族管理
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
            <AccountSwitcher />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-red-500 shadow-border hover:bg-accent transition cursor-pointer"
            >
              ログアウト
            </button>
          </div>
        </div>

        {myJoinRequest.status === "pending" && (
          <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
                <Spinner className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
                  承認待ち
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  家族「{myJoinRequest.familyName}」への参加申請を送信しました
                </p>
              </div>
            </div>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
              家族メンバーがあなたの参加申請を承認するまでお待ちください。
              承認されると自動的に家族グループに参加できます。
            </p>
            <button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                setIsLoading(true);
                try {
                  await cancelJoinRequestMut({
                    accountId: activeAccountId || undefined,
                    requestId: myJoinRequest.id as Id<"joinRequests">,
                  });
                  toast.success("参加申請をキャンセルしました");
                } catch {
                  toast.error("キャンセルに失敗しました");
                } finally {
                  setIsLoading(false);
                }
              }}
              className="flex items-center justify-center w-full rounded-md bg-card px-4 py-2.5 text-[14px] font-medium text-red-500 shadow-border transition hover:bg-accent disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  キャンセル中...
                </>
              ) : (
                "参加申請をキャンセル"
              )}
            </button>
          </div>
        )}

        {myJoinRequest.status === "rejected" && (
          <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
                  参加申請が見送られました
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  家族「{myJoinRequest.familyName}
                  」への参加申請は承認されませんでした
                </p>
              </div>
            </div>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
              詳細については家族メンバーへ直接ご確認ください。
              別の家族グループに申請する場合は、下のボタンを押してください。
            </p>
            <button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                setIsLoading(true);
                try {
                  await dismissRejectedRequestMut({
                    accountId: activeAccountId || undefined,
                    requestId: myJoinRequest.id as Id<"joinRequests">,
                  });
                } catch {
                  toast.error("操作に失敗しました");
                } finally {
                  setIsLoading(false);
                }
              }}
              className="flex items-center justify-center w-full rounded-md bg-foreground px-4 py-2.5 text-[14px] font-medium text-background shadow-border transition hover:bg-foreground/90 disabled:opacity-50 cursor-pointer"
            >
              別の家族グループに申請する
            </button>
          </div>
        )}

        {myJoinRequest.status === "approved" && (
          <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
                  参加申請が承認されました！
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  家族「{myJoinRequest.familyName}」への参加が承認されました
                </p>
              </div>
            </div>
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
              家族グループのパスコードを入力して、参加を完了してください。
            </p>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="join-passcode-approved-input"
                  className="mb-1.5 block text-[14px] font-medium text-foreground"
                >
                  家族パスコード <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="join-passcode-approved-input"
                    type={showJoinPasscode ? "text" : "password"}
                    required
                    minLength={8}
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={joinPasscode}
                    onChange={(e) => setJoinPasscode(e.target.value)}
                    placeholder="8文字以上"
                    className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJoinPasscode(!showJoinPasscode)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  >
                    {showJoinPasscode ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  参加する家族のパスコードを入力してください。
                </p>
              </div>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleCompleteTransfer}
                className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    参加処理中...
                  </>
                ) : (
                  "家族への参加を完了する"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 家族移行中に承認を受けた場合のUI
  if (family && isChangingFamily && myJoinRequest?.status === "approved") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-6 sm:mb-8 flex items-center justify-between">
          <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
            家族管理
          </h1>
          <button
            type="button"
            onClick={() => setIsChangingFamily(false)}
            className="text-[13px] sm:text-[14px] px-3 py-1.5 bg-background rounded-md border shadow-sm text-foreground hover:bg-accent transition cursor-pointer"
          >
            キャンセル
          </button>
        </div>

        <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
              <Check className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
                移行先の家族から承認されました
              </h2>
              <p className="text-[13px] text-muted-foreground">
                家族「{myJoinRequest.familyName}
                」への移行を完了してください
              </p>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
            移行を完了するには、新しい家族のパスコードを入力してください。あなたが所有するパスワードヒントは自動的に再暗号化されます。
          </p>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="transfer-passcode-input"
                className="mb-1.5 block text-[14px] font-medium text-foreground"
              >
                新しい家族のパスコード <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showJoinPasscode ? "text" : "password"}
                  id="transfer-passcode-input"
                  required
                  minLength={8}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={joinPasscode}
                  onChange={(e) => setJoinPasscode(e.target.value)}
                  placeholder="8文字以上"
                  className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowJoinPasscode(!showJoinPasscode)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showJoinPasscode ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                移行先の家族のパスコードを入力してください。
              </p>
            </div>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleCompleteTransfer}
              className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  移行中...
                </>
              ) : (
                "移行を完了する"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 sm:mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-geist-h1 text-foreground">
          家族管理
        </h1>
        <div className="flex items-center gap-2 sm:gap-3 ml-auto shrink-0">
          {family ? (
            <Link
              to="/dashboard"
              className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition"
            >
              ダッシュボードへ
            </Link>
          ) : (
            <>
              <AccountSwitcher />
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition cursor-pointer"
              >
                ログアウト
              </button>
              <button
                type="button"
                onClick={() => setIsDeleteAccountModalOpen(true)}
                className="rounded-md bg-card px-3.5 py-1.5 sm:px-4 sm:py-2 text-[13px] sm:text-[14px] font-medium text-red-500 shadow-border hover:bg-red-500/10 transition cursor-pointer"
              >
                {isMultiAccount ? "アカウント削除" : "退会"}
              </button>
            </>
          )}
        </div>
      </div>

      {family && !isChangingFamily ? (
        <div
          data-testid="family-manager-section"
          className="rounded-lg bg-card p-6 shadow-card transition-shadow"
        >
          <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
            {isEditingFamilyName ? (
              <form
                onSubmit={handleSaveFamilyName}
                className="flex w-full flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3"
              >
                <input
                  type="text"
                  value={familyNameInput}
                  onChange={(e) => setFamilyNameInput(e.target.value)}
                  disabled={isUpdatingFamilyName}
                  aria-label="家族グループ名"
                  data-testid="family-name-edit-input"
                  className="w-full flex-1 rounded-md bg-background px-3 py-1.5 text-base sm:text-[14px] font-medium text-foreground shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      handleCancelEditFamilyName();
                    }
                  }}
                />
                <div className="flex items-center justify-end gap-1.5 shrink-0 sm:ml-auto">
                  <button
                    type="submit"
                    disabled={isUpdatingFamilyName || !familyNameInput.trim()}
                    data-testid="save-family-name-btn"
                    className="flex items-center gap-1 rounded-md bg-orange-500 px-3 py-1.5 text-[13px] font-medium text-white shadow-border hover:bg-orange-600 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingFamilyName && (
                      <Spinner className="h-3.5 w-3.5" />
                    )}
                    保存
                  </button>
                  <button
                    type="button"
                    disabled={isUpdatingFamilyName}
                    onClick={handleCancelEditFamilyName}
                    data-testid="cancel-family-name-btn"
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition cursor-pointer"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-1 items-center justify-between gap-2 w-full">
                <h2
                  data-testid="family-name-heading"
                  className="text-[18px] font-semibold tracking-geist-ui text-foreground"
                >
                  {family.name}
                </h2>
                {isFamilyAdmin && (
                  <button
                    type="button"
                    onClick={handleStartEditFamilyName}
                    data-testid="edit-family-name-btn"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer shrink-0 ml-auto"
                    title="家族名を変更"
                  >
                    <FileEdit className="h-3.5 w-3.5" />
                    <span>名前を変更</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <FamilyInviteSection
            familyName={family.name}
            familyInvites={familyInvites}
            activeAccountId={activeAccountId}
            isAdmin={isFamilyAdmin}
          />

          <div>
            <h3 className="mb-4 text-[14px] font-medium text-foreground">
              メンバー一覧
            </h3>
            <ul className="space-y-3">
              {family.users.map((u) => {
                const isCurrentAccount = activeAccountId === u.id;
                const isMyOtherAccount =
                  auth?.currentUser?.uid === u.userId && !isCurrentAccount;
                return (
                  <li
                    key={u.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md bg-card p-4 shadow-border-light"
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-foreground truncate">
                          {u.displayName || "名無し"}
                        </span>
                        {isCurrentAccount && (
                          <span className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium px-2 py-0.5 rounded-md shrink-0">
                            選択中のアカウント
                          </span>
                        )}
                        {isMyOtherAccount && (
                          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-md shrink-0">
                            あなたの別アカウント
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] text-muted-foreground truncate mt-0.5">
                        {u.email}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {!isCurrentAccount &&
                        !isMyOtherAccount &&
                        isFamilyAdmin && (
                          <button
                            type="button"
                            disabled={
                              u.familyRole === "admin" && adminCount <= 1
                            }
                            onClick={() =>
                              setMemberToKick({
                                id: u.id,
                                userId: u.userId,
                                displayName: u.displayName || "メンバー",
                                email: u.email,
                              })
                            }
                            className={`flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-md transition ${
                              u.familyRole === "admin" && adminCount <= 1
                                ? "text-muted-foreground/50 cursor-not-allowed"
                                : "text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                            }`}
                            title={
                              u.familyRole === "admin" && adminCount <= 1
                                ? "最後の管理者は削除できません"
                                : "家族グループから削除"
                            }
                            data-testid={`kick-member-btn-${u.id}`}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            削除
                          </button>
                        )}

                      {isFamilyAdmin ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isUpdatingRole}
                              className="h-8 gap-1 text-[12px] font-normal"
                              data-testid={`role-dropdown-btn-${u.id}`}
                            >
                              <span>
                                {u.familyRole === "admin"
                                  ? "ファミリー管理者"
                                  : "メンバー"}
                              </span>
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={
                                u.familyRole === "admin" || isUpdatingRole
                              }
                              onClick={() => handleRoleChange(u.id, "admin")}
                            >
                              ファミリー管理者にする
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                u.familyRole === "viewer" ||
                                (u.familyRole === "admin" && adminCount <= 1) ||
                                isUpdatingRole
                              }
                              onClick={() => handleRoleChange(u.id, "viewer")}
                            >
                              {u.familyRole === "admin" && adminCount <= 1
                                ? "最後の管理者のため変更不可"
                                : "メンバーにする"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-[12px] text-muted-foreground font-normal px-1">
                          {u.familyRole === "admin"
                            ? "ファミリー管理者"
                            : "メンバー"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 参加リクエスト一覧 */}
          {isFamilyAdmin && pendingRequests && pendingRequests.length > 0 && (
            <div className="mt-8 border-t border-border pt-6">
              <h3 className="mb-4 text-[14px] font-medium text-foreground flex items-center gap-2">
                参加リクエスト
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-orange-500 text-[11px] font-semibold text-white">
                  {pendingRequests.length}
                </span>
              </h3>
              <ul className="space-y-3">
                {pendingRequests.map((req) => (
                  <li
                    key={req.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md bg-orange-500/5 p-4 shadow-border-light border border-orange-500/20"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-[14px] font-medium text-foreground">
                        {req.displayName}
                      </span>
                      <span className="text-[12px] text-muted-foreground truncate">
                        {req.email}
                      </span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(req.createdAt).toLocaleString("ja-JP")}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          setIsLoading(true);
                          try {
                            await approveJoinRequestMut({
                              accountId: activeAccountId || undefined,
                              requestId: req.id as Id<"joinRequests">,
                            });
                            toast.success(
                              `${req.displayName} さんの参加を承認しました`,
                            );
                          } catch {
                            toast.error("承認に失敗しました");
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-[13px] font-medium text-white shadow-border transition hover:bg-green-700 disabled:opacity-50 cursor-pointer w-full sm:w-auto"
                      >
                        <Check className="h-3.5 w-3.5" />
                        承認
                      </button>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          setIsLoading(true);
                          try {
                            await rejectJoinRequestMut({
                              accountId: activeAccountId || undefined,
                              requestId: req.id as Id<"joinRequests">,
                            });
                            toast.success(
                              `${req.displayName} さんの参加を却下しました`,
                            );
                          } catch {
                            toast.error("却下に失敗しました");
                          } finally {
                            setIsLoading(false);
                          }
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-card px-4 py-2 text-[13px] font-medium text-red-500 shadow-border transition hover:bg-accent disabled:opacity-50 cursor-pointer w-full sm:w-auto"
                      >
                        <X className="h-3.5 w-3.5" />
                        却下
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 家族パスコードの変更 */}
          <PasscodeRotateSection
            family={family}
            activeAccountId={activeAccountId}
            activeAccount={activeAccount}
            isOpen={showRotatePasscodeForm}
            onToggle={() => setShowRotatePasscodeForm((prev) => !prev)}
            isAdmin={isFamilyAdmin}
          />

          {/* リカバリーキット（復旧コード） */}
          <div className="mt-8 border-t border-border pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <h3 className="text-[14px] font-medium text-foreground">
                    リカバリーキット
                  </h3>
                  {recoveryStatus?.hasRecoveryKit ? (
                    <span className="text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full border border-emerald-500/20">
                      発行済み
                    </span>
                  ) : (
                    <span className="text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium px-2 py-0.5 rounded-full border border-amber-500/20">
                      未発行（推奨）
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">
                  家族パスコードを忘れた場合に暗号鍵セットを安全に復旧するためのPDFキットを発行・保管します。
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                {isFamilyAdmin ? (
                  <button
                    type="button"
                    onClick={() => setIsRecoveryKitModalOpen(true)}
                    className="flex items-center justify-center gap-1.5 rounded-md bg-foreground px-3.5 py-2 sm:py-1.5 text-[13px] font-medium text-background shadow-sm hover:bg-foreground/90 transition cursor-pointer w-full sm:w-auto order-1 sm:order-2"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {recoveryStatus?.hasRecoveryKit
                      ? "再発行する"
                      : "キットを発行"}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground self-center sm:self-auto order-1 sm:order-2">
                    ※発行は管理者のみ
                  </span>
                )}
                <Link
                  to="/recovery"
                  className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 sm:py-1.5 text-[13px] font-medium text-foreground shadow-sm hover:bg-muted transition cursor-pointer w-full sm:w-auto order-2 sm:order-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  リカバリーキットから復旧
                </Link>
              </div>
            </div>

            {recoveryStatus?.hasRecoveryKit && recoveryStatus.issuedAt ? (
              <div className="rounded-md bg-muted/30 p-3.5 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="text-muted-foreground">
                    有効なリカバリーキット発行情報:
                  </div>
                  <div className="font-medium text-foreground">
                    発行日時:{" "}
                    {new Date(recoveryStatus.issuedAt).toLocaleString("ja-JP")}{" "}
                    （発行者: {recoveryStatus.issuerName}）
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  ※手元のPDF記載の発行日時と一致していることをご確認ください
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-amber-500/5 p-3.5 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-semibold">
                  ⚠️ 万が一のパスコード忘れに備えてください
                </p>
                <p>
                  PoohMaは完全なEnd-to-End暗号化を採用しているため、家族全員がパスコードを忘れると復旧できなくなります。金庫や安全な場所へのPDF保管を推奨します。
                </p>
              </div>
            )}
          </div>

          {/* リカバリーキット発行モーダル */}
          {family && isFamilyAdmin && (
            <RecoveryKitDialog
              isOpen={isRecoveryKitModalOpen}
              onClose={() => setIsRecoveryKitModalOpen(false)}
              familyName={family.name}
              issuerName={
                activeAccount?.displayName || activeAccount?.email || "管理者"
              }
              isReissue={recoveryStatus?.hasRecoveryKit ?? false}
            />
          )}

          {/* 家族のアクティビティログ */}
          <FamilyAuditLogsSection activeAccountId={activeAccount?._id} />

          <div className="mt-8 border-t border-border pt-6 text-center">
            <button
              type="button"
              onClick={() => setIsChangingFamily(true)}
              className="text-[14px] font-medium text-red-500 hover:text-red-600 transition underline underline-offset-4"
            >
              家族グループを変更・脱退する
            </button>
            <p className="mt-2 text-[12px] text-muted-foreground">
              ※あなたが所有するパスワードヒントは新しいグループのパスコードで再暗号化され、元の家族からは見られなくなります。
            </p>
          </div>
        </div>
      ) : (
        <FamilySetupView
          family={family}
          isChangingFamily={isChangingFamily}
          onCancelChangeFamily={() => setIsChangingFamily(false)}
          activeAccountId={activeAccountId}
          activeAccount={activeAccount}
          searchInviteCode={search.inviteCode}
          pendingExportVault={pendingExportVault}
          vaultUnlockedKey={vaultUnlockedKey}
          setVaultUnlockedKey={setVaultUnlockedKey}
          setVaultPasscode={setVaultPasscode}
          onAccountDeleteClick={() => setIsDeleteAccountModalOpen(true)}
          isMultiAccount={isMultiAccount}
          onFamilyCreated={() => setShowFamilyCreatedTour(true)}
          onChangeFamily={handleChangeFamily}
        />
      )}

      {/* アカウント削除・キック等ダイアログ */}
      <MemberActionDialogs
        isDeleteAccountModalOpen={isDeleteAccountModalOpen}
        setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
        isMultiAccount={isMultiAccount}
        activeAccountDisplayName={activeAccount?.displayName}
        isDeletingAccount={isDeletingAccount}
        isExporting={isExporting}
        handleExport={handleExport}
        handleDeleteAccount={handleDeleteAccount}
        memberToKick={memberToKick}
        setMemberToKick={setMemberToKick}
        isKicking={isKicking}
        handleKickMember={handleKickMember}
        kickSuccessNotice={kickSuccessNotice}
        setKickSuccessNotice={setKickSuccessNotice}
        onOpenRotatePasscode={() => {
          setShowRotatePasscodeForm(true);
          setTimeout(() => {
            document
              .getElementById("rotate-passcode-section")
              ?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        }}
      />

      {/* 家族作成・参加直後のダッシュボード誘導ツアーステップ */}
      <OnboardingTour
        steps={familyCreatedSteps}
        isActive={showFamilyCreatedTour}
        allowClose={true}
        onComplete={() => {
          setShowFamilyCreatedTour(false);
          navigate({
            to: "/dashboard",
            search: { onboarding: "modal" },
          });
        }}
        onClose={() => {
          setShowFamilyCreatedTour(false);
        }}
      />
    </div>
  );
}

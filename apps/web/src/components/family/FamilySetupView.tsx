import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery_experimental } from "convex/react";
import { Ban, Check, Eye, EyeOff } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { Spinner } from "@/components/ui/spinner";
import { MIN_PASSCODE_LENGTH } from "@/constants/passcode";
import {
  CURRENT_KDF_ITERATIONS,
  CURRENT_KDF_VERSION,
  deriveKeyFromPasscode,
  generateMasterKey,
  generateSalt,
  wrapMasterKey,
} from "@/lib/crypto";

const PasscodeStrengthMeter = lazy(() =>
  import("@/components/PasscodeStrengthMeter").then((m) => ({
    default: m.PasscodeStrengthMeter,
  })),
);

interface PendingExportVault {
  oldFamilyName?: string;
  expiresAt: number;
}

interface FamilySetupViewProps {
  family?: unknown;
  isChangingFamily?: boolean;
  onCancelChangeFamily?: () => void;
  activeAccountId?: Id<"users"> | null;
  activeAccount?: {
    id?: string;
    displayName?: string;
    name?: string;
  } | null;
  searchInviteCode?: string;
  pendingExportVault?: PendingExportVault | null;
  vaultUnlockedKey?: CryptoKey | null;
  setVaultUnlockedKey: (key: CryptoKey | null) => void;
  setVaultPasscode: (passcode: string) => void;
  onAccountDeleteClick?: () => void;
  isMultiAccount?: boolean;
  onFamilyCreated?: () => void;
  onChangeFamily?: (
    action: "create" | "join",
    e: React.SubmitEvent,
    data: {
      createName: string;
      createPasscode: string;
      createPasscodeConfirm: string;
      joinCode: string;
    },
  ) => Promise<void>;
}

export function FamilySetupView({
  family,
  isChangingFamily,
  onCancelChangeFamily,
  activeAccountId,
  activeAccount,
  searchInviteCode,
  pendingExportVault,
  vaultUnlockedKey,
  setVaultUnlockedKey,
  setVaultPasscode,
  onAccountDeleteClick,
  isMultiAccount,
  onFamilyCreated,
  onChangeFamily,
}: FamilySetupViewProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [createName, setCreateName] = useState("");
  const [createPasscode, setCreatePasscode] = useState("");
  const [createPasscodeConfirm, setCreatePasscodeConfirm] = useState("");
  const [showCreatePasscode, setShowCreatePasscode] = useState(false);
  const [showCreatePasscodeConfirm, setShowCreatePasscodeConfirm] =
    useState(false);
  const [joinCode, setJoinCode] = useState(searchInviteCode || "");
  const [isLoading, setIsLoading] = useState(false);

  const publicFamilyInfoQuery = useQuery_experimental({
    query: api.families.getFamilyPublicInfo,
    args: joinCode.trim()
      ? {
          accountId: activeAccountId || undefined,
          code: joinCode.trim(),
        }
      : "skip",
  });
  const publicFamilyInfo =
    publicFamilyInfoQuery.status === "success"
      ? publicFamilyInfoQuery.data
      : publicFamilyInfoQuery.status === "error"
        ? null
        : undefined;

  const createFamilyMut = useMutation(api.families.createFamily);
  const createJoinRequestMut = useMutation(api.families.createJoinRequest);

  const handleCreate = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (isChangingFamily && onChangeFamily) {
      if (isLoading) return;
      setIsLoading(true);
      try {
        await onChangeFamily("create", e, {
          createName,
          createPasscode,
          createPasscodeConfirm,
          joinCode,
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (isLoading) return;
    setIsLoading(true);
    try {
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
      const strength = evaluatePasscodeStrength(createPasscode);
      if (!strength.isValid) {
        toast.error(strength.reasons[0]);
        return;
      }
      if (createPasscode !== createPasscodeConfirm) {
        toast.error("パスコードが一致しません");
        return;
      }

      const salt = generateSalt();
      const passcodeKey = await deriveKeyFromPasscode(
        createPasscode,
        salt,
        CURRENT_KDF_ITERATIONS,
        CURRENT_KDF_VERSION,
      );
      const masterKey = await generateMasterKey();
      const wrapped = await wrapMasterKey(masterKey, passcodeKey);

      await createFamilyMut({
        accountId: activeAccountId || undefined,
        name: createName,
        masterKeyEncrypted: wrapped.encrypted,
        masterKeyIv: wrapped.iv,
        masterKeySalt: salt,
        kdfIterations: CURRENT_KDF_ITERATIONS,
        cryptoVersion: CURRENT_KDF_VERSION,
      });
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("家族グループを作成しました。");
      await router.invalidate();
      onFamilyCreated?.();
    } catch {
      toast.error("作成に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendJoinRequest = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (isChangingFamily && onChangeFamily) {
      if (isLoading) return;
      setIsLoading(true);
      try {
        await onChangeFamily("join", e, {
          createName,
          createPasscode,
          createPasscodeConfirm,
          joinCode,
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!joinCode.trim()) {
      toast.error("招待コードを入力してください");
      return;
    }
    setIsLoading(true);
    try {
      await createJoinRequestMut({
        code: joinCode.trim(),
        accountId: activeAccountId || undefined,
      });
      toast.success("参加申請を送信しました。承認をお待ちください。");
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      await router.invalidate();
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
        toast.error("参加申請の送信に失敗しました");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {!family ? (
        <>
          {vaultUnlockedKey && (
            <div className="rounded-lg bg-green-500/10 p-4 border border-green-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Check className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                <p className="text-[13px] text-green-700 dark:text-green-300">
                  旧家族「
                  <strong>{pendingExportVault?.oldFamilyName}</strong>
                  」のデータ引き継ぎ準備が完了しました。新しい家族を作成するか、招待から参加すると個人データが再暗号化されて引き継がれます。
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setVaultUnlockedKey(null);
                  setVaultPasscode("");
                }}
                className="text-[12px] text-muted-foreground hover:text-foreground underline shrink-0 cursor-pointer"
              >
                やり直す
              </button>
            </div>
          )}

          {searchInviteCode && (
            <div className="rounded-lg bg-orange-500/10 p-4 border border-orange-500/30 flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                招待リンクからのアクセス
              </span>
              <p className="text-sm font-medium text-foreground">
                招待コード「
                <code className="font-mono bg-background/80 px-1.5 py-0.5 rounded border">
                  {searchInviteCode}
                </code>
                」が自動入力されています。
              </p>
              <p className="text-xs text-muted-foreground">
                「
                <strong>
                  {activeAccount?.displayName ||
                    activeAccount?.name ||
                    "アカウント"}
                </strong>
                」で参加申請します。別のアカウントで参加したい場合は、ヘッダーのアカウント切り替えメニューをご利用ください。
              </p>
            </div>
          )}

          <div className="rounded-lg bg-orange-500/10 p-4 border border-orange-500/20">
            <h2 className="text-[16px] font-semibold text-orange-700 dark:text-orange-400 mb-2">
              はじめに：家族グループの作成・参加
            </h2>
            <p className="text-[14px] text-orange-700/80 dark:text-orange-400/80 leading-relaxed">
              PoohMaは家族間でのアカウント情報の共有を前提としています。
              <br />
              ダッシュボードやその他の機能を利用するには、まず家族グループを作成するか、既存の家族グループに参加してください。
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20 mb-6">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-[16px] font-semibold text-red-700 dark:text-red-400">
              家族グループの変更
            </h2>
            {onCancelChangeFamily && (
              <button
                type="button"
                onClick={onCancelChangeFamily}
                className="text-[14px] px-3 py-1 bg-background rounded-md border shadow-sm text-foreground hover:bg-accent transition"
              >
                キャンセル
              </button>
            )}
          </div>
          <p className="text-[14px] text-red-700/80 dark:text-red-400/80 leading-relaxed">
            新しい家族を作成するか、別の家族の招待コードを入力して参加申請を送信してください。
            <br />
            <strong>注意:</strong>{" "}
            あなたが所有するパスワードヒントは、自動的に新しいグループ用に再暗号化されます。現在のパスコードの入力が求められる場合があります。
          </p>
        </div>
      )}

      {/* 操作対象アカウントの明示 */}
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground shrink-0">
            操作対象アカウント:
          </span>
          <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-none">
            {activeAccount?.displayName || activeAccount?.name || "アカウント"}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <AccountSwitcher />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 家族を作成 */}
        <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
          <h2 className="mb-6 text-[18px] font-semibold tracking-geist-ui text-foreground">
            家族グループを作成
          </h2>
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label
                htmlFor="family-name-input"
                className="mb-1.5 block text-[14px] font-medium text-foreground"
              >
                グループ名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="family-name-input"
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="例: 田中家"
                className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
            <div>
              <label
                htmlFor="family-passcode-input"
                className="mb-1.5 block text-[14px] font-medium text-foreground"
              >
                パスコード <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCreatePasscode ? "text" : "password"}
                  id="family-passcode-input"
                  required
                  minLength={MIN_PASSCODE_LENGTH}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={createPasscode}
                  onChange={(e) => setCreatePasscode(e.target.value)}
                  placeholder={`${MIN_PASSCODE_LENGTH}文字以上`}
                  className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePasscode(!showCreatePasscode)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showCreatePasscode ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {createPasscode.length > 0 && (
                <Suspense fallback={null}>
                  <PasscodeStrengthMeter passcode={createPasscode} />
                </Suspense>
              )}
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                暗号化に使用します。忘れるとヒントを復旧できません。
              </p>
            </div>
            <div>
              <label
                htmlFor="family-passcode-confirm-input"
                className="mb-1.5 block text-[14px] font-medium text-foreground"
              >
                パスコード（確認） <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCreatePasscodeConfirm ? "text" : "password"}
                  id="family-passcode-confirm-input"
                  required
                  minLength={8}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={createPasscodeConfirm}
                  onChange={(e) => setCreatePasscodeConfirm(e.target.value)}
                  placeholder="もう一度入力"
                  className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowCreatePasscodeConfirm(!showCreatePasscodeConfirm)
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showCreatePasscodeConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  作成中...
                </>
              ) : (
                "作成する"
              )}
            </button>
          </form>
        </div>

        {/* 家族に参加 */}
        <div className="rounded-lg bg-card p-6 shadow-card transition-shadow flex flex-col">
          <h2 className="mb-6 text-[18px] font-semibold tracking-geist-ui text-foreground">
            既存の家族に参加
          </h2>
          <form
            onSubmit={handleSendJoinRequest}
            className="space-y-5 flex-1 flex flex-col justify-between"
          >
            <div>
              <label
                htmlFor="family-join-input"
                className="mb-1.5 block text-[14px] font-medium text-foreground"
              >
                招待コード
              </label>
              <input
                type="text"
                id="family-join-input"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="招待コードを入力"
                className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] font-mono tracking-wider shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
              {joinCode.trim().length > 0 && (
                <div className="mt-2 rounded-md bg-muted/40 p-2.5 border border-border text-xs">
                  {publicFamilyInfo === undefined ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Spinner className="h-3 w-3" />
                      <span>招待コードを確認中...</span>
                    </div>
                  ) : publicFamilyInfo ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 font-medium text-green-600 dark:text-green-400">
                        <Check className="h-3.5 w-3.5" />
                        <span>
                          参加先: <strong>{publicFamilyInfo.name}</strong>
                        </span>
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        有効期限:{" "}
                        {new Date(publicFamilyInfo.expiresAt).toLocaleString(
                          "ja-JP",
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-red-500">
                      <Ban className="h-3.5 w-3.5" />
                      <span>無効または期限切れの招待コードです</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              招待コードを入力して参加申請を送信します。家族メンバーの承認後に参加が完了します。
            </p>
            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center w-full rounded-md bg-foreground px-4 py-2.5 text-[14px] font-medium text-background shadow-border transition hover:bg-foreground/90 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  送信中...
                </>
              ) : (
                "参加申請を送信"
              )}
            </button>
          </form>
        </div>

        {/* 未参加ユーザー向け退会導線 */}
        {onAccountDeleteClick && !family && (
          <div className="mt-8 border-t border-border pt-6 text-center md:col-span-2">
            <button
              type="button"
              onClick={onAccountDeleteClick}
              className="text-[13px] font-medium text-red-500 hover:text-red-600 transition underline underline-offset-4 cursor-pointer"
            >
              {isMultiAccount
                ? "このアカウントの削除はこちら"
                : "アカウントの削除・退会はこちら"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

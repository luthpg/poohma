import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePasscode } from "@/components/PasscodeProvider";
import { Spinner } from "@/components/ui/spinner";
import { MIN_PASSCODE_LENGTH } from "@/constants/passcode";
import {
  isBiometricEnabledForUser,
  updateBiometricPasscode,
} from "@/lib/biometric";
import {
  CURRENT_KDF_ITERATIONS,
  CURRENT_KDF_VERSION,
  deriveKeyFromPasscode,
  generateSalt,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";
import { auth } from "@/utils/firebase";

const PasscodeStrengthMeter = lazy(() =>
  import("@/components/PasscodeStrengthMeter").then((m) => ({
    default: m.PasscodeStrengthMeter,
  })),
);

interface PasscodeRotateSectionProps {
  family:
    | {
        masterKeyEncrypted?: string;
        masterKeyIv?: string;
        masterKeySalt?: string;
      }
    | null
    | undefined;
  activeAccountId?: Id<"users"> | null;
  activeAccount?: { id?: string; displayName?: string } | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function PasscodeRotateSection({
  family,
  activeAccountId,
  activeAccount,
  isOpen,
  onToggle,
}: PasscodeRotateSectionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { unlock, getMasterKey } = usePasscode();
  const rotatePasscodeMut = useMutation(api.families.rotatePasscode);

  const [currentPasscode, setCurrentPasscode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [newPasscodeConfirm, setNewPasscodeConfirm] = useState("");
  const [isChangingPasscode, setIsChangingPasscode] = useState(false);
  const [showCurrentPasscode, setShowCurrentPasscode] = useState(false);
  const [showNewPasscode, setShowNewPasscode] = useState(false);
  const [showNewPasscodeConfirm, setShowNewPasscodeConfirm] = useState(false);

  const resetForm = () => {
    setCurrentPasscode("");
    setNewPasscode("");
    setNewPasscodeConfirm("");
  };

  const handleChangePasscode = async (e: React.SubmitEvent) => {
    e.preventDefault();
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
    const strength = evaluatePasscodeStrength(newPasscode);
    if (!strength.isValid) {
      toast.error(strength.reasons[0]);
      return;
    }
    if (newPasscode !== newPasscodeConfirm) {
      toast.error("新しいパスコードが一致しません");
      return;
    }
    if (newPasscode === currentPasscode) {
      toast.error("現在のパスコードと異なるものを設定してください");
      return;
    }
    if (
      !family?.masterKeyEncrypted ||
      !family.masterKeyIv ||
      !family.masterKeySalt
    ) {
      toast.error("家族の暗号化情報が初期化されていません");
      return;
    }

    setIsChangingPasscode(true);
    try {
      const unlocked = await unlock(currentPasscode);
      if (!unlocked) {
        return;
      }
      const masterKey = getMasterKey();
      if (!masterKey) {
        toast.error("暗号データの読み込みに失敗しました");
        return;
      }

      const previousMasterKeyEncrypted = family.masterKeyEncrypted;
      const newSalt = generateSalt();
      const newWrappingKey = await deriveKeyFromPasscode(
        newPasscode,
        newSalt,
        CURRENT_KDF_ITERATIONS,
        CURRENT_KDF_VERSION,
      );
      const wrapped = await wrapMasterKey(masterKey, newWrappingKey);

      try {
        await unwrapMasterKey(wrapped.encrypted, wrapped.iv, newWrappingKey);
      } catch (_error) {
        toast.error("鍵の再暗号化に失敗しました。もう一度お試しください");
        return;
      }

      await rotatePasscodeMut({
        accountId: activeAccountId || undefined,
        previousMasterKeyEncrypted,
        masterKeyEncrypted: wrapped.encrypted,
        masterKeyIv: wrapped.iv,
        masterKeySalt: newSalt,
        kdfIterations: CURRENT_KDF_ITERATIONS,
        cryptoVersion: CURRENT_KDF_VERSION,
      });

      const targetId = activeAccount?.id || (auth?.currentUser?.uid ?? "");
      if (targetId) {
        const hasBiometric = await isBiometricEnabledForUser(targetId);
        if (hasBiometric) {
          try {
            await updateBiometricPasscode(targetId, newPasscode);
          } catch (_error) {
            toast.error(
              "生体認証のロック解除情報の更新に失敗しました。設定画面から再設定してください。",
            );
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      await router.invalidate();
      toast.success("家族パスコードを変更しました");
      resetForm();
      onToggle();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("CONFLICT")) {
        toast.error(
          "他のご家族の操作と重なりました。画面を再読み込みしてやり直してください",
        );
      } else {
        toast.error("パスコードの変更に失敗しました");
      }
    } finally {
      setIsChangingPasscode(false);
    }
  };

  return (
    <div
      id="rotate-passcode-section"
      className="mt-8 border-t border-border pt-6"
    >
      <div className="mb-4 space-y-1">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h3 className="text-[14px] font-medium text-foreground">
            家族パスコードの変更
          </h3>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition shrink-0 cursor-pointer"
          >
            {isOpen ? "閉じる" : "パスコード変更"}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          家族グループやメンバー構成は変更せず、パスコードのみを変更します。
        </p>
      </div>

      {isOpen && (
        <div className="rounded-md bg-muted/30 p-4 border border-border/50 space-y-4 mt-3">
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            パスコード変更後、
            <strong>
              他の家族メンバーおよび別端末では次回新パスコードでのロック解除が必要
            </strong>
            となり、生体認証をご利用の場合は再登録が必要になります。
          </p>
          <form onSubmit={handleChangePasscode} className="space-y-3">
            <div>
              <label
                htmlFor="rotate-current-passcode"
                className="block text-[13px] font-medium text-foreground mb-1"
              >
                現在のパスコード <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPasscode ? "text" : "password"}
                  id="rotate-current-passcode"
                  required
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={currentPasscode}
                  onChange={(e) => setCurrentPasscode(e.target.value)}
                  disabled={isChangingPasscode}
                  placeholder="現在のパスコード"
                  className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPasscode(!showCurrentPasscode)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPasscode ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="rotate-new-passcode"
                className="block text-[13px] font-medium text-foreground mb-1"
              >
                新しいパスコード（{MIN_PASSCODE_LENGTH}文字以上）{" "}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPasscode ? "text" : "password"}
                  id="rotate-new-passcode"
                  required
                  minLength={MIN_PASSCODE_LENGTH}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  disabled={isChangingPasscode}
                  placeholder={`新しいパスコード（${MIN_PASSCODE_LENGTH}文字以上）`}
                  className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPasscode(!showNewPasscode)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showNewPasscode ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {newPasscode && (
                <div className="mt-2">
                  <Suspense fallback={null}>
                    <PasscodeStrengthMeter passcode={newPasscode} />
                  </Suspense>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="rotate-new-passcode-confirm"
                className="block text-[13px] font-medium text-foreground mb-1"
              >
                新しいパスコード（確認） <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPasscodeConfirm ? "text" : "password"}
                  id="rotate-new-passcode-confirm"
                  required
                  minLength={MIN_PASSCODE_LENGTH}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={newPasscodeConfirm}
                  onChange={(e) => setNewPasscodeConfirm(e.target.value)}
                  disabled={isChangingPasscode}
                  placeholder="新しいパスコード（確認）"
                  className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] pr-10 shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowNewPasscodeConfirm(!showNewPasscodeConfirm)
                  }
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                >
                  {showNewPasscodeConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  onToggle();
                  resetForm();
                }}
                className="w-full sm:w-auto rounded-md border border-border bg-background px-4 py-2 text-[13px] font-medium shadow-sm transition hover:bg-accent text-foreground cursor-pointer text-center"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={
                  isChangingPasscode ||
                  !currentPasscode ||
                  !newPasscode ||
                  !newPasscodeConfirm
                }
                className="w-full sm:w-auto flex items-center justify-center rounded-md bg-foreground px-6 py-2 text-[13px] font-medium text-background shadow-lg transition hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isChangingPasscode ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    変更中...
                  </>
                ) : (
                  "パスコードを変更する"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export const PasscodeRotateModal = PasscodeRotateSection;

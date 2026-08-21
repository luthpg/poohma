import { useRouteContext } from "@tanstack/react-router";
import { Eye, EyeOff, Fingerprint } from "lucide-react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useAccount } from "@/hooks/useAccount";
import {
  AUTOLOCK_DEFAULT_MINUTES,
  getAutolockTimeoutMinutes,
  setAutolockTimeoutMinutes,
  useInactivityLock,
} from "@/hooks/useInactivityLock";
import {
  decryptPasscodeWithBiometrics,
  disableBiometricUnlock,
  isBiometricEnabledForUser,
  isBiometricSupported,
  registerBiometricUnlock,
} from "@/lib/biometric";
import {
  decrypt,
  deriveKeyFromPasscode,
  encrypt,
  generateDEK,
  unwrapDEK,
  unwrapMasterKey,
  wrapDEK,
} from "@/lib/crypto";

interface PasscodeContextType {
  masterKey: CryptoKey | null;
  getMasterKey: () => CryptoKey | null;
  unlock: (passcode: string) => Promise<boolean>;
  requireUnlock: () => Promise<boolean>;
  decryptHint: (
    encrypted: string,
    iv: string,
    dekEncrypted?: string,
    dekIv?: string,
  ) => Promise<string>;
  encryptHint: (text: string) => Promise<{
    encrypted: string;
    iv: string;
    dekEncrypted: string;
    dekIv: string;
  }>;
  isLocked: boolean;
  disableBiometric: () => Promise<void>;
  lockTimeoutMinutes: number;
  setLockTimeoutMinutes: (minutes: number) => void;
}

const PasscodeContext = createContext<PasscodeContextType | null>(null);

export function PasscodeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useRouteContext({ from: "__root__" });
  const { activeAccount, activeAccountId } = useAccount();
  const currentAccount = activeAccount || user;

  const passcodeInputRef = useRef<HTMLInputElement>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const [passcode, setPasscode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const resolvePromiseRef = useRef<((value: boolean) => void) | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const lockoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // オートロック設定
  const [lockTimeoutMinutes, setLockTimeoutMinutesState] = useState(
    AUTOLOCK_DEFAULT_MINUTES,
  );

  // マウント時に localStorage から読み込み
  useEffect(() => {
    setLockTimeoutMinutesState(getAutolockTimeoutMinutes());

    // アンマウント時に指数バックオフ対策タイマーをクリア
    return () => {
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
    };
  }, []);

  const handleSetLockTimeoutMinutes = useCallback((minutes: number) => {
    setAutolockTimeoutMinutes(minutes);
    setLockTimeoutMinutesState(minutes);
  }, []);

  // オートロック: masterKey がセット済みの場合にタイマー稼働
  useInactivityLock({
    onLock: useCallback(() => {
      setMasterKey(null);
      masterKeyRef.current = null;
      toast.info("セキュリティのため自動ロックされました");
    }, []),
    enabled: masterKey != null && lockTimeoutMinutes > 0,
    timeoutMinutes: lockTimeoutMinutes,
  });

  // 生体認証ステート
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [shouldRegisterBiometric, setShouldRegisterBiometric] = useState(false);
  const [isBiometricAuthenticating, setIsBiometricAuthenticating] =
    useState(false);

  const targetUserId = activeAccount?.id || currentAccount?.id;

  // アカウント変更世代カウンタ（非同期 unlock 処理中にアカウントが切り替わった場合の競合防止）
  const accountGenerationRef = useRef(0);
  // 前回の familyId を追跡（familyId が実際に変わった場合のみ failed attempts をリセットするため）
  const prevFamilyIdRef = useRef<string | null | undefined>(
    currentAccount?.familyId,
  );

  // 生体認証のサポート状況と有効状態をチェック
  useEffect(() => {
    let isMounted = true;
    const checkBiometrics = async () => {
      const supported = await isBiometricSupported();
      if (!isMounted) return;
      setBiometricSupported(supported);

      if (supported && targetUserId) {
        const enabled = await isBiometricEnabledForUser(targetUserId);
        if (!isMounted) return;
        setBiometricEnabled(enabled);
      } else {
        if (!isMounted) return;
        setBiometricEnabled(false);
      }
    };

    checkBiometrics();
    return () => {
      isMounted = false;
    };
  }, [targetUserId]);

  const unlock = useCallback(
    async (code: string) => {
      if (
        !currentAccount?.family?.masterKeyEncrypted ||
        !currentAccount?.family?.masterKeyIv ||
        !currentAccount?.family?.masterKeySalt
      ) {
        return false;
      }

      const startGen = accountGenerationRef.current;

      try {
        setIsUnlocking(true);
        const wrappingKey = await deriveKeyFromPasscode(
          code,
          currentAccount.family.masterKeySalt,
        );
        const key = await unwrapMasterKey(
          currentAccount.family.masterKeyEncrypted,
          currentAccount.family.masterKeyIv,
          wrappingKey,
        );

        // 処理中にアカウントが切り替わっていた場合は古い鍵を設定せず破棄
        if (accountGenerationRef.current !== startGen) {
          return false;
        }

        masterKeyRef.current = key;
        setMasterKey(key);

        return true;
      } catch (error) {
        console.error("Unlock failed:", error);
        toast.error("パスコードが正しくないか、エラーが発生しました。");
        return false;
      } finally {
        setIsUnlocking(false);
      }
    },
    [currentAccount],
  );

  const decryptHint = useCallback(
    async (
      encrypted: string,
      iv: string,
      dekEncrypted?: string,
      dekIv?: string,
    ) => {
      const masterKey = masterKeyRef.current;
      if (!masterKey) throw new Error("Master key is not available");

      // エンベロープ暗号方式: DEKが提供されていればDEKを復号して使う、なければ（過去データ）マスターキーを直接使う
      let decryptionKey = masterKey;
      if (dekEncrypted && dekIv) {
        decryptionKey = await unwrapDEK(dekEncrypted, dekIv, masterKey);
      }

      return await decrypt(encrypted, iv, decryptionKey);
    },
    [],
  );

  const encryptHint = useCallback(async (text: string) => {
    const masterKey = masterKeyRef.current;
    if (!masterKey) throw new Error("Master key is not available");

    // エンベロープ暗号方式: 新しいDEKを生成し、DEKでデータを暗号化、DEKをマスターキーでラップ
    const dek = await generateDEK();
    const dataEncrypted = await encrypt(text, dek);
    const dekWrapped = await wrapDEK(dek, masterKey);

    return {
      encrypted: dataEncrypted.encrypted,
      iv: dataEncrypted.iv,
      dekEncrypted: dekWrapped.encrypted,
      dekIv: dekWrapped.iv,
    };
  }, []);

  const isLocked = !!currentAccount?.familyId && !masterKey;

  const requireUnlock = useCallback(async () => {
    if (!isLocked) return true;
    if (!currentAccount?.family?.masterKeyEncrypted) return false;

    setIsPromptOpen(true);
    return new Promise<boolean>((resolve) => {
      resolvePromiseRef.current = resolve;
    });
  }, [isLocked, currentAccount]);

  const disableBiometric = useCallback(async () => {
    if (!targetUserId) return;
    await disableBiometricUnlock(targetUserId);
    setBiometricEnabled(false); // グローバルなステートもオフにする
    // ロック解除した状態をリセット
    setMasterKey(null);
    masterKeyRef.current = null;
  }, [targetUserId]);

  const handleUnlockSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (isLockedOut) return;

    const success = await unlock(passcode);
    if (success) {
      setFailedAttempts(0);
      setIsLockedOut(false);
      setIsPromptOpen(false);

      // パスコード認証成功後に生体認証登録を行う
      if (shouldRegisterBiometric && targetUserId && currentAccount) {
        try {
          await registerBiometricUnlock(
            targetUserId,
            passcode,
            `${currentAccount.email}${currentAccount?.family != null ? ` [${currentAccount.family.name}]` : ""}`,
          );
          setBiometricEnabled(true);
          toast.success("指紋/FaceIDでのロック解除を有効にしました。");
        } catch (error) {
          console.error("Biometric registration failed:", error);
          if (error instanceof Error && error.name !== "NotAllowedError") {
            toast.error("生体認証の登録に失敗しました。");
          }
        }
      }

      setPasscode("");
      setShouldRegisterBiometric(false);
      if (resolvePromiseRef.current) {
        resolvePromiseRef.current(true);
        resolvePromiseRef.current = null;
      }
    } else {
      const nextAttempts = failedAttempts + 1;
      setFailedAttempts(nextAttempts);
      if (nextAttempts >= 3) {
        const delayMs = Math.min(2 ** (nextAttempts - 3) * 1000, 30000);
        setIsLockedOut(true);
        toast.error(
          `試行制限中です。${Math.ceil(delayMs / 1000)}秒間再試行できません。`,
        );
        if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
        lockoutTimerRef.current = setTimeout(() => {
          setIsLockedOut(false);
        }, delayMs);
      }
    }
  };

  const handleBiometricUnlock = async () => {
    if (!targetUserId) return;
    try {
      setIsBiometricAuthenticating(true);
      // 生体認証開始時の世代とターゲットアカウントを保存
      const startGen = accountGenerationRef.current;
      const startTargetUserId = targetUserId;

      const decryptedPasscode =
        await decryptPasscodeWithBiometrics(targetUserId);

      // 復号後、unlock 呼び出し前に世代とアカウントIDを再検証
      if (
        accountGenerationRef.current !== startGen ||
        targetUserId !== startTargetUserId
      ) {
        // アカウントが切り替わっている場合は処理を中断
        return;
      }

      const success = await unlock(decryptedPasscode);
      if (success) {
        setIsPromptOpen(false);
        setPasscode("");
        setFailedAttempts(0);
        setIsLockedOut(false);
        if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
        if (resolvePromiseRef.current) {
          resolvePromiseRef.current(true);
          resolvePromiseRef.current = null;
        }
      }
    } catch (error) {
      console.error("Biometric unlock failed:", error);
      if (error instanceof Error && error.name !== "NotAllowedError") {
        toast.error("生体認証によるロック解除に失敗しました。");
      }
    } finally {
      setIsBiometricAuthenticating(false);
    }
  };

  const handleCancelUnlock = () => {
    setIsPromptOpen(false);
    setPasscode("");
    setShouldRegisterBiometric(false);
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(false);
      resolvePromiseRef.current = null;
    }
  };

  const getMasterKey = useCallback(() => {
    return masterKeyRef.current;
  }, []);

  useEffect(() => {
    // パスコード入力ダイアログが表示されていて、かつ生体認証が利用できない場合は、パスコード入力欄にフォーカスする
    if (isPromptOpen && (!biometricSupported || !biometricEnabled)) {
      passcodeInputRef.current?.focus();
    }
  }, [isPromptOpen, biometricEnabled, biometricSupported]);

  // アカウントや家族IDが変わったら（アカウント切り替え・ログアウトなど）世代を更新し鍵をクリアする
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear key when account or familyId changes
  useEffect(() => {
    accountGenerationRef.current += 1;
    setMasterKey(null);
    masterKeyRef.current = null;

    // familyId が実際に変わった場合のみ failed attempts と lockout 状態をリセット
    const currentFamilyId = currentAccount?.familyId;
    if (prevFamilyIdRef.current !== currentFamilyId) {
      setFailedAttempts(0);
      setIsLockedOut(false);
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
      prevFamilyIdRef.current = currentFamilyId;
    }
  }, [activeAccountId, currentAccount?.familyId]);

  return (
    <PasscodeContext.Provider
      value={{
        masterKey,
        getMasterKey,
        unlock,
        requireUnlock,
        decryptHint,
        encryptHint,
        isLocked,
        disableBiometric,
        lockTimeoutMinutes,
        setLockTimeoutMinutes: handleSetLockTimeoutMinutes,
      }}
    >
      {children}

      <Dialog open={isPromptOpen} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight">
              家族パスコードの入力
            </DialogTitle>
            <DialogDescription>
              暗号化されたデータの読み書きを行うには、
              {currentAccount?.family?.name || "家族"}
              のパスコードを入力してください。
            </DialogDescription>
            {lockTimeoutMinutes > 0 && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                無操作状態が{lockTimeoutMinutes}
                分を超えると自動ロックされます。
              </p>
            )}
          </DialogHeader>
          <form onSubmit={handleUnlockSubmit} className="space-y-4 pt-4">
            <div className="relative">
              <input
                ref={passcodeInputRef}
                type={showPasscode ? "text" : "password"}
                className="w-full rounded-lg border bg-background px-4 py-3 text-lg pr-12 focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="パスコード"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                disabled={isUnlocking || isBiometricAuthenticating}
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground hover:text-foreground"
                disabled={isUnlocking || isBiometricAuthenticating}
                // inputにフォーカスがある場合のみ、クリック時のフォーカス移動をキャンセルさせる
                onMouseDown={(e) => {
                  if (document.activeElement === passcodeInputRef.current) {
                    e.preventDefault();
                  }
                }}
              >
                {showPasscode ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* 生体認証サポートあり＆未有効化の場合の登録チェックボックス */}
            {biometricSupported && !biometricEnabled && (
              <div className="flex flex-col gap-2">
                <label
                  className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none"
                  // inputにフォーカスがある場合のみ、クリック時のフォーカス移動をキャンセルさせる
                  onMouseDown={(e) => {
                    if (document.activeElement === passcodeInputRef.current) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={shouldRegisterBiometric}
                    onChange={(e) =>
                      setShouldRegisterBiometric(e.target.checked)
                    }
                    disabled={isUnlocking || isBiometricAuthenticating}
                    className="rounded border-border bg-background checked:bg-primary text-primary focus:ring-primary/20 h-4 w-4"
                  />
                  <span>次回から指紋/FaceIDでロック解除する</span>
                </label>
                <details className="text-xs text-muted-foreground/80 cursor-pointer select-none">
                  <summary className="hover:text-foreground transition-colors">
                    iPhoneでお使いになれない場合
                  </summary>
                  <div className="mt-2 p-3 rounded-lg bg-muted/50 space-y-2 leading-relaxed">
                    <p>
                      <strong>① 自動入力の設定チェック</strong>
                      <br />
                      iPhoneの「設定」アプリ
                      ＞「パスワード」＞「パスワードのオプション」で、
                      <strong>「パスキーとパスワードを自動入力」をオン</strong>
                      にしてください。
                    </p>
                    <p>
                      <strong>② タブの種類をチェック</strong>
                      <br />
                      Safariの「プライベートブラウズ」では動かない場合があります。通常のタブでお試しください。
                    </p>
                  </div>
                </details>
              </div>
            )}

            {/* 生体認証が有効な場合のクイック解除ボタン */}
            {biometricEnabled && (
              <button
                type="button"
                onClick={handleBiometricUnlock}
                disabled={isUnlocking || isBiometricAuthenticating}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 text-primary py-3 font-semibold transition-all duration-200 shadow-sm disabled:opacity-50"
              >
                {isBiometricAuthenticating ? (
                  <>
                    <Spinner className="h-5 w-5 text-primary" />
                    生体認証を検証中...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-5 w-5" />
                    指紋 / FaceID でロック解除
                  </>
                )}
              </button>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelUnlock}
                className="flex-1 rounded-lg border bg-background py-3 font-semibold text-foreground shadow-sm transition-all hover:bg-muted disabled:opacity-50"
                disabled={isUnlocking || isBiometricAuthenticating}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="flex-1 flex items-center justify-center rounded-lg bg-primary py-3 font-semibold text-primary-foreground shadow-lg transition-all hover:opacity-90 disabled:opacity-50"
                disabled={
                  isUnlocking ||
                  !passcode ||
                  isBiometricAuthenticating ||
                  isLockedOut
                }
              >
                {isUnlocking ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4 text-primary-foreground" />
                    処理中...
                  </>
                ) : (
                  "ロック解除"
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PasscodeContext.Provider>
  );
}

export function usePasscode() {
  const context = useContext(PasscodeContext);
  if (!context)
    throw new Error("usePasscode must be used within PasscodeProvider");
  return context;
}

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
  unwrapMasterKey,
} from "@/lib/crypto";

interface FamilyE2EE {
  name: string;
  masterKeyEncrypted: string | null;
  masterKeyIv: string | null;
  masterKeySalt: string | null;
}

interface AuthUser {
  id: string;
  familyId: string | null;
  family: FamilyE2EE | null;
}

interface PasscodeContextType {
  masterKey: CryptoKey | null;
  unlock: (passcode: string) => Promise<boolean>;
  requireUnlock: () => Promise<boolean>;
  decryptHint: (encrypted: string, iv: string) => Promise<string>;
  encryptHint: (text: string) => Promise<{ encrypted: string; iv: string }>;
  isLocked: boolean;
  disableBiometric: () => Promise<void>;
}

const PasscodeContext = createContext<PasscodeContextType | null>(null);

export function PasscodeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useRouteContext({ from: "__root__" }) as {
    user: AuthUser | null;
  };
  const passcodeInputRef = useRef<HTMLInputElement>(null);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const masterKeyRef = useRef<CryptoKey | null>(null);
  const [passcode, setPasscode] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [showPasscode, setShowPasscode] = useState(false);
  const resolvePromiseRef = useRef<((value: boolean) => void) | null>(null);

  // 生体認証ステート
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [shouldRegisterBiometric, setShouldRegisterBiometric] = useState(false);
  const [isBiometricAuthenticating, setIsBiometricAuthenticating] =
    useState(false);

  // 生体認証のサポート状況と有効状態をチェック
  useEffect(() => {
    let isMounted = true;
    const checkBiometrics = async () => {
      const supported = await isBiometricSupported();
      if (!isMounted) return;
      setBiometricSupported(supported);

      if (supported && user?.id) {
        const enabled = await isBiometricEnabledForUser(user.id);
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
  }, [user?.id]);

  const unlock = useCallback(
    async (code: string) => {
      if (
        !user?.family?.masterKeyEncrypted ||
        !user?.family?.masterKeyIv ||
        !user?.family?.masterKeySalt
      ) {
        return false;
      }

      try {
        setIsUnlocking(true);
        const wrappingKey = await deriveKeyFromPasscode(
          code,
          user.family.masterKeySalt,
        );
        const key = await unwrapMasterKey(
          user.family.masterKeyEncrypted,
          user.family.masterKeyIv,
          wrappingKey,
        );
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
    [user],
  );

  const decryptHint = useCallback(async (encrypted: string, iv: string) => {
    const key = masterKeyRef.current;
    if (!key) throw new Error("Master key is not available");
    return await decrypt(encrypted, iv, key);
  }, []);

  const encryptHint = useCallback(async (text: string) => {
    const key = masterKeyRef.current;
    if (!key) throw new Error("Master key is not available");
    return await encrypt(text, key);
  }, []);

  const isLocked = !!user?.familyId && !masterKey;

  const requireUnlock = useCallback(async () => {
    if (!isLocked) return true;
    if (!user?.family?.masterKeyEncrypted) return false;

    setIsPromptOpen(true);
    return new Promise<boolean>((resolve) => {
      resolvePromiseRef.current = resolve;
    });
  }, [isLocked, user]);

  const disableBiometric = useCallback(async () => {
    if (!user?.id) return;
    await disableBiometricUnlock(user.id);
    setBiometricEnabled(false); // グローバルなステートもオフにする
  }, [user?.id]);

  const handleUnlockSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    const success = await unlock(passcode);
    if (success) {
      setIsPromptOpen(false);

      // パスコード認証成功後に生体認証登録を行う
      if (shouldRegisterBiometric && user?.id) {
        try {
          await registerBiometricUnlock(user.id, passcode);
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
    }
  };

  const handleBiometricUnlock = async () => {
    if (!user?.id) return;
    try {
      setIsBiometricAuthenticating(true);
      const decryptedPasscode = await decryptPasscodeWithBiometrics(user.id);
      const success = await unlock(decryptedPasscode);
      if (success) {
        setIsPromptOpen(false);
        setPasscode("");
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

  // 変更点1: 自動でフォーカスを当てていた useEffect を削除しました。

  // ユーザーや家族IDが変わったら（ログアウトなど）鍵をクリアする
  // biome-ignore lint/correctness/useExhaustiveDependencies: clear key when familyId changes
  useEffect(() => {
    setMasterKey(null);
    masterKeyRef.current = null;
  }, [user?.familyId]);

  return (
    <PasscodeContext.Provider
      value={{
        masterKey,
        unlock,
        requireUnlock,
        decryptHint,
        encryptHint,
        isLocked,
        disableBiometric,
      }}
    >
      {children}

      <Dialog open={isPromptOpen} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          // 変更点2: ダイアログが開いた際のRadix UI独自の自動フォーカス挙動を抑制
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight">
              家族パスコードの入力
            </DialogTitle>
            <DialogDescription>
              暗号化されたデータの読み書きを行うには、
              {user?.family?.name || "家族"}
              のパスコードを入力してください。
            </DialogDescription>
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
              <label 
                className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none"
                // 変更点3: inputにフォーカスがある場合のみ、クリック時のフォーカス移動をキャンセルさせる
                onMouseDown={(e) => {
                  if (document.activeElement === passcodeInputRef.current) {
                    e.preventDefault();
                  }
                }}
              >
                <input
                  type="checkbox"
                  checked={shouldRegisterBiometric}
                  onChange={(e) => setShouldRegisterBiometric(e.target.checked)}
                  disabled={isUnlocking || isBiometricAuthenticating}
                  className="rounded border-border bg-background checked:bg-primary text-primary focus:ring-primary/20 h-4 w-4"
                />
                <span>次回から指紋/FaceIDでロック解除する</span>
              </label>
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
                disabled={isUnlocking || !passcode || isBiometricAuthenticating}
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

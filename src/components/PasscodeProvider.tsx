import { useRouteContext } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
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

  const handleUnlockSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    const success = await unlock(passcode);
    if (success) {
      setIsPromptOpen(false);
      setPasscode("");
      if (resolvePromiseRef.current) {
        resolvePromiseRef.current(true);
        resolvePromiseRef.current = null;
      }
    }
  };

  const handleCancelUnlock = () => {
    setIsPromptOpen(false);
    setPasscode("");
    if (resolvePromiseRef.current) {
      resolvePromiseRef.current(false);
      resolvePromiseRef.current = null;
    }
  };

  useEffect(() => {
    if (isPromptOpen) {
      passcodeInputRef.current?.focus();
    }
  }, [isPromptOpen]);

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
      }}
    >
      {children}

      <Dialog open={isPromptOpen} onOpenChange={() => {}}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
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
                disabled={isUnlocking}
              />
              <button
                type="button"
                onClick={() => setShowPasscode(!showPasscode)}
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-muted-foreground hover:text-foreground"
              >
                {showPasscode ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancelUnlock}
                className="flex-1 rounded-lg border bg-background py-3 font-semibold text-foreground shadow-sm transition-all hover:bg-muted disabled:opacity-50"
                disabled={isUnlocking}
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="flex-1 flex items-center justify-center rounded-lg bg-primary py-3 font-semibold text-primary-foreground shadow-lg transition-all hover:opacity-90 disabled:opacity-50"
                disabled={isUnlocking || !passcode}
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

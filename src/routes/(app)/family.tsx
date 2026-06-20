import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { signOut } from "firebase/auth";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { usePasscode } from "@/components/PasscodeProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import {
  deriveKeyFromPasscode,
  encrypt,
  generateMasterKey,
  generateSalt,
  unwrapMasterKey,
  wrapMasterKey,
} from "@/lib/crypto";
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
    <div className="mx-auto max-w-3xl p-6">
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

function FamilyComponent() {
  const { isAuthenticated } = useConvexAuth();
  const family = useQuery(
    api.families.getFamilyMembers,
    isAuthenticated ? {} : "skip",
  );
  const myJoinRequest = useQuery(
    api.families.getMyJoinRequest,
    isAuthenticated ? {} : "skip",
  );
  const pendingRequests = useQuery(
    api.families.getPendingRequests,
    isAuthenticated && family ? {} : "skip",
  );
  const search = Route.useSearch();
  const router = useRouter();
  const { queryClient } = Route.useRouteContext();
  const convex = useConvex();
  const handleLogout = async () => {
    try {
      if (auth) await signOut(auth);
      await logout();
      clearQueryCache();
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      queryClient.setQueryData(["authUser"], null);
      await router.invalidate();
      await router.navigate({ to: "/" });
    } catch (_error) {
      toast.error("ログアウトに失敗しました");
    }
  };
  const downloadOrShareQrCode = async () => {
    const canvas = document.getElementById(
      "qr-canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) {
      toast.error("QRコードが見つかりません");
      return;
    }
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("画像の生成に失敗しました");
          return;
        }

        const fileName = `poohma-invite-${family?.name || "family"}.png`;
        const file = new File([blob], fileName, { type: "image/png" });

        // Web Share API でファイル共有可能な場合は画像共有を試みる
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "PoohMa 家族招待",
              text: `${family?.name || "家族グループ"}への招待QRコードです。`,
            });
            return;
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
            console.error("Share failed, falling back to download", err);
          }
        }

        // 非対応またはPC環境の場合はダウンロード
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("QRコード画像を保存しました");
      }, "image/png");
    } catch (err) {
      console.error(err);
      toast.error("画像の保存に失敗しました");
    }
  };

  const shareInviteUrl = async () => {
    const inviteUrl = `${window.location.origin}/family?inviteCode=${family?.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "PoohMa 家族招待",
          text: `${family?.name}への招待コードです。以下のリンクから参加してください。`,
          url: inviteUrl,
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error(err);
          toast.error("共有に失敗しました");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        toast.success("招待URLをクリップボードにコピーしました");
      } catch (err) {
        console.error(err);
        toast.error("コピーに失敗しました");
      }
    }
  };

  const createFamilyMut = useMutation(api.families.createFamily);
  const changeFamilyMut = useMutation(api.families.changeFamily);
  const createJoinRequestMut = useMutation(api.families.createJoinRequest);
  const cancelJoinRequestMut = useMutation(api.families.cancelJoinRequest);
  const dismissRejectedRequestMut = useMutation(
    api.families.dismissRejectedRequest,
  );
  const approveJoinRequestMut = useMutation(api.families.approveJoinRequest);
  const rejectJoinRequestMut = useMutation(api.families.rejectJoinRequest);

  const [createName, setCreateName] = useState("");
  const [createPasscode, setCreatePasscode] = useState("");
  const [createPasscodeConfirm, setCreatePasscodeConfirm] = useState("");
  const [joinCode, setJoinCode] = useState(search.inviteCode || "");
  const [joinPasscode, setJoinPasscode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showCreatePasscode, setShowCreatePasscode] = useState(false);
  const [showCreatePasscodeConfirm, setShowCreatePasscodeConfirm] =
    useState(false);
  const [showJoinPasscode, setShowJoinPasscode] = useState(false);

  const { masterKey, requireUnlock, decryptHint } = usePasscode();
  const [isChangingFamily, setIsChangingFamily] = useState(
    !!search.inviteCode && family !== undefined && family !== null,
  );

  // 参加申請を送信する
  const handleSendJoinRequest = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        await createJoinRequestMut({
          inviteCode: code as Id<"families">,
        });
        toast.success(
          "参加申請を送信しました。家族メンバーの承認をお待ちください。",
        );
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "参加申請に失敗しました";
        toast.error(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [createJoinRequestMut],
  );

  // 家族移行（既存メンバーが承認後に移行を完了する）
  const handleCompleteTransfer = useCallback(async () => {
    if (myJoinRequest?.status !== "approved") return;

    if (!joinPasscode || joinPasscode.length < 8) {
      toast.error("新しい家族のパスコードを入力してください（8文字以上）");
      return;
    }

    setIsLoading(true);
    try {
      // 1. セッションに旧マスターキーがあるか確認、なければロック解除を要求
      if (!masterKey) {
        const unlocked = await requireUnlock();
        if (!unlocked) {
          setIsLoading(false);
          return;
        }
      }

      // 2. 移行先の家族情報を取得
      const existingFamily = await convex.query(
        api.families.getFamilyInfoByInviteCode,
        { inviteCode: myJoinRequest.familyId as Id<"families"> },
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
      );
      const newMasterKey = await unwrapMasterKey(
        existingFamily.masterKeyEncrypted,
        existingFamily.masterKeyIv,
        wrappingKey,
      );

      // 3. 所有するレコードの再暗号化
      const recordsToReEncrypt = await convex.query(
        api.families.getRecordsForReEncryption,
        {},
      );
      const reEncryptedCredentials: {
        id: string;
        passwordHint: string;
        passwordHintIv: string;
      }[] = [];

      for (const record of recordsToReEncrypt) {
        for (const cred of record.credentials) {
          if (cred.passwordHint && cred.passwordHintIv) {
            const plainHint = await decryptHint(
              cred.passwordHint,
              cred.passwordHintIv,
            );
            const { encrypted, iv } = await encrypt(plainHint, newMasterKey);
            reEncryptedCredentials.push({
              id: cred.id,
              passwordHint: encrypted,
              passwordHintIv: iv,
            });
          }
        }
      }

      // 4. サーバーへ送信
      await changeFamilyMut({
        action: "join",
        inviteCode: myJoinRequest.familyId,
        credentials: reEncryptedCredentials,
      });

      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("家族グループを変更し、データを移行しました");
      setIsChangingFamily(false);
      await router.invalidate();
    } catch (error) {
      console.error(error);
      toast.error(
        "家族の変更に失敗しました（パスコードが間違っている可能性があります）",
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    myJoinRequest,
    joinPasscode,
    masterKey,
    requireUnlock,
    convex,
    decryptHint,
    changeFamilyMut,
    queryClient,
    router,
  ]);

  const handleChangeFamily = async (
    action: "create" | "join",
    e: React.SubmitEvent,
  ) => {
    e.preventDefault();
    if (action === "create") {
      if (createPasscode.length < 8) {
        toast.error("パスコードは8文字以上にしてください");
        return;
      }
      if (createPasscode !== createPasscodeConfirm) {
        toast.error("パスコードが一致しません");
        return;
      }

      setIsLoading(true);
      try {
        // 1. セッションに旧マスターキーがあるか確認、なければロック解除を要求
        if (!masterKey) {
          const unlocked = await requireUnlock();
          if (!unlocked) {
            setIsLoading(false);
            return;
          }
        }

        // 2. 新しいマスターキーの準備
        const salt = generateSalt();
        const passcodeKey = await deriveKeyFromPasscode(createPasscode, salt);
        const newMasterKey = await generateMasterKey();
        const wrapped = await wrapMasterKey(newMasterKey, passcodeKey);

        // 3. 所有するレコードの再暗号化
        const recordsToReEncrypt = await convex.query(
          api.families.getRecordsForReEncryption,
          {},
        );
        const reEncryptedCredentials: {
          id: string;
          passwordHint: string;
          passwordHintIv: string;
        }[] = [];

        for (const record of recordsToReEncrypt) {
          for (const cred of record.credentials) {
            if (cred.passwordHint && cred.passwordHintIv) {
              const plainHint = await decryptHint(
                cred.passwordHint,
                cred.passwordHintIv,
              );
              const { encrypted, iv } = await encrypt(plainHint, newMasterKey);
              reEncryptedCredentials.push({
                id: cred.id,
                passwordHint: encrypted,
                passwordHintIv: iv,
              });
            }
          }
        }

        // 4. サーバーへ送信
        await changeFamilyMut({
          action: "create",
          name: createName,
          masterKeyEncrypted: wrapped.encrypted,
          masterKeyIv: wrapped.iv,
          masterKeySalt: salt,
          credentials: reEncryptedCredentials,
        });

        await queryClient.invalidateQueries({ queryKey: ["authUser"] });
        toast.success("家族グループを変更し、データを移行しました");
        setIsChangingFamily(false);
        await router.invalidate();
      } catch (error) {
        console.error(error);
        toast.error("家族の変更に失敗しました");
      } finally {
        setIsLoading(false);
      }
    } else {
      // 「参加」の場合は、承認制のためリクエスト送信に切り替え
      await handleSendJoinRequest(joinCode);
    }
  };

  const handleCreate = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (createPasscode.length < 8) {
      toast.error("パスコードは8文字以上にしてください");
      return;
    }
    if (createPasscode !== createPasscodeConfirm) {
      toast.error("パスコードが一致しません");
      return;
    }
    setIsLoading(true);
    try {
      // E2EE: マスターキーの生成とラップ
      const salt = generateSalt();
      const passcodeKey = await deriveKeyFromPasscode(createPasscode, salt);
      const masterKey = await generateMasterKey();
      const wrapped = await wrapMasterKey(masterKey, passcodeKey);

      await createFamilyMut({
        name: createName,
        masterKeyEncrypted: wrapped.encrypted,
        masterKeyIv: wrapped.iv,
        masterKeySalt: salt,
      });
      await queryClient.invalidateQueries({ queryKey: ["authUser"] });
      toast.success("家族グループを作成しました。");
      await router.invalidate();
    } catch {
      toast.error("作成に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async (e: React.SubmitEvent) => {
    e.preventDefault();
    await handleSendJoinRequest(joinCode);
  };

  // family がまだロード中の場合はペンディングコンポーネントを表示
  if (family === undefined) {
    return <FamilyPending />;
  }

  // 保留中・却下済み申請がある場合のUI（家族未所属ユーザー向け）
  if (!family && myJoinRequest) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-[32px] font-semibold tracking-geist-h1 text-foreground">
            家族管理
          </h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md bg-card px-4 py-2 text-[14px] font-medium text-red-500 shadow-border hover:bg-accent transition cursor-pointer"
          >
            ログアウト
          </button>
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
            <p className="text-[14px] text-muted-foreground leading-relaxed mb-2">
              ページを再読み込みすると、家族グループに参加できます。
            </p>
            <button
              type="button"
              onClick={async () => {
                await queryClient.invalidateQueries({
                  queryKey: ["authUser"],
                });
                await router.invalidate();
              }}
              className="flex items-center justify-center w-full rounded-md bg-orange-500 px-4 py-2.5 text-[14px] font-medium text-white shadow-border transition hover:bg-orange-600 cursor-pointer"
            >
              ページを更新する
            </button>
          </div>
        )}
      </div>
    );
  }

  // 家族移行中に承認を受けた場合のUI
  if (family && isChangingFamily && myJoinRequest?.status === "approved") {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-[32px] font-semibold tracking-geist-h1 text-foreground">
            家族管理
          </h1>
          <button
            type="button"
            onClick={() => setIsChangingFamily(false)}
            className="text-[14px] px-3 py-1 bg-background rounded-md border shadow-sm text-foreground hover:bg-accent transition"
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
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-[32px] font-semibold tracking-geist-h1 text-foreground">
          家族管理
        </h1>
        {family ? (
          <Link
            to="/dashboard"
            className="rounded-md bg-card px-4 py-2 text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition"
          >
            ダッシュボードへ
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md bg-card px-4 py-2 text-[14px] font-medium text-red-500 shadow-border hover:bg-accent transition cursor-pointer"
          >
            ログアウト
          </button>
        )}
      </div>

      {family && !isChangingFamily ? (
        <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
          <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-[18px] font-semibold tracking-geist-ui text-foreground">
              {family.name}
            </h2>
          </div>
          <div className="mb-8">
            <h3 className="mb-3 text-[14px] font-medium text-foreground">
              招待コード
            </h3>
            <div className="flex flex-col md:flex-row items-center gap-6 rounded-md bg-muted/50 p-6 shadow-border-light">
              <div className="bg-white p-2 rounded-md shadow-sm shrink-0">
                <QRCodeCanvas
                  id="qr-canvas"
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/family?inviteCode=${family.id}`}
                  size={120}
                />
              </div>
              <div className="flex-1 w-full space-y-3 min-w-0">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <code className="flex-1 font-mono text-[14px] md:text-[16px] font-semibold text-foreground bg-card p-2.5 rounded-md shadow-sm border border-border break-all">
                    {family.id}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(family.id);
                      toast.success("コピーしました");
                    }}
                    className="rounded-md bg-card px-4 py-2.5 text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition whitespace-nowrap cursor-pointer"
                  >
                    コピー
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={downloadOrShareQrCode}
                    className="rounded-md bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
                  >
                    QRコード画像を保存
                  </button>
                  <button
                    type="button"
                    onClick={shareInviteUrl}
                    className="rounded-md bg-card px-3 py-2 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex items-center justify-center gap-1.5 cursor-pointer flex-1 sm:flex-initial"
                  >
                    {typeof navigator !== "undefined" && "share" in navigator
                      ? "招待URLを共有"
                      : "招待URLをコピー"}
                  </button>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  このコードまたはQRコードを家族に共有して参加してもらいます。
                  <br />
                  参加には家族メンバーの承認が必要です。
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-4 text-[14px] font-medium text-foreground">
              メンバー一覧
            </h3>
            <ul className="space-y-3">
              {family.users.map((u) => {
                const isMe = auth?.currentUser?.uid === u.id;
                return (
                  <li
                    key={u.id}
                    className="flex items-center justify-between rounded-md bg-card p-4 shadow-border-light"
                  >
                    <div className="flex flex-col">
                      <span className="text-[14px] font-medium text-foreground flex items-center gap-2">
                        {u.displayName || "名無し"}
                        {isMe && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                            あなた
                          </span>
                        )}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {u.email}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* 参加リクエスト一覧 */}
          {pendingRequests && pendingRequests.length > 0 && (
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
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={async () => {
                          setIsLoading(true);
                          try {
                            await approveJoinRequestMut({
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
                        className="flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-[13px] font-medium text-white shadow-border transition hover:bg-green-700 disabled:opacity-50 cursor-pointer"
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
                        className="flex items-center gap-1.5 rounded-md bg-card px-4 py-2 text-[13px] font-medium text-red-500 shadow-border transition hover:bg-accent disabled:opacity-50 cursor-pointer"
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
        <div className="space-y-6">
          {!family ? (
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
          ) : (
            <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20 mb-6">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-[16px] font-semibold text-red-700 dark:text-red-400">
                  家族グループの変更
                </h2>
                <button
                  type="button"
                  onClick={() => setIsChangingFamily(false)}
                  className="text-[14px] px-3 py-1 bg-background rounded-md border shadow-sm text-foreground hover:bg-accent transition"
                >
                  キャンセル
                </button>
              </div>
              <p className="text-[14px] text-red-700/80 dark:text-red-400/80 leading-relaxed">
                新しい家族を作成するか、別の家族の招待コードを入力して参加申請を送信してください。
                <br />
                <strong>注意:</strong>{" "}
                あなたが所有するパスワードヒントは、自動的に新しいグループ用に再暗号化されます。現在のパスコードの入力が求められる場合があります。
              </p>
            </div>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {/* 家族を作成 */}
            <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
              <h2 className="mb-6 text-[18px] font-semibold tracking-geist-ui text-foreground">
                家族グループを作成
              </h2>
              <form
                onSubmit={
                  isChangingFamily
                    ? (e) => handleChangeFamily("create", e)
                    : handleCreate
                }
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="family-name-input"
                    className="mb-1.5 block text-[14px] font-medium text-foreground"
                  >
                    グループ名
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
                      minLength={8}
                      value={createPasscode}
                      onChange={(e) => setCreatePasscode(e.target.value)}
                      placeholder="8文字以上"
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
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    暗号化に使用します。忘れるとヒントを復元できません。
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="family-passcode-confirm-input"
                    className="mb-1.5 block text-[14px] font-medium text-foreground"
                  >
                    パスコード（確認）
                  </label>
                  <div className="relative">
                    <input
                      type={showCreatePasscodeConfirm ? "text" : "password"}
                      id="family-passcode-confirm-input"
                      required
                      minLength={8}
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

            {/* 家族に参加（申請送信） */}
            <div className="rounded-lg bg-card p-6 shadow-card transition-shadow">
              <h2 className="mb-6 text-[18px] font-semibold tracking-geist-ui text-foreground">
                既存の家族に参加
              </h2>
              <form
                onSubmit={
                  isChangingFamily
                    ? (e) => handleChangeFamily("join", e)
                    : handleJoin
                }
                className="space-y-5"
              >
                <div>
                  <label
                    htmlFor="family-join-input"
                    className="mb-1.5 block text-[14px] font-medium text-foreground"
                  >
                    招待コード
                  </label>
                  <input
                    id="family-join-input"
                    type="text"
                    required
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="w-full font-mono rounded-md bg-card p-2.5 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
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
          </div>
        </div>
      )}
    </div>
  );
}

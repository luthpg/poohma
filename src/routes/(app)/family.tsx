import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { signOut } from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const copyQrCode = async () => {
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
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
        toast.success("QRコード画像をクリップボードにコピーしました");
      }, "image/png");
    } catch (err) {
      console.error(err);
      toast.error("画像のコピーに対応していないブラウザです");
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
  const joinFamilyMut = useMutation(api.families.joinFamily);
  const changeFamilyMut = useMutation(api.families.changeFamily);

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
  const autoJoinTriggered = useRef(false);

  const executeJoin = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        await joinFamilyMut({ inviteCode: code as Id<"families"> });
        await queryClient.invalidateQueries({ queryKey: ["authUser"] });
        toast.success("家族グループに参加しました");
        await router.invalidate();
      } catch {
        toast.error("参加に失敗しました");
      } finally {
        setIsLoading(false);
      }
    },
    [router, joinFamilyMut, queryClient],
  );

  // 招待コードがURLにあり、家族未所属の場合は自動で参加を発火
  useEffect(() => {
    if (search.inviteCode && !family && !autoJoinTriggered.current) {
      autoJoinTriggered.current = true;
      executeJoin(search.inviteCode);
    }
  }, [search.inviteCode, family, executeJoin]);

  // family がまだロード中の場合はペンディングコンポーネントを表示
  if (family === undefined) {
    return <FamilyPending />;
  }

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
    } else {
      if (!joinCode || joinPasscode.length < 8) {
        toast.error("招待コードとパスコードを入力してください（8文字以上）");
        return;
      }
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
      let newMasterKeyEncrypted: string | undefined;
      let newMasterKeyIv: string | undefined;
      let newMasterKeySalt: string | undefined;
      let newMasterKey: CryptoKey;

      if (action === "create") {
        const salt = generateSalt();
        const passcodeKey = await deriveKeyFromPasscode(createPasscode, salt);
        newMasterKey = await generateMasterKey();
        const wrapped = await wrapMasterKey(newMasterKey, passcodeKey);

        newMasterKeyEncrypted = wrapped.encrypted;
        newMasterKeyIv = wrapped.iv;
        newMasterKeySalt = salt;
      } else {
        const existingFamily = await convex.query(
          api.families.getFamilyInfoByInviteCode,
          { inviteCode: joinCode as Id<"families"> },
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
        newMasterKey = await unwrapMasterKey(
          existingFamily.masterKeyEncrypted,
          existingFamily.masterKeyIv,
          wrappingKey,
        );
      }

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
            // 復号
            const plainHint = await decryptHint(
              cred.passwordHint,
              cred.passwordHintIv,
            );
            // 新しいマスターキーで暗号化
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
        action,
        name: action === "create" ? createName : undefined,
        masterKeyEncrypted: newMasterKeyEncrypted,
        masterKeyIv: newMasterKeyIv,
        masterKeySalt: newMasterKeySalt,
        inviteCode: action === "join" ? joinCode : undefined,
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
    await executeJoin(joinCode);
  };

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
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={copyQrCode}
                    className="rounded-md bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex flex-auto items-center justify-center gap-1.5 cursor-pointer"
                  >
                    QRコード画像をコピー
                  </button>
                  <button
                    type="button"
                    onClick={shareInviteUrl}
                    className="rounded-md bg-card px-3 py-1.5 text-[13px] font-medium text-foreground shadow-border hover:bg-accent transition flex flex-auto items-center justify-center gap-1.5 cursor-pointer"
                  >
                    招待URLを共有・コピー
                  </button>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  このコードまたはQRコードを家族に共有して参加してもらいます。
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
                新しい家族を作成するか、別の家族の招待コードを入力して参加してください。
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

            {/* 家族に参加 */}
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
                {isChangingFamily && (
                  <div>
                    <label
                      htmlFor="family-join-passcode-input"
                      className="mb-1.5 block text-[14px] font-medium text-foreground"
                    >
                      新しい家族のパスコード{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showJoinPasscode ? "text" : "password"}
                        id="family-join-passcode-input"
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
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex items-center justify-center w-full rounded-md bg-foreground px-4 py-2.5 text-[14px] font-medium text-background shadow-border transition hover:bg-foreground/90 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      参加中...
                    </>
                  ) : (
                    "参加する"
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

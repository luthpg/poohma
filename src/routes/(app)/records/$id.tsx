import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TagInput } from "@/components/ui/tag-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccount } from "@/hooks/useAccount";
import { MAX_CREDENTIALS_PER_RECORD } from "@/utils/schemas";

export const Route = createFileRoute("/(app)/records/$id")({
  loader: ({ params }) => {
    return { id: params.id as Id<"serviceRecords"> };
  },
  pendingComponent: RecordDetailPending,
  component: RecordDetailWrapper,
});

function RecordDetailPending() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 bg-background/95 px-6 pb-4 pt-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Skeleton className="h-5 w-32 rounded-md" />
      </div>

      <div className="overflow-hidden rounded-lg bg-card shadow-card">
        {/* OGP ヘッダー */}
        <Skeleton className="relative aspect-video w-full md:aspect-[21/9] rounded-none" />

        {/* 基本情報 */}
        <div className="p-6 md:p-8">
          <div className="mb-6 flex items-start justify-between">
            <Skeleton className="h-8 w-1/2 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>

          <div className="mb-8 flex gap-2">
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>

          <div className="mb-10">
            <Skeleton className="mb-6 h-6 w-32 rounded-md" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-40 w-full rounded-md" />
              <Skeleton className="h-40 w-full rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const routeApi = getRouteApi("/(app)/records/$id");

function RecordDetailWrapper() {
  const { id } = routeApi.useLoaderData();
  const { isAuthenticated } = useConvexAuth();
  const { activeAccountId } = useAccount();
  const availableTags = useQuery(
    api.records.getAvailableTags,
    isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
  );
  const record = useQuery(
    api.records.getRecordDetail,
    isAuthenticated ? { id, accountId: activeAccountId || undefined } : "skip",
  );
  const familyMembers = useQuery(
    api.families.getFamilyMembers,
    isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
  );

  if (record === undefined || availableTags === undefined) {
    return <RecordDetailPending />;
  }

  return (
    <RecordDetailComponent
      record={record}
      availableTags={availableTags}
      activeAccountId={activeAccountId}
      familyMembers={familyMembers?.users || []}
    />
  );
}

function RecordDetailComponent({
  record,
  availableTags,
  activeAccountId,
  familyMembers,
}: {
  record: Doc<"serviceRecords"> & {
    user: {
      displayName?: string;
      email: string;
    } | null;
    adminUsers?: { _id: Id<"users">; displayName?: string; email?: string }[];
  };
  availableTags: string[];
  activeAccountId?: Id<"users"> | null;
  familyMembers: {
    id: Id<"users">;
    userId: string;
    email?: string;
    displayName?: string;
  }[];
}) {
  const effectiveAccountId = activeAccountId || record.accountId;
  const isOwner =
    (record.ownerType ?? "user") === "user" &&
    record.accountId === effectiveAccountId;
  const isShared = record.ownerType === "family";
  const isAdmin =
    isOwner ||
    (isShared &&
      (record.admins ?? []).includes(effectiveAccountId as Id<"users">));
  const isEditable = isOwner || isShared;

  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const [isEditing, setIsEditing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [title, setTitle] = useState(record.title);
  const [titleReading, setTitleReading] = useState(record.titleReading || "");
  const [showAdvancedTitle, setShowAdvancedTitle] = useState(false);
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  const [url, setUrl] = useState(record.url || "");
  const [ogpImage, setOgpImage] = useState(record.ogpImage || "");
  const [ogpDescription, setOgpDescription] = useState(
    record.ogpDescription || "",
  );
  const [credentials, setCredentials] = useState<
    {
      id?: string;
      label: string;
      loginId: string;
      passwordHint: string;
    }[]
  >(
    record.credentials.map((c) => ({
      id: c.id,
      label: c.label || "",
      loginId: c.loginId || "",
      passwordHint: c.passwordHint || "",
    })),
  );
  const [tags, setTags] = useState<string[]>(record.tags);
  const [memo, setMemo] = useState(record.memo || "");
  const [ownerType, setOwnerType] = useState<"user" | "family">(
    record.ownerType ?? "user",
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingOgp, setIsFetchingOgp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const handleWebShare = async () => {
    if (typeof window === "undefined") return;

    const shareData = {
      title: record.title ? `${record.title} - PoohMa` : "PoohMa レコード",
      text: `${record.title || "アカウント情報"}の共有`,
      url: window.location.href,
    };

    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare?.(shareData)
    ) {
      try {
        await navigator.share(shareData);
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("シェア処理に失敗しました:", err);
          toast.error("共有に失敗しました");
        }
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        toast.success("URLをクリップボードにコピーしました");
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("クリップボードコピーに失敗しました:", err);
        toast.error("URLのコピーに失敗しました");
      }
    }
  };

  // 非同期レース条件対策用
  const furiganaReqIdRef = useRef(0);
  const furiganaPromiseRef = useRef<Promise<string | null> | null>(null);
  const ogpPromiseRef = useRef<Promise<{
    title?: string;
    image?: string;
    description?: string;
  } | null> | null>(null);

  const getOgpInfo = useAction(api.actions.getOgpInfo);
  const getFurigana = useAction(api.actions.getFurigana);
  const updateRecord = useMutation(api.records.updateRecord);
  const deleteRecord = useMutation(api.records.deleteRecord);
  const shareRecord = useMutation(api.records.shareRecord);

  // ルビ取得リクエストを無効化
  const invalidateFuriganaRequest = () => {
    furiganaReqIdRef.current += 1;
    furiganaPromiseRef.current = null;
    setIsFetchingFurigana(false);
  };

  const fetchFuriganaForTitle = (targetTitle: string) => {
    const text = targetTitle.trim();
    if (!text) return Promise.resolve(null);

    furiganaReqIdRef.current += 1;
    const currentReqId = furiganaReqIdRef.current;
    setIsFetchingFurigana(true);

    const promise = (async () => {
      try {
        const reading = await getFurigana({ text });
        if (
          currentReqId === furiganaReqIdRef.current &&
          typeof reading === "string" &&
          reading
        ) {
          setTitleReading(reading);
          return reading;
        }
      } catch (e) {
        console.error("Failed to fetch furigana", e);
      } finally {
        if (currentReqId === furiganaReqIdRef.current) {
          setIsFetchingFurigana(false);
        }
      }
      return null;
    })();

    furiganaPromiseRef.current = promise;
    return promise;
  };

  const handleUrlBlur = () => {
    if (!url) return Promise.resolve(null);
    setIsFetchingOgp(true);

    const promise = (async () => {
      try {
        const ogp = await getOgpInfo({ url });
        const shouldSetTitle = ogp.title && !title;
        if (shouldSetTitle) {
          setTitle(ogp.title);
          await fetchFuriganaForTitle(ogp.title);
        }
        if (ogp.image) setOgpImage(ogp.image);
        if (ogp.description) setOgpDescription(ogp.description);
        return ogp;
      } catch (e) {
        console.error("Failed to fetch OGP info", e);
        return null;
      } finally {
        setIsFetchingOgp(false);
      }
    })();

    ogpPromiseRef.current = promise;
    return promise;
  };

  const handleTitleBlur = () => {
    if (title && !titleReading) {
      fetchFuriganaForTitle(title);
    }
  };

  const handleRemoveCredential = (indexToRemove: number) => {
    if (credentials.length <= 1) return;
    setCredentials(credentials.filter((_, i) => i !== indexToRemove));
  };

  const handleAddCredential = () => {
    if (credentials.length >= MAX_CREDENTIALS_PER_RECORD) {
      toast.error(
        `アカウント情報は${MAX_CREDENTIALS_PER_RECORD}件まで登録できます`,
      );
      return;
    }
    setCredentials([
      ...credentials,
      { label: "", loginId: "", passwordHint: "" },
    ]);
  };

  const { decryptHint, encryptHint, requireUnlock, masterKey } = usePasscode();

  const handleEditStart = async () => {
    setTitle(record.title);
    setTitleReading(record.titleReading || "");
    setShowAdvancedTitle(false);
    setUrl(record.url || "");
    setOgpImage(record.ogpImage || "");
    setOgpDescription(record.ogpDescription || "");
    setTags(record.tags);
    setMemo(record.memo || "");
    setOwnerType(record.ownerType ?? "user");

    const hasEncryptedHints = record.credentials.some(
      (c) => c.passwordHint && c.passwordHintIv,
    );

    if (hasEncryptedHints) {
      const unlocked = await requireUnlock();
      if (!unlocked) return; // user cancelled or failed

      const decryptedCreds = await Promise.all(
        record.credentials.map(async (c) => {
          if (c.passwordHint && c.passwordHintIv) {
            try {
              const plain = await decryptHint(
                c.passwordHint,
                c.passwordHintIv,
                c.passwordHintDekEncrypted,
                c.passwordHintDekIv,
              );
              return {
                id: c.id,
                label: c.label || "",
                loginId: c.loginId || "",
                passwordHint: plain,
              };
            } catch (e) {
              console.error("Failed to decrypt on edit start", e);
              return {
                id: c.id,
                label: c.label || "",
                loginId: c.loginId || "",
                passwordHint: "",
              };
            }
          }
          return {
            id: c.id,
            label: c.label || "",
            loginId: c.loginId || "",
            passwordHint: c.passwordHint || "",
          };
        }),
      );
      setCredentials(decryptedCreds);
    } else {
      setCredentials(
        record.credentials.map((c) => ({
          id: c.id,
          label: c.label || "",
          loginId: c.loginId || "",
          passwordHint: c.passwordHint || "",
        })),
      );
    }

    setIsEditing(true);
  };

  const handleEditSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (memo && memo.length > 10000) {
      toast.error("メモは10,000文字以内で入力してください");
      setIsLoading(false);
      return;
    }

    const invalidHint = credentials.find(
      (c) => c.passwordHint && c.passwordHint.length > 2000,
    );
    if (invalidHint) {
      toast.error("パスワードヒントは2,000文字以内で入力してください");
      setIsLoading(false);
      return;
    }

    try {
      let currentTitleReading = titleReading;
      if (ogpPromiseRef.current) {
        await ogpPromiseRef.current;
      }
      if (furiganaPromiseRef.current) {
        const fetchedReading = await furiganaPromiseRef.current;
        if (fetchedReading) {
          currentTitleReading = fetchedReading;
        }
      }

      const filteredCreds = credentials.filter(
        (c) => c.label || c.loginId || c.passwordHint,
      );

      const hasHintsToEncrypt = filteredCreds.some((c) => c.passwordHint);
      if (hasHintsToEncrypt && !masterKey) {
        const unlocked = await requireUnlock();
        if (!unlocked) {
          setIsLoading(false);
          return;
        }
      }

      const encryptedCreds = await Promise.all(
        filteredCreds.map(async (cred) => {
          const credId = cred.id || crypto.randomUUID();
          if (cred.passwordHint) {
            const { encrypted, iv, dekEncrypted, dekIv } = await encryptHint(
              cred.passwordHint,
            );
            return {
              id: credId,
              label: cred.label || undefined,
              loginId: cred.loginId || undefined,
              passwordHint: encrypted,
              passwordHintIv: iv,
              passwordHintDekEncrypted: dekEncrypted,
              passwordHintDekIv: dekIv,
            };
          }
          return {
            id: credId,
            label: cred.label || undefined,
            loginId: cred.loginId || undefined,
            passwordHint: cred.passwordHint || undefined,
            passwordHintIv: undefined,
            passwordHintDekEncrypted: undefined,
            passwordHintDekIv: undefined,
          };
        }),
      );

      await updateRecord({
        accountId: activeAccountId || undefined,
        id: record._id,
        data: {
          title,
          titleReading: currentTitleReading || undefined,
          url: url || undefined,
          ogpImage: ogpImage || undefined,
          ogpDescription: ogpDescription || undefined,
          memo: memo || undefined,
          ownerType,
          credentials: encryptedCreds,
          tags,
        },
      });

      toast.success("レコードを更新しました");
      await router.invalidate();
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      toast.error("更新に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);

    try {
      await deleteRecord({
        accountId: activeAccountId || undefined,
        id: record._id,
      });
      toast.success("レコードを削除しました");
      await navigate({ to: "/dashboard" });
    } catch (error) {
      console.error("削除エラー:", error);
      toast.error("削除に失敗しました");
    } finally {
      setIsLoading(false);
    }
  };

  if (isEditing) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-8 text-[24px] font-semibold tracking-geist-h2 text-foreground">
          サービス情報を編集
        </h1>

        <form onSubmit={handleEditSubmit} className="space-y-8">
          {/* URL・OGPセクション */}
          <section className="rounded-lg bg-card p-6 shadow-card transition-shadow">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="url-input"
                  className="block text-[14px] font-medium text-foreground"
                >
                  URL
                </label>
                <div className="relative">
                  <input
                    id="url-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={handleUrlBlur}
                    placeholder="https://example.com"
                    className="mt-1 w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                  {isFetchingOgp && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-muted-foreground text-xs mt-0.5">
                      <Spinner className="h-3 w-3" />
                      <span>情報取得中...</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="title-input"
                  className="block text-[14px] font-medium text-foreground"
                >
                  サービス名 <span className="text-red-500">*</span>
                </label>
                <input
                  id="title-input"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    invalidateFuriganaRequest();
                    setTitleReading("");
                  }}
                  onBlur={handleTitleBlur}
                  className="mt-1 w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>

              {/* 折りたたみ式：読み仮名（ふりがな）設定 */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvancedTitle(!showAdvancedTitle)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition cursor-pointer"
                >
                  {showAdvancedTitle ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  <span>読み仮名（ルビ）の調整</span>
                  {titleReading && !showAdvancedTitle && (
                    <span className="ml-1 text-[11px] text-orange-500 font-normal">
                      ({titleReading})
                    </span>
                  )}
                </button>

                {showAdvancedTitle && (
                  <div className="mt-2 rounded-md bg-muted/40 p-3.5 border border-border/40 space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="title-reading-input"
                        className="block text-[12px] font-medium text-foreground"
                      >
                        読み仮名 (ひらがな)
                      </label>
                      <button
                        type="button"
                        onClick={() => fetchFuriganaForTitle(title)}
                        disabled={!title || isFetchingFurigana}
                        className="text-[11px] text-orange-500 hover:text-orange-600 disabled:opacity-50 transition cursor-pointer"
                      >
                        {isFetchingFurigana ? "取得中..." : "自動再取得"}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="title-reading-input"
                        type="text"
                        value={titleReading}
                        onChange={(e) => {
                          setTitleReading(e.target.value);
                          invalidateFuriganaRequest();
                        }}
                        placeholder="例: あまぞん / さんいんごうどうぎんこう"
                        className="w-full rounded-md bg-card p-2 text-base md:text-[13px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                      />
                      {isFetchingFurigana && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                          <Spinner className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      インデックス検索・あいうえお順ジャンプに使用されます。自動読み取りが異なる場合、手動で修正できます。
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* アカウント情報セクション */}
          <section className="rounded-lg bg-card p-6 shadow-card transition-shadow">
            <div className="mb-6 flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-[18px] font-semibold text-foreground tracking-geist-ui">
                アカウント情報
              </h2>
              <button
                type="button"
                onClick={handleAddCredential}
                disabled={credentials.length >= MAX_CREDENTIALS_PER_RECORD}
                className="text-[14px] font-medium text-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                + 追加する
              </button>
            </div>

            <div className="space-y-6">
              {credentials.map((cred, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: input label
                  key={index}
                  className="rounded-md bg-muted/50 p-5 shadow-border-light relative group"
                >
                  {credentials.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCredential(index)}
                      className="absolute right-2.5 top-2.5 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 opacity-80 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                      title="このアカウント情報を削除"
                      aria-label="このアカウント情報を削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label
                        htmlFor={`label-input-${index}`}
                        className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
                      >
                        ラベル (例: パパ用)
                      </label>
                      <input
                        id={`label-input-${index}`}
                        type="text"
                        value={cred.label}
                        onChange={(e) => {
                          const newCreds = [...credentials];
                          newCreds[index].label = e.target.value;
                          setCredentials(newCreds);
                        }}
                        className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`login-id-input-${index}`}
                        className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
                      >
                        ログインID
                      </label>
                      <input
                        id={`login-id-input-${index}`}
                        type="text"
                        value={cred.loginId}
                        onChange={(e) => {
                          const newCreds = [...credentials];
                          newCreds[index].loginId = e.target.value;
                          setCredentials(newCreds);
                        }}
                        className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`pw-hint-input-${index}`}
                        className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
                      >
                        パスワードヒント
                      </label>
                      <input
                        id={`pw-hint-input-${index}`}
                        type="text"
                        value={cred.passwordHint}
                        onChange={(e) => {
                          const newCreds = [...credentials];
                          newCreds[index].passwordHint = e.target.value;
                          setCredentials(newCreds);
                        }}
                        autoComplete="off"
                        placeholder="例: 愛犬の名前+結婚記念日"
                        className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 所有設定・タグ・メモ */}
          <section className="rounded-lg bg-card p-6 shadow-card transition-shadow space-y-6">
            <div>
              <span
                id="edit-owner-type-label"
                className="block text-[14px] font-medium text-foreground mb-2"
              >
                所有設定
              </span>
              <ToggleGroup
                aria-labelledby="edit-owner-type-label"
                type="single"
                value={ownerType}
                disabled={!isAdmin}
                onValueChange={(val) => {
                  if (val === "user" || val === "family") {
                    setOwnerType(val);
                  }
                }}
                variant="outline"
                className="w-full justify-start gap-2"
              >
                <ToggleGroupItem
                  value="user"
                  disabled={!isAdmin}
                  aria-label="自分のみ（個人用）"
                  className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-md data-[state=on]:bg-orange-500 data-[state=on]:text-white data-[state=on]:border-orange-500 transition-colors disabled:opacity-60"
                >
                  自分のみ（個人用）
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="family"
                  disabled={!isAdmin}
                  aria-label="家族と共有"
                  className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-md data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600 transition-colors disabled:opacity-60"
                >
                  家族と共有
                </ToggleGroupItem>
              </ToggleGroup>
              {!isAdmin && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  ※ 共有設定の解除は管理者のみ可能です。
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="tags-input"
                className="block text-[14px] font-medium text-foreground mb-1"
              >
                タグ
              </label>
              <TagInput
                value={tags}
                onChange={setTags}
                availableTags={availableTags}
              />
            </div>
            <div>
              <label
                htmlFor="memo-input"
                className="block text-[14px] font-medium text-foreground mb-1"
              >
                メモ
              </label>
              <textarea
                id="memo-input"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>
          </section>

          <div className="flex justify-end gap-4 border-t border-border pt-6">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-md bg-card px-6 py-2 text-[14px] font-medium text-foreground shadow-border hover:bg-accent transition"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isLoading || isFetchingFurigana || isFetchingOgp}
              className="flex items-center rounded-md bg-orange-500 px-6 py-2 text-[14px] font-medium text-white shadow-border hover:bg-orange-600 disabled:opacity-50 transition"
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  保存中...
                </>
              ) : isFetchingFurigana || isFetchingOgp ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  自動取得中...
                </>
              ) : (
                "保存する"
              )}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* ヘッダーナビゲーション（戻るボタン & 共有ボタン） */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 bg-background/95 px-6 pb-4 pt-6 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between gap-4">
        <button
          type="button"
          disabled={isNavigating}
          onClick={() => {
            setIsNavigating(true);
            if (window.history.length > 2) {
              window.history.back();
            } else {
              router.navigate({ to: "/dashboard" });
            }
          }}
          className="text-[14px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
        >
          <span className="text-[16px] leading-none mb-0.5">←</span>{" "}
          ダッシュボードに戻る
        </button>

        <button
          type="button"
          onClick={handleWebShare}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground shadow-sm cursor-pointer"
        >
          {shareSuccess || copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Share2 className="h-3.5 w-3.5" />
          )}
          <span>
            {copied
              ? "URLをコピーしました"
              : shareSuccess
                ? "共有しました"
                : "ページを共有"}
          </span>
        </button>
      </div>

      <div className="overflow-hidden rounded-lg bg-card shadow-card">
        {/* OGP ヘッダー */}
        <div className="relative aspect-video w-full bg-muted md:aspect-[21/9]">
          {record.ogpImage ? (
            <img
              src={record.ogpImage}
              alt={record.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl font-bold text-muted-foreground/30">
              {record.title.slice(0, 1)}
            </div>
          )}
          {/* URLリンクがあればオーバーレイ */}
          {record.url && (
            <div className="absolute bottom-4 right-4 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!record.url) return;
                  setIsLoading(true);
                  try {
                    const ogp = await getOgpInfo({ url: record.url });
                    await updateRecord({
                      id: record._id,
                      data: {
                        title: record.title,
                        url: record.url,
                        ogpImage: ogp.image || undefined,
                        ogpDescription: ogp.description || undefined,
                        memo: record.memo || undefined,
                        ownerType: record.ownerType,
                        credentials: record.credentials.map((c) => ({
                          id: c.id,
                          label: c.label || "",
                          loginId: c.loginId || "",
                          passwordHint: c.passwordHint || "",
                          passwordHintIv: c.passwordHintIv || undefined,
                          passwordHintDekEncrypted:
                            c.passwordHintDekEncrypted || undefined,
                          passwordHintDekIv: c.passwordHintDekIv || undefined,
                        })),
                        tags: record.tags,
                      },
                    });
                    toast.success("OGP情報を更新しました");
                    await router.invalidate();
                  } catch (e) {
                    console.error(e);
                    toast.error("OGP情報の更新に失敗しました");
                  } finally {
                    setIsLoading(false);
                  }
                }}
                disabled={isLoading}
                className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/80 transition flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Spinner className="h-4 w-4" /> : "↻"}
                OGP更新
              </button>
              <a
                href={record.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-black/80 transition"
              >
                サイトを開く ↗
              </a>
            </div>
          )}
        </div>

        {/* 基本情報 */}
        <div className="p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[24px] font-semibold tracking-geist-h2 text-foreground">
              {record.title}
            </h1>
            <div className="flex items-center gap-2">
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium tracking-wide ${
                  isShared
                    ? "bg-blue-100/50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {isShared
                  ? `共有中${record.admins && record.admins.length > 0 ? ` (${record.admins.length}名管理)` : ""}`
                  : "自分のみ"}
              </span>

              {/* ワンタップ共有ボタン (個人所有者の場合) */}
              {isOwner && !isShared && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      await shareRecord({
                        id: record._id,
                        accountId: activeAccountId || undefined,
                      });
                      toast.success("家族と共有しました");
                      await router.invalidate();
                    } catch (e) {
                      console.error(e);
                      toast.error("共有に失敗しました");
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="rounded-full bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 px-3 py-1 text-[12px] font-medium transition flex items-center gap-1 cursor-pointer"
                >
                  <Share2 className="h-3 w-3" />
                  家族と共有する
                </button>
              )}

              {/* 共有設定ボタン (共有レコードかつ管理者の場合) */}
              {isShared && isAdmin && (
                <ShareSettingsDialog
                  record={record}
                  familyMembers={familyMembers}
                  activeAccountId={activeAccountId}
                  onRecordUpdated={async () => {
                    await router.invalidate();
                  }}
                />
              )}
            </div>
          </div>

          {/* オーナー情報 */}
          {record.user?.displayName && (
            <div className="mb-6 flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="font-medium">作成者:</span>
              <span>
                {record.user.displayName} ({record.user.email})
              </span>
            </div>
          )}

          {/* タグ */}
          {record.tags.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              {record.tags.map((tag) => (
                <Link
                  key={tag}
                  to="/dashboard"
                  search={{ tag }}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[12px] font-medium text-muted-foreground shadow-sm hover:bg-orange-500 hover:text-white transition"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          {/* アカウント情報（ID / ヒント） */}
          <div className="mb-10">
            <h2 className="mb-6 text-[18px] font-semibold text-foreground tracking-geist-ui border-b border-border pb-2">
              アカウント情報
            </h2>
            {record.credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                登録された情報はありません。
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {record.credentials.map((cred) => (
                  <CredentialCard key={cred.id} cred={cred} />
                ))}
              </div>
            )}
          </div>

          {/* メモ */}
          {record.memo && (
            <div className="mb-10">
              <h2 className="mb-4 text-[14px] font-semibold text-foreground tracking-wide uppercase">
                メモ
              </h2>
              <div className="rounded-md bg-muted/50 p-4 text-[14px] text-muted-foreground whitespace-pre-wrap shadow-border-light">
                {record.memo}
              </div>
            </div>
          )}

          {/* アクションボタン (編集権限がある場合のみ) */}
          {isEditable && (
            <div className="mt-10 flex justify-end gap-4 border-t border-border pt-6">
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="rounded-md px-6 py-2 text-[14px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      削除する
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        レコードを削除しますか？
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        この操作は取り消せません。本当に削除してもよろしいですか？
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>キャンセル</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
                      >
                        削除する
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <button
                type="button"
                onClick={handleEditStart}
                className="rounded-md bg-foreground px-6 py-2 text-[14px] font-medium text-background hover:bg-foreground/90 transition"
              >
                編集する
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareSettingsDialog({
  record,
  familyMembers,
  activeAccountId,
  onRecordUpdated,
}: {
  record: Doc<"serviceRecords"> & {
    adminUsers?: { _id: Id<"users">; displayName?: string; email?: string }[];
  };
  familyMembers: {
    id: Id<"users">;
    userId: string;
    email?: string;
    displayName?: string;
  }[];
  activeAccountId?: Id<"users"> | null;
  onRecordUpdated: () => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const addRecordAdmin = useMutation(api.records.addRecordAdmin);
  const removeRecordAdmin = useMutation(api.records.removeRecordAdmin);
  const unshareRecord = useMutation(api.records.unshareRecord);

  const adminIds = record.admins ?? [];
  const nonAdminMembers = familyMembers.filter((m) => !adminIds.includes(m.id));

  const handleAddAdmin = async () => {
    if (!selectedMemberId) return;
    setIsSubmitting(true);
    try {
      await addRecordAdmin({
        id: record._id,
        targetAccountId: selectedMemberId as Id<"users">,
        accountId: activeAccountId || undefined,
      });
      toast.success("管理者を設定しました");
      setSelectedMemberId("");
      await onRecordUpdated();
    } catch (e) {
      console.error(e);
      toast.error("管理者の追加に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveAdmin = async (targetId: Id<"users">) => {
    setIsSubmitting(true);
    try {
      await removeRecordAdmin({
        id: record._id,
        targetAccountId: targetId,
        accountId: activeAccountId || undefined,
      });
      toast.success("管理者を解除しました");
      await onRecordUpdated();
    } catch (e: unknown) {
      console.error(e);
      const raw = e instanceof Error ? e.message : "";
      toast.error(
        raw.includes("管理者が0人になるため削除できません")
          ? "管理者が0人になるため削除できません"
          : "管理者の解除に失敗しました",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnshare = async () => {
    setIsSubmitting(true);
    try {
      await unshareRecord({
        id: record._id,
        accountId: activeAccountId || undefined,
      });
      toast.success("共有を解除し、個人用レコードにしました");
      setIsOpen(false);
      await onRecordUpdated();
    } catch (e) {
      console.error(e);
      toast.error("共有解除に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-full bg-secondary hover:bg-accent text-foreground px-3 py-1 text-[12px] font-medium transition flex items-center gap-1 cursor-pointer"
        >
          <Users className="h-3 w-3" />
          共有設定
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>共有と管理者の設定</DialogTitle>
          <DialogDescription>
            家族共有レコードの管理者権限の追加・削除や共有の解除を行えます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* 管理者一覧 */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              現在の管理者 ({adminIds.length}名)
            </h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {(record.adminUsers && record.adminUsers.length > 0
                ? record.adminUsers
                : adminIds.map((id) => {
                    const m = familyMembers.find((f) => f.id === id);
                    return {
                      _id: id,
                      displayName: m?.displayName || "メンバー",
                      email: m?.email || "",
                    };
                  })
              ).map((admin) => (
                <div
                  key={admin._id}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-sm"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {admin.displayName || "メンバー"}
                      {admin._id === activeAccountId && " (あなた)"}
                    </div>
                    {admin.email && (
                      <div className="text-xs text-muted-foreground">
                        {admin.email}
                      </div>
                    )}
                  </div>
                  {adminIds.length > 1 && (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleRemoveAdmin(admin._id)}
                      className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 p-1 cursor-pointer"
                      title="管理者から外す"
                    >
                      解除
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 管理者を追加 */}
          {nonAdminMembers.length > 0 && (
            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                管理者の追加
              </h3>
              <div className="flex gap-2">
                <select
                  aria-label="管理者に追加する家族メンバー"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="flex-1 rounded-md bg-card p-2 text-xs shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  <option value="">家族メンバーを選択...</option>
                  {nonAdminMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName || "メンバー"} ({m.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedMemberId || isSubmitting}
                  onClick={handleAddAdmin}
                  className="rounded-md bg-orange-500 px-3 py-2 text-xs font-medium text-white shadow-border hover:bg-orange-600 disabled:opacity-50 transition cursor-pointer"
                >
                  追加
                </button>
              </div>
            </div>
          )}

          {/* 共有解除 */}
          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              共有の解除
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              共有を解除すると、このレコードはあなたの個人用（自分のみ）になり、他の家族メンバーは閲覧できなくなります。
            </p>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleUnshare}
              className="w-full rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-500/20 disabled:opacity-50 transition cursor-pointer"
            >
              共有を解除して個人用にする
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// E2EE対応: 暗号化されたヒントの復号表示カード
function CredentialCard({
  cred,
}: {
  cred: {
    id: string;
    label?: string;
    loginId?: string;
    passwordHint?: string;
    passwordHintIv?: string;
    passwordHintDekEncrypted?: string;
    passwordHintDekIv?: string;
  };
}) {
  const { decryptHint, requireUnlock, masterKey } = usePasscode();
  const [decryptedHint, setDecryptedHint] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  useEffect(() => {
    if (masterKey == null) {
      setDecryptedHint(null);
    }
  }, [masterKey]);

  const isEncrypted = !!cred.passwordHintIv && !!cred.passwordHint;

  const handleReveal = async () => {
    if (!isEncrypted || !cred.passwordHint || !cred.passwordHintIv) return;
    setIsDecrypting(true);
    try {
      const unlocked = await requireUnlock();
      if (!unlocked) return; // user cancelled or failed

      const plaintext = await decryptHint(
        cred.passwordHint,
        cred.passwordHintIv,
        cred.passwordHintDekEncrypted,
        cred.passwordHintDekIv,
      );
      setDecryptedHint(plaintext);
    } catch (error) {
      console.error("Decrypt failed:", error);
      toast.error("復号に失敗しました");
    } finally {
      setIsDecrypting(false);
    }
  };

  const displayedHint = isEncrypted ? decryptedHint : cred.passwordHint;

  return (
    <div className="rounded-md bg-muted/50 p-5 shadow-border-light relative">
      {cred.label && (
        <div className="mb-2 text-xs font-bold text-orange-600">
          {cred.label}
        </div>
      )}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">ログインID</div>
          {cred.loginId && (
            <CopyButton text={cred.loginId} label="ログインID" />
          )}
        </div>
        <div className="font-mono text-sm text-foreground select-all">
          {cred.loginId || "-"}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-muted-foreground">パスワードヒント</div>
          {displayedHint && (
            <CopyButton text={displayedHint} label="パスワードヒント" />
          )}
        </div>
        <div className="font-sans text-sm text-foreground whitespace-pre-wrap">
          {displayedHint ? (
            displayedHint
          ) : isEncrypted ? (
            <button
              type="button"
              onClick={handleReveal}
              disabled={isDecrypting}
              className="inline-flex items-center gap-1.5 rounded bg-orange-300/10 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-500/20 transition disabled:opacity-50"
            >
              {isDecrypting ? (
                <>
                  <Spinner className="h-3 w-3" />
                  復号中...
                </>
              ) : (
                "🔒 クリックして表示"
              )}
            </button>
          ) : (
            "-"
          )}
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label}をコピーしました`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-[11px] text-muted-foreground hover:text-foreground transition"
    >
      {copied ? (
        <>
          <span aria-hidden="true" className="text-green-500">
            ✓
          </span>
          <span className="ml-1 text-green-600">コピー済</span>
        </>
      ) : (
        <span>コピー</span>
      )}
    </button>
  );
}

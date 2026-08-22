import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { usePasscode } from "@/components/PasscodeProvider";
import { Spinner } from "@/components/ui/spinner";
import { TagInput } from "@/components/ui/tag-input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAccount } from "@/hooks/useAccount";
import { MAX_CREDENTIALS_PER_RECORD } from "@/utils/schemas";

export const Route = createFileRoute("/(app)/records/new")({
  component: NewRecordComponent,
});

function NewRecordComponent() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { isAuthenticated } = useConvexAuth();
  const { activeAccountId } = useAccount();
  const availableTags =
    useQuery(
      api.records.getAvailableTags,
      isAuthenticated ? { accountId: activeAccountId || undefined } : "skip",
    ) || [];
  const navigate = useNavigate();
  const { encryptHint, masterKey, requireUnlock } = usePasscode();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingOgp, setIsFetchingOgp] = useState(false);
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  const [showAdvancedTitle, setShowAdvancedTitle] = useState(false);

  const createRecord = useMutation(api.records.createRecord);
  const getOgpInfo = useAction(api.actions.getOgpInfo);
  const getFurigana = useAction(api.actions.getFurigana);

  // フォーム状態
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [titleReading, setTitleReading] = useState("");
  const [memo, setMemo] = useState("");
  const [ownerType, setOwnerType] = useState<"user" | "family">("user");

  // 非同期レース条件対策用
  const furiganaReqIdRef = useRef(0);
  const furiganaPromiseRef = useRef<Promise<string | null> | null>(null);
  const ogpPromiseRef = useRef<Promise<{
    title?: string;
    image?: string;
    description?: string;
  } | null> | null>(null);

  // ルビ取得リクエストを無効化
  const invalidateFuriganaRequest = () => {
    furiganaReqIdRef.current += 1;
    furiganaPromiseRef.current = null;
    setIsFetchingFurigana(false);
  };

  // ルビ取得関数（非同期競合を防止）
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

  // アカウント情報（複数登録可能）
  const [credentials, setCredentials] = useState([
    { label: "", loginId: "", passwordHint: "" },
  ]);

  // タグ
  const [tags, setTags] = useState<string[]>([]);

  const [ogpImage, setOgpImage] = useState("");
  const [ogpDescription, setOgpDescription] = useState("");

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

  const handleSubmit = async (e: React.SubmitEvent) => {
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

      // E2EE: パスワードヒントを暗号化
      const encryptedCredentials = await Promise.all(
        filteredCreds.map(async (cred) => {
          if (cred.passwordHint) {
            const { encrypted, iv, dekEncrypted, dekIv } = await encryptHint(
              cred.passwordHint,
            );
            return {
              id: crypto.randomUUID(),
              label: cred.label || undefined,
              loginId: cred.loginId || undefined,
              passwordHint: encrypted,
              passwordHintIv: iv,
              passwordHintDekEncrypted: dekEncrypted,
              passwordHintDekIv: dekIv,
            };
          }
          return {
            id: crypto.randomUUID(),
            label: cred.label || undefined,
            loginId: cred.loginId || undefined,
            passwordHint: cred.passwordHint || undefined,
            passwordHintIv: undefined,
            passwordHintDekEncrypted: undefined,
            passwordHintDekIv: undefined,
          };
        }),
      );

      await createRecord({
        accountId: activeAccountId || undefined,
        title,
        titleReading: currentTitleReading || undefined,
        url: url || undefined,
        ogpImage: ogpImage || undefined,
        ogpDescription: ogpDescription || undefined,
        memo: memo || undefined,
        ownerType,
        credentials: encryptedCredentials,
        tags,
      });

      toast.success("サービスを登録しました");
      // 作成成功後、ダッシュボードへ遷移
      await navigate({ to: "/dashboard" });
    } catch (error) {
      console.error("保存エラー:", error);
      toast.error("保存に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-8 text-[24px] font-semibold tracking-geist-h2 text-foreground">
        サービスを登録
      </h1>

      <form onSubmit={handleSubmit} className="space-y-8">
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
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                入力後にフォーカスを外すと情報を自動取得します
              </p>
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

        {/* アカウント情報（ID/ヒント）セクション */}
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

        {/* その他設定（公開設定・タグ・メモ） */}
        <section className="rounded-lg bg-card p-6 shadow-card transition-shadow space-y-6">
          <div>
            <span
              id="owner-type-label"
              className="block text-[14px] font-medium text-foreground mb-2"
            >
              所有設定
            </span>
            <ToggleGroup
              aria-labelledby="owner-type-label"
              type="single"
              value={ownerType}
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
                aria-label="自分のみ（個人用）"
                className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-md data-[state=on]:bg-orange-500 data-[state=on]:text-white data-[state=on]:border-orange-500 transition-colors"
              >
                自分のみ（個人用）
              </ToggleGroupItem>
              <ToggleGroupItem
                value="family"
                aria-label="家族と共有"
                className="flex-1 py-2.5 px-4 text-sm font-medium border rounded-md data-[state=on]:bg-blue-600 data-[state=on]:text-white data-[state=on]:border-blue-600 transition-colors"
              >
                家族と共有
              </ToggleGroupItem>
            </ToggleGroup>
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
            onClick={() => navigate({ to: "/dashboard" })}
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
              "登録する"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

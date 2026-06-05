import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { usePasscode } from "@/components/PasscodeProvider";
import { Spinner } from "@/components/ui/spinner";
import { TagInput } from "@/components/ui/tag-input";

export const Route = createFileRoute("/(app)/records/new")({
  component: NewRecordComponent,
});

function NewRecordComponent() {
  const { isAuthenticated } = useConvexAuth();
  const availableTags =
    useQuery(api.records.getAvailableTags, isAuthenticated ? {} : "skip") || [];
  const navigate = useNavigate();
  const { encryptHint, masterKey, requireUnlock } = usePasscode();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingOgp, setIsFetchingOgp] = useState(false);

  const createRecord = useMutation(api.records.createRecord);
  const getOgpInfo = useAction(api.actions.getOgpInfo);

  // フォーム状態
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [visibility, setVisibility] = useState<"PRIVATE" | "SHARED">("PRIVATE");

  // アカウント情報（複数登録可能）
  const [credentials, setCredentials] = useState([
    { label: "", loginId: "", passwordHint: "" },
  ]);

  // タグ
  const [tags, setTags] = useState<string[]>([]);

  // OGPダミー情報（本来はCloud Functionsから取得）
  const [ogpImage, setOgpImage] = useState("");
  const [ogpDescription, setOgpDescription] = useState("");

  const handleUrlBlur = async () => {
    if (!url) return;
    setIsFetchingOgp(true);
    try {
      const ogp = await getOgpInfo({ url });
      if (ogp.title && !title) setTitle(ogp.title);
      if (ogp.image) setOgpImage(ogp.image);
      if (ogp.description) setOgpDescription(ogp.description);
    } catch (e) {
      console.error("Failed to fetch OGP info", e);
    } finally {
      setIsFetchingOgp(false);
    }
  };

  const handleRemoveCredential = (indexToRemove: number) => {
    if (credentials.length <= 1) return;
    setCredentials(credentials.filter((_, i) => i !== indexToRemove));
  };

  const handleAddCredential = () => {
    setCredentials([
      ...credentials,
      { label: "", loginId: "", passwordHint: "" },
    ]);
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const hasHintsToEncrypt = credentials.some((c) => c.passwordHint);
      if (hasHintsToEncrypt && !masterKey) {
        const unlocked = await requireUnlock();
        if (!unlocked) {
          setIsLoading(false);
          return;
        }
      }

      // E2EE: パスワードヒントを暗号化
      const encryptedCredentials = await Promise.all(
        credentials.map(async (cred) => {
          if (cred.passwordHint) {
            const { encrypted, iv } = await encryptHint(cred.passwordHint);
            return {
              id: crypto.randomUUID(),
              label: cred.label || undefined,
              loginId: cred.loginId || undefined,
              passwordHint: encrypted,
              passwordHintIv: iv,
            };
          }
          return {
            id: crypto.randomUUID(),
            label: cred.label || undefined,
            loginId: cred.loginId || undefined,
            passwordHint: cred.passwordHint || undefined,
            passwordHintIv: undefined,
          };
        }),
      );

      await createRecord({
        title,
        url: url || undefined,
        ogpImage: ogpImage || undefined,
        ogpDescription: ogpDescription || undefined,
        memo: memo || undefined,
        visibility,
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
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
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
              className="text-[14px] font-medium text-orange-500 hover:text-orange-600 transition"
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
                    className="absolute right-3 top-3 text-muted-foreground hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="このアカウント情報を削除"
                  >
                    削除
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
                      htmlFor={`password-hint-input-${index}`}
                      className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
                    >
                      パスワードヒント
                    </label>
                    <input
                      id={`password-hint-input-${index}`}
                      type="text"
                      value={cred.passwordHint}
                      onChange={(e) => {
                        const newCreds = [...credentials];
                        newCreds[index].passwordHint = e.target.value;
                        setCredentials(newCreds);
                      }}
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
            <label
              htmlFor="visibility-input"
              className="block text-[14px] font-medium text-foreground mb-1"
            >
              公開設定
            </label>
            <select
              id="visibility-input"
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as "PRIVATE" | "SHARED")
              }
              className="w-full rounded-md bg-card p-2.5 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            >
              <option value="PRIVATE">自分のみ (Private)</option>
              <option value="SHARED">家族と共有 (Shared)</option>
            </select>
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
            disabled={isLoading}
            className="flex items-center rounded-md bg-orange-500 px-6 py-2 text-[14px] font-medium text-white shadow-border hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {isLoading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                保存中...
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

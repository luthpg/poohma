import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { usePasscode } from "@/components/PasscodeProvider";
import { useAccount } from "@/hooks/useAccount";
import {
  attemptSilentReauth,
  clearRecordDraft,
  hasRecordDraft,
  isAuthSessionError,
  loadRecordDraft,
  saveRecordDraft,
} from "@/lib/auth-recovery";
import {
  RECORD_FORM_VALIDATION_MESSAGES,
  type RecordFormValidationCode,
  validateRecordFormValues,
} from "@/utils/record-form-validation";
import {
  MAX_CREDENTIALS_PER_RECORD,
  MAX_TAGS_PER_RECORD,
} from "@/utils/schemas";

export interface RecordFormCredential {
  id?: string;
  label: string;
  loginId: string;
  passwordHint: string;
}

export interface RecordFormValues {
  title: string;
  titleReading: string;
  url: string;
  ogpImage: string;
  ogpDescription: string;
  memo: string;
  ownerType: "user" | "family";
  tags: string[];
  credentials: RecordFormCredential[];
}

export interface EncryptedCredentialPayload {
  id: string;
  label?: string;
  loginId?: string;
  passwordHint?: string;
  passwordHintIv?: string;
  passwordHintDekEncrypted?: string;
  passwordHintDekIv?: string;
}

export interface RecordSubmitPayload {
  title: string;
  titleReading?: string;
  url?: string;
  ogpImage?: string;
  ogpDescription?: string;
  memo?: string;
  ownerType: "user" | "family";
  tags: string[];
  credentials: EncryptedCredentialPayload[];
}

export class RecordFormValidationError extends Error {
  constructor(public readonly code: RecordFormValidationCode) {
    super(code);
    this.name = "RecordFormValidationError";
  }
}
export class RecordFormUnlockCancelledError extends Error {}

export function createEmptyCredential(): RecordFormCredential {
  return {
    id: crypto.randomUUID(),
    label: "",
    loginId: "",
    passwordHint: "",
  };
}

export function ensureCredentialIds(
  credentials?: RecordFormCredential[],
): RecordFormCredential[] {
  if (!credentials || credentials.length === 0) {
    return [createEmptyCredential()];
  }
  return credentials.map((cred) => ({
    ...cred,
    id: cred.id || crypto.randomUUID(),
  }));
}

const DEFAULT_VALUES: Omit<RecordFormValues, "credentials"> = {
  title: "",
  titleReading: "",
  url: "",
  ogpImage: "",
  ogpDescription: "",
  memo: "",
  ownerType: "user",
  tags: [],
};

export interface UseRecordFormOptions {
  onUnlockCancelled?: () => void;
}

export function useRecordForm(
  initialValues?: Partial<RecordFormValues>,
  targetRecordId?: string,
  draftId?: string,
  options?: UseRecordFormOptions,
) {
  const { activeAccountId } = useAccount();
  const { encryptHint, masterKey, requireUnlock } = usePasscode();

  const [values, setValues] = useState<RecordFormValues>(() => ({
    ...DEFAULT_VALUES,
    ...initialValues,
    credentials: ensureCredentialIds(initialValues?.credentials),
  }));

  // 編集開始時の復号データ等を反映する動的初期基準値
  const [baselineValues, setBaselineValuesState] = useState<
    Partial<RecordFormValues> | undefined
  >(initialValues);

  const [isFetchingOgp, setIsFetchingOgp] = useState(false);
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [restoredMetadata, setRestoredMetadata] = useState<{
    recordId?: string;
    initialRevision?: number | null;
    isEditing?: boolean;
    accountId?: string | null;
  } | null>(null);
  const [editingMetadata, setEditingMetadata] = useState<{
    initialRevision?: number | null;
    isEditing?: boolean;
  } | null>(null);

  const pendingActionRef = useRef<
    ((payload: RecordSubmitPayload) => Promise<void>) | null
  >(null);
  const initialValuesJsonRef = useRef(JSON.stringify(values));
  const isRestoredRef = useRef(false);
  const saveGenerationRef = useRef(0);

  const isDirty = JSON.stringify(values) !== initialValuesJsonRef.current;

  // 開始時アンロック連携（レコード別の初回マウント時のみ試行）:
  // 新規登録画面（!targetRecordId）または未保存ドラフトが存在する場合に requireUnlock を試行
  // ※ 同一レコード編集中にオートロックがかかった後に不必要にアンロックダイアログを再オープンしない。
  // ※ 別のレコード（または新規登録）に切り替わった際は、それぞれのレコード単位で初回アンロック判定を行う。
  const onUnlockCancelledRef = useRef(options?.onUnlockCancelled);
  onUnlockCancelledRef.current = options?.onUnlockCancelled;
  const lastAttemptedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const currentKey = `${targetRecordId ?? "new"}_${draftId ?? ""}`;
    if (lastAttemptedKeyRef.current === currentKey) return;

    if (!masterKey) {
      const shouldUnlock =
        !targetRecordId || hasRecordDraft({ targetRecordId, draftId });
      if (shouldUnlock) {
        lastAttemptedKeyRef.current = currentKey;
        requireUnlock()
          .then((unlocked) => {
            if (!unlocked) {
              onUnlockCancelledRef.current?.();
            }
          })
          .catch(() => {
            onUnlockCancelledRef.current?.();
          });
      }
    } else {
      // 既に masterKey がアンロック済みの状態で開かれた場合は初回試行済みとする
      lastAttemptedKeyRef.current = currentKey;
    }
  }, [masterKey, requireUnlock, targetRecordId, draftId]);

  // masterKey 解除時にドラフトが存在すれば自動復元（サイレントリフレッシュ / 再ログイン復帰時）
  useEffect(() => {
    if (typeof window === "undefined" || !masterKey) return;
    if (isRestoredRef.current) return;

    (async () => {
      try {
        const hadDraft = hasRecordDraft({ targetRecordId, draftId });
        const draft = await loadRecordDraft({
          targetRecordId,
          draftId,
          masterKey,
          currentAccountId: activeAccountId,
        });
        if (draft) {
          isRestoredRef.current = true;
          setValues(draft.values);
          setRestoredMetadata({
            recordId: targetRecordId,
            initialRevision: draft.initialRevision,
            isEditing: draft.isEditing,
            accountId: draft.accountId,
          });
          toast.success("未保存の入力内容を復元しました");
        } else if (hadDraft) {
          toast.error("未保存の下書きの復元に失敗しました");
        }
      } catch {
        toast.error("未保存の下書きの復元に失敗しました");
      }
    })();
  }, [masterKey, targetRecordId, draftId, activeAccountId]);

  // Auto-Save 処理（debounce & visibilitychange/pagehide）
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const restoredMetadataRef = useRef(restoredMetadata);
  restoredMetadataRef.current = restoredMetadata;
  const editingMetadataRef = useRef(editingMetadata);
  editingMetadataRef.current = editingMetadata;

  const performAutoSave = useCallback(
    async (currentValues: RecordFormValues) => {
      if (!masterKey || !isDirty) return;
      saveGenerationRef.current += 1;
      const currentGen = saveGenerationRef.current;

      try {
        await saveRecordDraft({
          targetRecordId,
          draftId,
          values: currentValues,
          masterKey,
          initialRevision:
            editingMetadataRef.current?.initialRevision ??
            restoredMetadataRef.current?.initialRevision,
          isEditing:
            editingMetadataRef.current?.isEditing ??
            restoredMetadataRef.current?.isEditing,
          accountId: activeAccountId,
          isCancelled: () => currentGen !== saveGenerationRef.current,
        });
      } catch {
        // ignore
      }
    },
    [masterKey, isDirty, targetRecordId, draftId, activeAccountId],
  );

  // 1000ms debounce auto-save
  useEffect(() => {
    if (!isDirty || !masterKey) return;
    const timer = setTimeout(() => {
      performAutoSave(values);
    }, 1000);
    return () => clearTimeout(timer);
  }, [values, isDirty, masterKey, performAutoSave]);

  // iOS Safari バックグラウンド退避（visibilitychange & pagehide）
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        performAutoSave(valuesRef.current);
      }
    };
    const handlePageHide = () => {
      performAutoSave(valuesRef.current);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [performAutoSave]);

  // 明示的キャンセル時のドラフト破棄
  const discardDraft = useCallback(() => {
    saveGenerationRef.current += 1;
    clearRecordDraft({ targetRecordId, draftId });
  }, [targetRecordId, draftId]);

  // フィールド単位の変更判定（初期基準値と現在の値を比較）
  const isFieldModified = useCallback(
    (field: string): boolean => {
      // 新規作成時（targetRecordId なし）は変更強調を行わない
      if (!targetRecordId) return false;

      if (field === "title")
        return values.title !== (baselineValues?.title ?? "");
      if (field === "titleReading")
        return values.titleReading !== (baselineValues?.titleReading ?? "");
      if (field === "url") return values.url !== (baselineValues?.url ?? "");
      if (field === "memo") return values.memo !== (baselineValues?.memo ?? "");
      if (field === "ownerType")
        return values.ownerType !== (baselineValues?.ownerType ?? "user");
      if (field === "tags") {
        const a = values.tags ?? [];
        const b = baselineValues?.tags ?? [];
        if (a.length !== b.length) return true;
        return a.some((t, i) => t !== b[i]);
      }
      if (field.startsWith("credential_")) {
        const parts = field.split("_");
        const index = Number.parseInt(parts[1], 10);
        const subfield = parts[2] as keyof RecordFormCredential;
        const currentCred = values.credentials[index];
        const initCred = baselineValues?.credentials?.[index];
        if (!currentCred) return false;
        if (!initCred) return true;
        return (currentCred[subfield] ?? "") !== (initCred[subfield] ?? "");
      }
      return false;
    },
    [values, baselineValues, targetRecordId],
  );

  const furiganaReqIdRef = useRef(0);
  const furiganaPromiseRef = useRef<Promise<string | null> | null>(null);
  const ogpPromiseRef = useRef<Promise<{
    title?: string;
    image?: string;
    description?: string;
  } | null> | null>(null);

  const getOgpInfo = useAction(api.actions.getOgpInfo);
  const getFurigana = useAction(api.actions.getFurigana);

  // ---- フォーム初期化・リセット ---------------------------------------

  const reset = useCallback((next: Partial<RecordFormValues>) => {
    furiganaReqIdRef.current += 1;
    furiganaPromiseRef.current = null;
    ogpPromiseRef.current = null;
    setIsFetchingFurigana(false);
    setIsFetchingOgp(false);
    const nextValues: RecordFormValues = {
      ...DEFAULT_VALUES,
      ...next,
      credentials: ensureCredentialIds(next.credentials),
    };
    setValues(nextValues);
    initialValuesJsonRef.current = JSON.stringify(nextValues);
    setBaselineValuesState(nextValues);
  }, []);

  const setBaselineValues = useCallback((next: Partial<RecordFormValues>) => {
    const nextBaseline: RecordFormValues = {
      ...DEFAULT_VALUES,
      ...next,
      credentials: ensureCredentialIds(next.credentials),
    };
    setBaselineValuesState(nextBaseline);
  }, []);

  const invalidateFuriganaRequest = useCallback(() => {
    furiganaReqIdRef.current += 1;
    furiganaPromiseRef.current = null;
    setIsFetchingFurigana(false);
  }, []);

  // ---- ふりがな・OGP 取得 ---------------------------------------------

  const fetchFuriganaForTitle = useCallback(
    (targetTitle: string) => {
      const text = targetTitle.trim();
      if (!text) return Promise.resolve(null);

      furiganaReqIdRef.current += 1;
      const currentReqId = furiganaReqIdRef.current;
      setIsFetchingFurigana(true);

      const promise = (async () => {
        try {
          const reading = await getFurigana({ text });
          if (currentReqId === furiganaReqIdRef.current && reading) {
            setValues((prev) => ({ ...prev, titleReading: reading }));
            return reading;
          }
          return null;
        } catch (_e) {
          return null;
        } finally {
          if (currentReqId === furiganaReqIdRef.current) {
            setIsFetchingFurigana(false);
          }
        }
      })();

      furiganaPromiseRef.current = promise;
      return promise;
    },
    [getFurigana],
  );

  const updateTitle = useCallback(
    (title: string) => {
      invalidateFuriganaRequest();
      setValues((prev) => ({ ...prev, title }));
    },
    [invalidateFuriganaRequest],
  );

  const updateTitleReading = useCallback(
    (titleReading: string) => {
      invalidateFuriganaRequest();
      setValues((prev) => ({ ...prev, titleReading }));
    },
    [invalidateFuriganaRequest],
  );

  const handleTitleBlur = useCallback(() => {
    if (!values.title || values.titleReading) return Promise.resolve(null);
    return fetchFuriganaForTitle(values.title);
  }, [values.title, values.titleReading, fetchFuriganaForTitle]);

  const setUrl = useCallback((url: string) => {
    setValues((prev) => ({ ...prev, url }));
  }, []);

  const handleUrlBlur = useCallback(() => {
    if (!values.url) return Promise.resolve(null);
    setIsFetchingOgp(true);

    const promise = (async () => {
      try {
        const ogp = await getOgpInfo({ url: values.url });
        const shouldFetchFuriganaFor =
          ogp.title && !values.title ? ogp.title : null;

        setValues((prev) => {
          const next = { ...prev };
          if (ogp.title && !prev.title) {
            next.title = ogp.title;
          }
          if (ogp.image) next.ogpImage = ogp.image;
          if (ogp.description) next.ogpDescription = ogp.description;
          return next;
        });

        if (shouldFetchFuriganaFor) {
          await fetchFuriganaForTitle(shouldFetchFuriganaFor);
        }
        return ogp;
      } catch (_e) {
        return null;
      } finally {
        setIsFetchingOgp(false);
      }
    })();

    ogpPromiseRef.current = promise;
    return promise;
  }, [values.url, values.title, getOgpInfo, fetchFuriganaForTitle]);

  const setMemo = useCallback((memo: string) => {
    setValues((prev) => ({ ...prev, memo }));
  }, []);

  const setOwnerType = useCallback((ownerType: "user" | "family") => {
    setValues((prev) => ({ ...prev, ownerType }));
  }, []);

  const setTags = useCallback((tags: string[]) => {
    if (tags.length > MAX_TAGS_PER_RECORD) {
      toast.error(`タグは${MAX_TAGS_PER_RECORD}個まで登録できます`);
      return;
    }
    setValues((prev) => ({ ...prev, tags }));
  }, []);

  // ---- credential 操作 ------------------------------------------------

  const addCredential = useCallback(() => {
    if (values.credentials.length >= MAX_CREDENTIALS_PER_RECORD) {
      toast.error(
        `アカウント情報は${MAX_CREDENTIALS_PER_RECORD}件まで登録できます`,
      );
      return;
    }
    setValues((prev) => ({
      ...prev,
      credentials: [...prev.credentials, createEmptyCredential()],
    }));
  }, [values.credentials.length]);

  const removeCredential = useCallback((index: number) => {
    setValues((prev) => {
      if (prev.credentials.length <= 1) return prev;
      const next = prev.credentials.filter((_, i) => i !== index);
      return { ...prev, credentials: next };
    });
  }, []);

  const updateCredentialField = useCallback(
    (index: number, field: keyof RecordFormCredential, value: string) => {
      setValues((prev) => {
        const next = [...prev.credentials];
        next[index] = { ...next[index], [field]: value };
        return { ...prev, credentials: next };
      });
    },
    [],
  );

  // ---- 暗号化ペイロード生成 -------------------------------------------

  const buildEncryptedPayload =
    useCallback(async (): Promise<RecordSubmitPayload> => {
      let currentTitleReading = values.titleReading;
      if (!currentTitleReading && furiganaPromiseRef.current) {
        currentTitleReading = (await furiganaPromiseRef.current) ?? "";
      }

      let ogpResult: {
        title?: string;
        image?: string;
        description?: string;
      } | null = null;

      if (ogpPromiseRef.current) {
        ogpResult = await ogpPromiseRef.current;
      }

      const filteredCreds = values.credentials.filter(
        (c) => c.label || c.loginId || c.passwordHint,
      );

      const validationError = validateRecordFormValues({
        memo: values.memo,
        credentials: filteredCreds,
      });
      if (validationError) {
        throw new RecordFormValidationError(validationError);
      }

      const hasHintsToEncrypt = filteredCreds.some((c) => c.passwordHint);
      if (hasHintsToEncrypt && !masterKey) {
        const unlocked = await requireUnlock();
        if (!unlocked) throw new RecordFormUnlockCancelledError();
      }

      const encryptedCredentials: EncryptedCredentialPayload[] =
        await Promise.all(
          filteredCreds.map(async (cred) => {
            const id = cred.id ?? crypto.randomUUID();
            if (cred.passwordHint) {
              const { encrypted, iv, dekEncrypted, dekIv } = await encryptHint(
                cred.passwordHint,
              );
              return {
                id,
                label: cred.label || undefined,
                loginId: cred.loginId || undefined,
                passwordHint: encrypted,
                passwordHintIv: iv,
                passwordHintDekEncrypted: dekEncrypted,
                passwordHintDekIv: dekIv,
              };
            }
            return {
              id,
              label: cred.label || undefined,
              loginId: cred.loginId || undefined,
              passwordHint: undefined,
              passwordHintIv: undefined,
              passwordHintDekEncrypted: undefined,
              passwordHintDekIv: undefined,
            };
          }),
        );

      const resolvedTitle = values.title || ogpResult?.title || "";
      const resolvedOgpImage = values.ogpImage || ogpResult?.image || undefined;
      const resolvedOgpDescription =
        values.ogpDescription || ogpResult?.description || undefined;

      return {
        title: resolvedTitle,
        titleReading: currentTitleReading || undefined,
        url: values.url || undefined,
        ogpImage: resolvedOgpImage,
        ogpDescription: resolvedOgpDescription,
        memo: values.memo || undefined,
        ownerType: values.ownerType,
        tags: values.tags,
        credentials: encryptedCredentials,
      };
    }, [values, masterKey, requireUnlock, encryptHint]);

  const submit = useCallback(
    async (
      action: (payload: RecordSubmitPayload) => Promise<void>,
    ): Promise<boolean> => {
      setIsSubmitting(true);
      try {
        const payload = await buildEncryptedPayload();

        try {
          await action(payload);
          pendingActionRef.current = null;
          saveGenerationRef.current += 1;

          // 保存成功時は即座にドラフトを物理削除
          clearRecordDraft({ targetRecordId, draftId });
          return true;
        } catch (actionErr) {
          // セッション切れエラー判定
          if (isAuthSessionError(actionErr)) {
            // 1. まずサイレント再認証を試行
            const refreshed = await attemptSilentReauth();
            if (refreshed) {
              try {
                await action(payload);
                pendingActionRef.current = null;
                saveGenerationRef.current += 1;
                clearRecordDraft({ targetRecordId, draftId });
                return true;
              } catch (retryErr) {
                if (isAuthSessionError(retryErr)) {
                  pendingActionRef.current = action;
                  setIsSessionExpired(true);
                  return false;
                }
                throw retryErr;
              }
            }

            // 2. サイレント失敗時は再認証モーダルを表示
            pendingActionRef.current = action;
            setIsSessionExpired(true);
            return false;
          }

          // セッション切れ以外の例外（CONFLICT等）は上位のハンドラへ伝播させるため再スロー
          throw actionErr;
        }
      } catch (err) {
        if (err instanceof RecordFormUnlockCancelledError) {
          return false;
        }
        if (err instanceof RecordFormValidationError) {
          toast.error(
            RECORD_FORM_VALIDATION_MESSAGES[err.code] ??
              "入力内容をご確認ください。",
          );
          return false;
        }

        // CONFLICT など上位（handleEditSubmit）でハンドリングされる業務例外なら汎用トーストを抑制
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("CONFLICT") || message.includes("競合")) {
          return false;
        }

        toast.error("保存に失敗しました。");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildEncryptedPayload, targetRecordId, draftId],
  );

  const retryPendingSubmit = useCallback(async (): Promise<boolean> => {
    if (!pendingActionRef.current) return false;
    const action = pendingActionRef.current;
    return submit(action);
  }, [submit]);

  return {
    values,
    updateTitle,
    updateTitleReading,
    handleTitleBlur,
    fetchFuriganaForTitle,
    setUrl,
    handleUrlBlur,
    setMemo,
    setOwnerType,
    setTags,
    addCredential,
    removeCredential,
    updateCredentialField,
    reset,
    setBaselineValues,
    submit,
    retryPendingSubmit,
    discardDraft,
    isFieldModified,
    isFetchingOgp,
    isFetchingFurigana,
    isSubmitting,
    isSessionExpired,
    setIsSessionExpired,
    restoredMetadata,
    setEditingMetadata,
    isDirty,
    targetRecordId,
  } as const;
}

export type UseRecordFormReturn = ReturnType<typeof useRecordForm>;

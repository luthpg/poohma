import { useAction } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import { usePasscode } from "@/components/PasscodeProvider";
import { validateRecordFormValues } from "@/utils/record-form-validation";
import { MAX_CREDENTIALS_PER_RECORD } from "@/utils/schemas";

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

export class RecordFormValidationError extends Error {}
export class RecordFormUnlockCancelledError extends Error {}

const EMPTY_CREDENTIAL: RecordFormCredential = {
  label: "",
  loginId: "",
  passwordHint: "",
};

const DEFAULT_VALUES: RecordFormValues = {
  title: "",
  titleReading: "",
  url: "",
  ogpImage: "",
  ogpDescription: "",
  memo: "",
  ownerType: "user",
  tags: [],
  credentials: [{ ...EMPTY_CREDENTIAL }],
};

export function useRecordForm(initialValues?: Partial<RecordFormValues>) {
  const [values, setValues] = useState<RecordFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
    credentials: initialValues?.credentials?.length
      ? initialValues.credentials
      : [{ ...EMPTY_CREDENTIAL }],
  });

  const [isFetchingOgp, setIsFetchingOgp] = useState(false);
  const [isFetchingFurigana, setIsFetchingFurigana] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const furiganaReqIdRef = useRef(0);
  const furiganaPromiseRef = useRef<Promise<string | null> | null>(null);
  const ogpPromiseRef = useRef<Promise<{
    title?: string;
    image?: string;
    description?: string;
  } | null> | null>(null);

  const getOgpInfo = useAction(api.actions.getOgpInfo);
  const getFurigana = useAction(api.actions.getFurigana);
  const { encryptHint, masterKey, requireUnlock } = usePasscode();

  // ---- フォーム初期化・リセット ---------------------------------------

  const reset = useCallback((next: Partial<RecordFormValues>) => {
    furiganaReqIdRef.current += 1;
    furiganaPromiseRef.current = null;
    ogpPromiseRef.current = null;
    setIsFetchingFurigana(false);
    setIsFetchingOgp(false);
    setValues({
      ...DEFAULT_VALUES,
      ...next,
      credentials: next.credentials?.length
        ? next.credentials
        : [{ ...EMPTY_CREDENTIAL }],
    });
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
          if (
            currentReqId === furiganaReqIdRef.current &&
            typeof reading === "string" &&
            reading
          ) {
            setValues((prev) => ({ ...prev, titleReading: reading }));
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
    },
    [getFurigana],
  );

  const updateTitle = useCallback(
    (title: string) => {
      invalidateFuriganaRequest();
      setValues((prev) => ({ ...prev, title, titleReading: "" }));
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
    if (values.title && !values.titleReading) {
      fetchFuriganaForTitle(values.title);
    }
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
        let shouldFetchFuriganaFor: string | null = null;

        setValues((prev) => {
          const next = { ...prev };
          if (ogp.title && !prev.title) {
            next.title = ogp.title;
            shouldFetchFuriganaFor = ogp.title;
          }
          if (ogp.image) next.ogpImage = ogp.image;
          if (ogp.description) next.ogpDescription = ogp.description;
          return next;
        });

        if (shouldFetchFuriganaFor) {
          await fetchFuriganaForTitle(shouldFetchFuriganaFor);
        }
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
  }, [values.url, getOgpInfo, fetchFuriganaForTitle]);

  const setMemo = useCallback((memo: string) => {
    setValues((prev) => ({ ...prev, memo }));
  }, []);

  const setOwnerType = useCallback((ownerType: "user" | "family") => {
    setValues((prev) => ({ ...prev, ownerType }));
  }, []);

  const setTags = useCallback((tags: string[]) => {
    setValues((prev) => ({ ...prev, tags }));
  }, []);

  // ---- credential 操作 ------------------------------------------------

  const addCredential = useCallback(() => {
    setValues((prev) => {
      if (prev.credentials.length >= MAX_CREDENTIALS_PER_RECORD) {
        toast.error(
          `アカウント情報は${MAX_CREDENTIALS_PER_RECORD}件まで登録できます`,
        );
        return prev;
      }
      return {
        ...prev,
        credentials: [...prev.credentials, { ...EMPTY_CREDENTIAL }],
      };
    });
  }, []);

  const removeCredential = useCallback((index: number) => {
    setValues((prev) => {
      if (prev.credentials.length <= 1) return prev;
      return {
        ...prev,
        credentials: prev.credentials.filter((_, i) => i !== index),
      };
    });
  }, []);

  const updateCredentialField = useCallback(
    (
      index: number,
      field: keyof Omit<RecordFormCredential, "id">,
      value: string,
    ) => {
      setValues((prev) => {
        const credentials = [...prev.credentials];
        if (!credentials[index]) return prev;
        credentials[index] = { ...credentials[index], [field]: value };
        return { ...prev, credentials };
      });
    },
    [],
  );

  // ---- 送信・暗号化 ----------------------------------------------------

  const buildEncryptedPayload =
    useCallback(async (): Promise<RecordSubmitPayload> => {
      let currentTitleReading = values.titleReading;
      if (ogpPromiseRef.current) {
        await ogpPromiseRef.current;
      }
      if (furiganaPromiseRef.current) {
        const fetched = await furiganaPromiseRef.current;
        if (fetched) currentTitleReading = fetched;
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

      return {
        title: values.title,
        titleReading: currentTitleReading || undefined,
        url: values.url || undefined,
        ogpImage: values.ogpImage || undefined,
        ogpDescription: values.ogpDescription || undefined,
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
        await action(payload);
        return true;
      } catch (err) {
        if (err instanceof RecordFormUnlockCancelledError) {
          return false;
        }
        if (err instanceof RecordFormValidationError) {
          toast.error(err.message);
          return false;
        }
        console.error("保存エラー:", err);
        toast.error("保存に失敗しました。");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [buildEncryptedPayload],
  );

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
    submit,
    isFetchingOgp,
    isFetchingFurigana,
    isSubmitting,
  } as const;
}

export type UseRecordFormReturn = ReturnType<typeof useRecordForm>;

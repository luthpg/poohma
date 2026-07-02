import { z } from "zod";

const Visibility = ["PRIVATE", "SHARED"] as const;

/** Base64形式の正規表現（標準Base64、空文字は不可） */
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/** IVは必ず12バイト。Base64でちょうど16文字かつパディングなし */
const IV_REGEX = /^[A-Za-z0-9+/]{16}$/;

/** AEAD (AES-GCM) データのスキーマ */
export const AeadDataSchema = z.object({
  iv: z.string().regex(IV_REGEX, "IVは16文字のBase64形式である必要があります"),
  ciphertext: z
    .string()
    .regex(BASE64_REGEX, "暗号データはBase64形式である必要があります")
    .refine((val) => {
      // AES-GCMの最小タグサイズは16バイト。Base64で最小22文字（パディング含め24文字）
      return val.length >= 22;
    }, "暗号データ（暗号文+認証タグ）の長さが不足しています"),
});

export const CredentialInputSchema = z
  .object({
    label: z
      .string()
      .max(100, "ラベルは100文字以内で入力してください")
      .optional(),
    loginId: z
      .string()
      .max(255, "ログインIDは255文字以内で入力してください")
      .optional(),
    passwordHint: z
      .string()
      .max(12000, "パスワードヒントの暗号データサイズが上限を超えています")
      .optional(),
    passwordHintIv: z.string().optional(),
    passwordHintDekEncrypted: z
      .string()
      .max(100, "DEK暗号データのサイズが上限を超えています")
      .optional(),
    passwordHintDekIv: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasHint = !!data.passwordHint;
    const hasIv = !!data.passwordHintIv;

    // passwordHint が非空なら IV も必須（暗号化済みであることの証明）
    if (hasHint && !hasIv) {
      ctx.addIssue({
        code: "custom",
        message:
          "パスワードヒントは暗号化して送信する必要があります（IVが不足しています）",
        path: ["passwordHintIv"],
      });
    }

    // IV があるのに hint が空はあり得ない
    if (!hasHint && hasIv) {
      ctx.addIssue({
        code: "custom",
        message: "IVが存在しますがパスワードヒントが空です",
        path: ["passwordHint"],
      });
    }

    // 両方あるなら AEAD スキーマで検証
    if (hasHint && hasIv) {
      const result = AeadDataSchema.safeParse({
        iv: data.passwordHintIv,
        ciphertext: data.passwordHint,
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            ...issue,
            path:
              issue.path[0] === "iv" ? ["passwordHintIv"] : ["passwordHint"],
          });
        }
      }
    }

    const hasDekEncrypted = !!data.passwordHintDekEncrypted;
    const hasDekIv = !!data.passwordHintDekIv;

    if (hasDekEncrypted && !hasDekIv) {
      ctx.addIssue({
        code: "custom",
        message: "DEK暗号データが存在しますがDEK IVが不足しています",
        path: ["passwordHintDekIv"],
      });
    }

    if (!hasDekEncrypted && hasDekIv) {
      ctx.addIssue({
        code: "custom",
        message: "DEK IVが存在しますがDEK暗号データが空です",
        path: ["passwordHintDekEncrypted"],
      });
    }

    // 両方あるなら AEAD スキーマで検証
    if (hasDekEncrypted && hasDekIv) {
      const result = AeadDataSchema.safeParse({
        iv: data.passwordHintDekIv,
        ciphertext: data.passwordHintDekEncrypted,
      });
      if (!result.success) {
        for (const issue of result.error.issues) {
          ctx.addIssue({
            ...issue,
            path:
              issue.path[0] === "iv"
                ? ["passwordHintDekIv"]
                : ["passwordHintDekEncrypted"],
          });
        }
      }
    }
  });

export const RecordInputSchema = z.object({
  title: z
    .string()
    .min(1, "タイトルは必須です")
    .max(255, "タイトルは255文字以内で入力してください"),
  url: z.url().optional().or(z.literal("")),
  ogpImage: z.string().url().optional().or(z.literal("")),
  ogpDescription: z.string().optional(),
  memo: z
    .string()
    .max(10000, "メモは10,000文字以内で入力してください")
    .optional(),
  visibility: z.enum(Visibility),
  credentials: z.array(CredentialInputSchema), // IDペアの配列
  tags: z.array(z.string().max(50, "タグは50文字以内で入力してください")), // タグ文字列の配列
});

export const CreateFamilyInputSchema = z
  .object({
    name: z
      .string()
      .min(1, "家族名は必須です")
      .max(100, "家族名は100文字以内で入力してください"),
    masterKeyEncrypted: z.string(),
    masterKeyIv: z.string(),
    masterKeySalt: z.string(),
  })
  .superRefine((data, ctx) => {
    const result = AeadDataSchema.safeParse({
      iv: data.masterKeyIv,
      ciphertext: data.masterKeyEncrypted,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path:
            issue.path[0] === "iv" ? ["masterKeyIv"] : ["masterKeyEncrypted"],
        });
      }
    }
    if (!BASE64_REGEX.test(data.masterKeySalt)) {
      ctx.addIssue({
        code: "custom",
        message: "ソルトはBase64形式である必要があります",
        path: ["masterKeySalt"],
      });
    }
  });

export const ChangeFamilyInputSchema = z
  .object({
    action: z.enum(["create", "join"]),
    // create用
    name: z.string().optional(),
    masterKeyEncrypted: z.string().optional(),
    masterKeyIv: z.string().optional(),
    masterKeySalt: z.string().optional(),
    // join用
    inviteCode: z.string().optional(),

    credentials: z.array(
      z
        .object({
          id: z.string(),
          passwordHint: z.string(),
          passwordHintIv: z.string(),
          passwordHintDekEncrypted: z.string().optional(),
          passwordHintDekIv: z.string().optional(),
        })
        .superRefine((data, ctx) => {
          const hintResult = AeadDataSchema.safeParse({
            iv: data.passwordHintIv,
            ciphertext: data.passwordHint,
          });
          if (!hintResult.success) {
            for (const issue of hintResult.error.issues) {
              ctx.addIssue({
                ...issue,
                path:
                  issue.path[0] === "iv"
                    ? ["passwordHintIv"]
                    : ["passwordHint"],
              });
            }
          }

          if (data.passwordHintDekEncrypted || data.passwordHintDekIv) {
            if (!data.passwordHintDekEncrypted || !data.passwordHintDekIv) {
              ctx.addIssue({
                code: "custom",
                message: "DEK暗号データとDEK IVは両方必要です",
                path: data.passwordHintDekEncrypted
                  ? ["passwordHintDekIv"]
                  : ["passwordHintDekEncrypted"],
              });
            } else {
              const dekResult = AeadDataSchema.safeParse({
                iv: data.passwordHintDekIv,
                ciphertext: data.passwordHintDekEncrypted,
              });
              if (!dekResult.success) {
                for (const issue of dekResult.error.issues) {
                  ctx.addIssue({
                    ...issue,
                    path:
                      issue.path[0] === "iv"
                        ? ["passwordHintDekIv"]
                        : ["passwordHintDekEncrypted"],
                  });
                }
              }
            }
          }
        }),
    ),
  })
  .superRefine((data, ctx) => {
    if (data.action === "create") {
      if (!data.name) {
        ctx.addIssue({
          code: "custom",
          message: "家族名は必須です",
          path: ["name"],
        });
      }
      if (
        !data.masterKeyEncrypted ||
        !data.masterKeyIv ||
        !data.masterKeySalt
      ) {
        ctx.addIssue({
          code: "custom",
          message: "マスターキー情報が不足しています",
          path: ["masterKeyEncrypted"],
        });
      } else {
        const result = AeadDataSchema.safeParse({
          iv: data.masterKeyIv,
          ciphertext: data.masterKeyEncrypted,
        });
        if (!result.success) {
          for (const issue of result.error.issues) {
            ctx.addIssue({
              ...issue,
              path:
                issue.path[0] === "iv"
                  ? ["masterKeyIv"]
                  : ["masterKeyEncrypted"],
            });
          }
        }
        if (!BASE64_REGEX.test(data.masterKeySalt)) {
          ctx.addIssue({
            code: "custom",
            message: "ソルトはBase64形式である必要があります",
            path: ["masterKeySalt"],
          });
        }
      }
    }
  });

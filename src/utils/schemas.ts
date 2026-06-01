import { z } from "zod";

const Visibility = ["PRIVATE", "SHARED"] as const;

/** Base64形式の正規表現（標準Base64、空文字は不可） */
const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

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
    passwordHint: z.string().optional(),
    passwordHintIv: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasHint = !!data.passwordHint;
    const hasIv = !!data.passwordHintIv;

    // passwordHint が非空なら IV も必須（暗号化済みであることの証明）
    if (hasHint && !hasIv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "パスワードヒントは暗号化して送信する必要があります（IVが不足しています）",
        path: ["passwordHintIv"],
      });
    }

    // IV があるのに hint が空はあり得ない
    if (!hasHint && hasIv) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IVが存在しますがパスワードヒントが空です",
        path: ["passwordHint"],
      });
    }

    // 非空の passwordHint は Base64 形式であること
    if (hasHint && !BASE64_REGEX.test(data.passwordHint as string)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "パスワードヒントはBase64形式（暗号化済み）である必要があります",
        path: ["passwordHint"],
      });
    }

    // 非空の passwordHintIv は Base64 形式であること
    if (hasIv && !BASE64_REGEX.test(data.passwordHintIv as string)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "IVはBase64形式である必要があります",
        path: ["passwordHintIv"],
      });
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
  memo: z.string().optional(),
  visibility: z.enum(Visibility),
  credentials: z.array(CredentialInputSchema), // IDペアの配列
  tags: z.array(z.string().max(50, "タグは50文字以内で入力してください")), // タグ文字列の配列
});

export const CreateFamilyInputSchema = z.object({
  name: z
    .string()
    .min(1, "家族名は必須です")
    .max(100, "家族名は100文字以内で入力してください"),
  masterKeyEncrypted: z.string(),
  masterKeyIv: z.string(),
  masterKeySalt: z.string(),
});

export const ChangeFamilyInputSchema = z.object({
  action: z.enum(["create", "join"]),
  // create用
  name: z.string().optional(),
  masterKeyEncrypted: z.string().optional(),
  masterKeyIv: z.string().optional(),
  masterKeySalt: z.string().optional(),
  // join用
  inviteCode: z.string().optional(),

  // 再暗号化された認証情報のリスト
  credentials: z.array(
    z.object({
      id: z.string(),
      passwordHint: z.string().regex(BASE64_REGEX, {
        message:
          "パスワードヒントはBase64形式（暗号化済み）である必要があります",
      }),
      passwordHintIv: z.string().regex(BASE64_REGEX, {
        message: "IVはBase64形式である必要があります",
      }),
    }),
  ),
});

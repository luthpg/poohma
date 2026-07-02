import { describe, expect, it } from "vitest";
import { RecordInputSchema } from "@/utils/schemas";

describe("RecordInputSchema", () => {
  it("should validate a valid record with encrypted hint", () => {
    const validData = {
      title: "Test Service",
      url: "https://example.com",
      ogpImage: "https://example.com/image.png",
      ogpDescription: "Test Description",
      memo: "Test Memo",
      visibility: "PRIVATE",
      credentials: [
        {
          label: "Admin",
          loginId: "admin@example.com",
          passwordHint: "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk", // Base64 encrypted hint
          passwordHintIv: "dGVzdGl2MTIzNDU2", // Base64 IV
        },
      ],
      tags: ["test", "service"],
    };

    const result = RecordInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should validate a credential without passwordHint", () => {
    const validData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [
        {
          label: "Admin",
          loginId: "admin@example.com",
        },
      ],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should reject plaintext passwordHint (not Base64)", () => {
    const invalidData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [
        {
          label: "Admin",
          passwordHint: "my secret hint", // plaintext with spaces
          passwordHintIv: "dGVzdGl2MTIzNDU2",
        },
      ],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it("should reject passwordHint without IV", () => {
    const invalidData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [
        {
          label: "Admin",
          passwordHint: "SGVsbG8gV29ybGQ=",
          // passwordHintIv is missing
        },
      ],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const ivIssue = result.error.issues.find((i) =>
        i.path.includes("passwordHintIv"),
      );
      expect(ivIssue).toBeDefined();
    }
  });

  it("should reject IV without passwordHint", () => {
    const invalidData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [
        {
          label: "Admin",
          passwordHintIv: "dGVzdGl2MTIzNDU2",
          // passwordHint is missing
        },
      ],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const hintIssue = result.error.issues.find((i) =>
        i.path.includes("passwordHint"),
      );
      expect(hintIssue).toBeDefined();
    }
  });

  it("should fail if title is empty", () => {
    const invalidData = {
      title: "",
      visibility: "PRIVATE",
      credentials: [],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("タイトルは必須です");
    }
  });

  it("should fail if url is invalid", () => {
    const invalidData = {
      title: "Test",
      url: "not-a-url",
      visibility: "PRIVATE",
      credentials: [],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it("should allow empty string for url", () => {
    const validData = {
      title: "Test",
      url: "",
      visibility: "PRIVATE",
      credentials: [],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  // --- .max() バリデーション ---

  it("should fail if title exceeds 255 characters", () => {
    const invalidData = {
      title: "a".repeat(256),
      visibility: "PRIVATE",
      credentials: [],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "タイトルは255文字以内で入力してください",
      );
    }
  });

  it("should allow title with exactly 255 characters", () => {
    const validData = {
      title: "a".repeat(255),
      visibility: "PRIVATE",
      credentials: [],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should fail if tag exceeds 50 characters", () => {
    const invalidData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [],
      tags: ["a".repeat(51)],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "タグは50文字以内で入力してください",
      );
    }
  });

  it("should fail if credential label exceeds 100 characters", () => {
    const invalidData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [{ label: "a".repeat(101) }],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "ラベルは100文字以内で入力してください",
      );
    }
  });

  it("should fail if credential loginId exceeds 255 characters", () => {
    const invalidData = {
      title: "Test",
      visibility: "PRIVATE",
      credentials: [{ loginId: "a".repeat(256) }],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "ログインIDは255文字以内で入力してください",
      );
    }
  });
});

import { CredentialInputSchema } from "@/utils/schemas";

describe("1.3 スキーマ・バリデーション (CredentialInputSchema)", () => {
  // 正常系のベースデータ
  const baseValidData = {
    label: "テスト用アカウント",
    loginId: "user@example.com",
  };

  const validBase64Hint = "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk"; // "Hello World" (extended for AEAD min length)
  const validBase64Iv = "dGVzdGl2MTIzNDU2"; // "testiv123456"

  describe("正常系（バリデーション成功）", () => {
    it("暗号化情報（ヒントとIV）が両方とも存在せずとも検証を通過すること", () => {
      const result = CredentialInputSchema.safeParse(baseValidData);
      expect(result.success).toBe(true);
    });

    it("暗号化情報（ヒントとIV）が両方とも正しいBase64形式で存在する場合、検証を通過すること", () => {
      const data = {
        ...baseValidData,
        passwordHint: validBase64Hint,
        passwordHintIv: validBase64Iv,
      };
      const result = CredentialInputSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe("異常系（E2EE相関チェックによるエラー）", () => {
    it("passwordHint のみ存在し、IV が欠落している場合はエラーになること", () => {
      const data = {
        ...baseValidData,
        passwordHint: validBase64Hint,
        // passwordHintIv なし
      };

      const result = CredentialInputSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        // superRefine によって 'passwordHintIv' フィールドに対するカスタムエラーが追加されているかを検証
        const ivIssue = result.error.issues.find((issue) =>
          issue.path.includes("passwordHintIv"),
        );
        expect(ivIssue).toBeDefined();
        expect(ivIssue?.message).toBe(
          "パスワードヒントは暗号化して送信する必要があります（IVが不足しています）",
        );
      }
    });

    it("IV のみ存在し、passwordHint が欠落している場合はエラーになること", () => {
      const data = {
        ...baseValidData,
        // passwordHint なし
        passwordHintIv: validBase64Iv,
      };

      const result = CredentialInputSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const hintIssue = result.error.issues.find((issue) =>
          issue.path.includes("passwordHint"),
        );
        expect(hintIssue).toBeDefined();
        expect(hintIssue?.message).toBe(
          "IVが存在しますがパスワードヒントが空です",
        );
      }
    });
  });

  describe("異常系（Base64フォーマットチェック）", () => {
    it("passwordHint がBase64形式でない（平文など）場合はエラーになること", () => {
      const data = {
        ...baseValidData,
        passwordHint: "平文のままのパスワードヒント", // 記号や全角が含まれBase64ではない
        passwordHintIv: validBase64Iv,
      };

      const result = CredentialInputSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const hintIssue = result.error.issues.find((issue) =>
          issue.path.includes("passwordHint"),
        );
        expect(hintIssue).toBeDefined();
        expect(hintIssue?.message).toBe(
          "暗号データはBase64形式である必要があります",
        );
      }
    });

    it("IV がBase64形式でない場合はエラーになること", () => {
      const data = {
        ...baseValidData,
        passwordHint: validBase64Hint,
        passwordHintIv: "invalid_iv_format_@#$", // 不正な文字列
      };

      const result = CredentialInputSchema.safeParse(data);

      expect(result.success).toBe(false);
      if (!result.success) {
        const ivIssue = result.error.issues.find((issue) =>
          issue.path.includes("passwordHintIv"),
        );
        expect(ivIssue).toBeDefined();
        expect(ivIssue?.message).toBe("IVは16文字のBase64形式である必要があります");
      }
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  ChangeFamilyInputSchema,
  CreateFamilyInputSchema,
  RecordInputSchema,
  RotatePasscodeInputSchema,
} from "@/utils/schemas";

describe("RecordInputSchema", () => {
  it("should validate a valid record with encrypted hint", () => {
    const validData = {
      title: "Test Service",
      url: "https://example.com",
      ogpImage: "https://example.com/image.png",
      ogpDescription: "Test Description",
      memo: "Test Memo",
      ownerType: "user" as const,
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
      ownerType: "user" as const,
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
      ownerType: "user" as const,
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
      ownerType: "user" as const,
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
      ownerType: "user" as const,
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
      ownerType: "user" as const,
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
      ownerType: "user" as const,
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
      ownerType: "user" as const,
      credentials: [],
      tags: [],
    };

    const result = RecordInputSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  // --- .max() バリデーション ---
  it.each([
    {
      desc: "title exceeds 255 characters",
      data: {
        title: "a".repeat(256),
        ownerType: "user" as const,
        credentials: [],
        tags: [],
      },
      expected: false,
    },
    {
      desc: "title is exactly 255 characters",
      data: {
        title: "a".repeat(255),
        ownerType: "user" as const,
        credentials: [],
        tags: [],
      },
      expected: true,
    },
    {
      desc: "tag exceeds 50 characters",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: [],
        tags: ["a".repeat(51)],
      },
      expected: false,
    },
    {
      desc: "credential label exceeds 100 characters",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: [{ label: "a".repeat(101) }],
        tags: [],
      },
      expected: false,
    },
    {
      desc: "credential loginId exceeds 255 characters",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: [{ loginId: "a".repeat(256) }],
        tags: [],
      },
      expected: false,
    },
    {
      desc: "exactly 10 credentials is valid",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: Array.from({ length: 10 }, (_, i) => ({
          label: `Cred${i}`,
        })),
        tags: [],
      },
      expected: true,
    },
    {
      desc: "11 credentials is rejected",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: Array.from({ length: 11 }, (_, i) => ({
          label: `Cred${i}`,
        })),
        tags: [],
      },
      expected: false,
    },
    {
      desc: "exactly 20 tags is valid",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: [],
        tags: Array.from({ length: 20 }, (_, i) => `tag${i}`),
      },
      expected: true,
    },
    {
      desc: "21 tags is rejected",
      data: {
        title: "Test",
        ownerType: "user" as const,
        credentials: [],
        tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
      },
      expected: false,
    },
    {
      desc: "ownerType family is valid",
      data: {
        title: "Family",
        ownerType: "family" as const,
        credentials: [],
        tags: [],
      },
      expected: true,
    },
    {
      desc: "invalid ownerType is rejected",
      data: {
        title: "Invalid",
        ownerType: "invalid_type",
        credentials: [],
        tags: [],
      },
      expected: false,
    },
  ])("should validate boundary conditions ($desc)", ({ data, expected }) => {
    const result = RecordInputSchema.safeParse(data);
    expect(result.success).toBe(expected);
  });
});

describe("CreateFamilyInputSchema & ChangeFamilyInputSchema KDF Metadata Validation", () => {
  const validFamilyData = {
    name: "山田家",
    masterKeyEncrypted: "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk",
    masterKeyIv: "dGVzdGl2MTIzNDU2",
    masterKeySalt: "dGVzdHNhbHQxMjM0NTY=",
  };

  it("kdfIterations / cryptoVersion を指定した場合、検証を通過すること", () => {
    const result = CreateFamilyInputSchema.safeParse({
      ...validFamilyData,
      kdfIterations: 300_000,
      cryptoVersion: 1,
    });
    expect(result.success).toBe(true);
  });

  it("kdfIterations / cryptoVersion を省略した場合も検証を通過すること", () => {
    const result = CreateFamilyInputSchema.safeParse(validFamilyData);
    expect(result.success).toBe(true);
  });

  it("kdfIterations が範囲外（100,000未満または2,000,000超）の場合は拒否されること", () => {
    const lowResult = CreateFamilyInputSchema.safeParse({
      ...validFamilyData,
      kdfIterations: 50_000,
    });
    expect(lowResult.success).toBe(false);

    const highResult = CreateFamilyInputSchema.safeParse({
      ...validFamilyData,
      kdfIterations: 3_000_000,
    });
    expect(highResult.success).toBe(false);
  });

  it("cryptoVersion が1未満の場合は拒否されること", () => {
    const result = CreateFamilyInputSchema.safeParse({
      ...validFamilyData,
      cryptoVersion: 0,
    });
    expect(result.success).toBe(false);
  });

  it("ChangeFamilyInputSchema の create アクションで kdfIterations / cryptoVersion が正しく検証されること", () => {
    const validChangeData = {
      action: "create" as const,
      name: "山田家",
      masterKeyEncrypted: "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk",
      masterKeyIv: "dGVzdGl2MTIzNDU2",
      masterKeySalt: "dGVzdHNhbHQxMjM0NTY=",
      kdfIterations: 400_000,
      cryptoVersion: 1,
      credentials: [],
    };
    const result = ChangeFamilyInputSchema.safeParse(validChangeData);
    expect(result.success).toBe(true);
  });
});

describe("RotatePasscodeInputSchema", () => {
  const validRotateData = {
    previousMasterKeyEncrypted: "b2xkTWFzdGVyS2V5RW5jcnlwdGVkRGF0YQ==",
    masterKeyEncrypted: "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk",
    masterKeyIv: "dGVzdGl2MTIzNDU2",
    masterKeySalt: "dGVzdHNhbHQxMjM0NTY=",
  };

  it("正しい鍵材料で検証を通過すること", () => {
    const result = RotatePasscodeInputSchema.safeParse(validRotateData);
    expect(result.success).toBe(true);
  });

  it("kdfIterations / cryptoVersion を指定した場合も検証を通過すること", () => {
    const result = RotatePasscodeInputSchema.safeParse({
      ...validRotateData,
      kdfIterations: 300_000,
      cryptoVersion: 1,
    });
    expect(result.success).toBe(true);
  });

  it("IVが不正な形式（16文字Base64以外）の場合はエラーになること", () => {
    const result = RotatePasscodeInputSchema.safeParse({
      ...validRotateData,
      masterKeyIv: "invalid-iv",
    });
    expect(result.success).toBe(false);
  });

  it("masterKeyEncryptedが短すぎる（タグ不足）の場合はエラーになること", () => {
    const result = RotatePasscodeInputSchema.safeParse({
      ...validRotateData,
      masterKeyEncrypted: "dG9vU2hvcnQ=",
    });
    expect(result.success).toBe(false);
  });

  it("masterKeySaltがBase64でない場合はエラーになること", () => {
    const result = RotatePasscodeInputSchema.safeParse({
      ...validRotateData,
      masterKeySalt: "not a base64 salt!",
    });
    expect(result.success).toBe(false);
  });

  it("kdfIterations が範囲外の場合はエラーになること", () => {
    const result = RotatePasscodeInputSchema.safeParse({
      ...validRotateData,
      kdfIterations: 50_000,
    });
    expect(result.success).toBe(false);
  });
});

describe("BASE64_REGEX strict validation", () => {
  const validRotateDataBase = {
    previousMasterKeyEncrypted: "b2xkTWFzdGVyS2V5RW5jcnlwdGVkRGF0YQ==",
    masterKeyEncrypted: "SGVsbG8gV29ybGQgYXV0aGVudGljYXRlZCBhZWFk",
    masterKeyIv: "dGVzdGl2MTIzNDU2",
  };

  it.each([
    { desc: "empty string", salt: "", expected: false },
    { desc: "invalid padding placement", salt: "ABC=DEFG", expected: false },
    {
      desc: "non-multiple-of-4 length",
      salt: "dGVzdHNhbHQxMjM0NTY",
      expected: false,
    },
    {
      desc: "valid with padding",
      salt: "dGVzdHNhbHQxMjM0NTY=",
      expected: true,
    },
    { desc: "valid without padding", salt: "dGVzdHNhbHQxMjM0", expected: true },
  ])("should validate base64 format ($desc)", ({ salt, expected }) => {
    const result = RotatePasscodeInputSchema.safeParse({
      ...validRotateDataBase,
      masterKeySalt: salt,
    });
    expect(result.success).toBe(expected);
  });
});

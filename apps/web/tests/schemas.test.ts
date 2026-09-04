import { describe, expect, it } from "vitest";
import {
	ChangeFamilyInputSchema,
	CreateFamilyInputSchema,
	CredentialInputSchema,
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

	it("should fail if title exceeds 255 characters", () => {
		const invalidData = {
			title: "a".repeat(256),
			ownerType: "user" as const,
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
			ownerType: "user" as const,
			credentials: [],
			tags: [],
		};

		const result = RecordInputSchema.safeParse(validData);
		expect(result.success).toBe(true);
	});

	it("should fail if tag exceeds 50 characters", () => {
		const invalidData = {
			title: "Test",
			ownerType: "user" as const,
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
			ownerType: "user" as const,
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
			ownerType: "user" as const,
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

	it("should accept exactly 10 credentials", () => {
		const validData = {
			title: "Test",
			ownerType: "user" as const,
			credentials: Array.from({ length: 10 }, (_, i) => ({
				label: `Cred${i}`,
			})),
			tags: [],
		};
		const result = RecordInputSchema.safeParse(validData);
		expect(result.success).toBe(true);
	});

	it("should reject 11 credentials", () => {
		const invalidData = {
			title: "Test",
			ownerType: "user" as const,
			credentials: Array.from({ length: 11 }, (_, i) => ({
				label: `Cred${i}`,
			})),
			tags: [],
		};
		const result = RecordInputSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});

	it("should validate ownerType: 'family'", () => {
		const validData = {
			title: "Family Record",
			ownerType: "family" as const,
			credentials: [],
			tags: [],
		};
		const result = RecordInputSchema.safeParse(validData);
		expect(result.success).toBe(true);
	});

	it("should allow omitted ownerType", () => {
		const validData = {
			title: "No Owner Type",
			credentials: [],
			tags: [],
		};
		const result = RecordInputSchema.safeParse(validData);
		expect(result.success).toBe(true);
	});

	it("should reject invalid ownerType", () => {
		const invalidData = {
			title: "Invalid Record",
			ownerType: "invalid_type",
			credentials: [],
			tags: [],
		};
		const result = RecordInputSchema.safeParse(invalidData);
		expect(result.success).toBe(false);
	});

	it("should allow up to MAX_TAGS_PER_RECORD tags and reject more", () => {
		const baseData = {
			title: "Tag Limit Test",
			ownerType: "user" as const,
			credentials: [],
		};

		// 20個（MAX_TAGS_PER_RECORD）は成功
		const tags20 = Array.from({ length: 20 }, (_, i) => `tag${i}`);
		const result20 = RecordInputSchema.safeParse({ ...baseData, tags: tags20 });
		expect(result20.success).toBe(true);

		// 21個は失敗
		const tags21 = Array.from({ length: 21 }, (_, i) => `tag${i}`);
		const result21 = RecordInputSchema.safeParse({ ...baseData, tags: tags21 });
		expect(result21.success).toBe(false);
		if (!result21.success) {
			expect(result21.error.issues[0].message).toContain("20個まで");
		}
	});

	it("should allow up to MAX_CREDENTIALS_PER_RECORD credentials and reject more", () => {
		const baseData = {
			title: "Credential Limit Test",
			ownerType: "user" as const,
			tags: [],
		};

		// 10個（MAX_CREDENTIALS_PER_RECORD）は成功
		const creds10 = Array.from({ length: 10 }, (_, i) => ({
			label: `Acc${i}`,
			loginId: `user${i}@example.com`,
		}));
		const result10 = RecordInputSchema.safeParse({
			...baseData,
			credentials: creds10,
		});
		expect(result10.success).toBe(true);

		// 11個は失敗
		const creds11 = Array.from({ length: 11 }, (_, i) => ({
			label: `Acc${i}`,
			loginId: `user${i}@example.com`,
		}));
		const result11 = RecordInputSchema.safeParse({
			...baseData,
			credentials: creds11,
		});
		expect(result11.success).toBe(false);
		if (!result11.success) {
			expect(result11.error.issues[0].message).toContain("10件まで");
		}
	});
});

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
				expect(ivIssue?.message).toBe(
					"IVは16文字のBase64形式である必要があります",
				);
			}
		});
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

	it("should reject empty string", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const saltIssue = result.error.issues.find((issue) =>
				issue.path.includes("masterKeySalt"),
			);
			expect(saltIssue).toBeDefined();
			expect(saltIssue?.message).toBe("ソルトはBase64形式である必要があります");
		}
	});

	it("should reject single-character base64-like string (e.g. 'A')", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "A",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const saltIssue = result.error.issues.find((issue) =>
				issue.path.includes("masterKeySalt"),
			);
			expect(saltIssue).toBeDefined();
			expect(saltIssue?.message).toBe("ソルトはBase64形式である必要があります");
		}
	});

	it("should reject base64-like string with incorrect length/padding (23 chars)", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "dGVzdHNhbHQxMjM0NTY", // 23 chars - not multiple of 4
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const saltIssue = result.error.issues.find((issue) =>
				issue.path.includes("masterKeySalt"),
			);
			expect(saltIssue).toBeDefined();
			expect(saltIssue?.message).toBe("ソルトはBase64形式である必要があります");
		}
	});

	it("should reject base64-like string with incorrect padding placement", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "ABC=DEFG", // padding in the middle
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const saltIssue = result.error.issues.find((issue) =>
				issue.path.includes("masterKeySalt"),
			);
			expect(saltIssue).toBeDefined();
			expect(saltIssue?.message).toBe("ソルトはBase64形式である必要があります");
		}
	});

	it("should accept valid base64 string with no padding (multiple of 4)", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "dGVzdHNhbHQ=", // valid 12 chars
		});
		expect(result.success).toBe(true);
	});

	it("should accept valid base64 string with single padding (=)", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "dGVzdA==", // valid 8 chars with == padding
		});
		expect(result.success).toBe(true);
	});

	it("should accept valid base64 string with double padding (==)", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "dGVzdHNhbHQxMjM0NTY=", // valid 24 chars with = padding
		});
		expect(result.success).toBe(true);
	});

	it("should accept valid base64 string without padding (exact multiple of 4)", () => {
		const result = RotatePasscodeInputSchema.safeParse({
			...validRotateDataBase,
			masterKeySalt: "dGVzdHNhbHQxMjM0", // valid 16 chars, no padding
		});
		expect(result.success).toBe(true);
	});
});

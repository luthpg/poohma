import { describe, expect, it } from "vitest";
import {
	MEMO_MAX_LENGTH,
	PASSWORD_HINT_MAX_LENGTH,
	validateRecordFormValues,
} from "@/utils/record-form-validation";

describe("validateRecordFormValues", () => {
	it("メモ・ヒントともに上限内であれば null を返すこと", () => {
		const result = validateRecordFormValues({
			memo: "普通のメモ",
			credentials: [{ passwordHint: "短いヒント" }],
		});
		expect(result).toBeNull();
	});

	it("メモが未定義でもエラーにならないこと", () => {
		const result = validateRecordFormValues({
			credentials: [],
		});
		expect(result).toBeNull();
	});

	it("メモが上限を超える場合はエラーメッセージを返すこと", () => {
		const result = validateRecordFormValues({
			memo: "a".repeat(MEMO_MAX_LENGTH + 1),
			credentials: [],
		});
		expect(result).toContain("メモ");
	});

	it("いずれかのcredentialのヒントが上限を超える場合はエラーメッセージを返すこと", () => {
		const result = validateRecordFormValues({
			memo: "",
			credentials: [
				{ passwordHint: "短い" },
				{ passwordHint: "a".repeat(PASSWORD_HINT_MAX_LENGTH + 1) },
			],
		});
		expect(result).toContain("パスワードヒント");
	});
});

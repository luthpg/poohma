export const MEMO_MAX_LENGTH = 10000;
export const PASSWORD_HINT_MAX_LENGTH = 2000;

export interface RecordFormValidationInput {
	memo?: string;
	credentials: { passwordHint?: string }[];
}

/**
 * レコードフォームの送信前バリデーション（暗号化前の平文に対して行う）。
 * 問題がなければ null、あればエラーメッセージ文字列を返す。
 */
export function validateRecordFormValues(
	input: RecordFormValidationInput,
): string | null {
	if (input.memo && input.memo.length > MEMO_MAX_LENGTH) {
		return `メモは${MEMO_MAX_LENGTH.toLocaleString()}文字以内で入力してください`;
	}
	const invalidHint = input.credentials.find(
		(c) => c.passwordHint && c.passwordHint.length > PASSWORD_HINT_MAX_LENGTH,
	);
	if (invalidHint) {
		return `パスワードヒントは${PASSWORD_HINT_MAX_LENGTH.toLocaleString()}文字以内で入力してください`;
	}
	return null;
}

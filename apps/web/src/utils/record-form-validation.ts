export const MEMO_MAX_LENGTH = 10000;
export const PASSWORD_HINT_MAX_LENGTH = 2000;

export interface RecordFormValidationInput {
  memo?: string;
  credentials: { passwordHint?: string }[];
}

export type RecordFormValidationCode = "memo_too_long" | "hint_too_long";

export const RECORD_FORM_VALIDATION_MESSAGES: Record<
  RecordFormValidationCode,
  string
> = {
  memo_too_long: `メモは${MEMO_MAX_LENGTH.toLocaleString()}文字以内で入力してください`,
  hint_too_long: `パスワードヒントは${PASSWORD_HINT_MAX_LENGTH.toLocaleString()}文字以内で入力してください`,
};

/**
 * レコードフォームの送信前バリデーション（暗号化前の平文に対して行う）。
 * 問題がなければ null、あればバリデーションエラーコードを返す。
 */
export function validateRecordFormValues(
  input: RecordFormValidationInput,
): RecordFormValidationCode | null {
  if (input.memo && input.memo.length > MEMO_MAX_LENGTH) {
    return "memo_too_long";
  }
  const invalidHint = input.credentials.find(
    (c) => c.passwordHint && c.passwordHint.length > PASSWORD_HINT_MAX_LENGTH,
  );
  if (invalidHint) {
    return "hint_too_long";
  }
  return null;
}

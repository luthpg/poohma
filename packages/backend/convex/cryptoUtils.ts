/**
 * 比較対象の固定上限文字数（秘密値・ハッシュ値の長さを隠蔽するための固定ループ長）
 * PoohMa で扱う SHA-256 ハッシュ（44〜64文字）や内部シークレット（32〜64文字）を安全に包含する。
 */
export const FIXED_COMPARE_LENGTH = 256;

/**
 * 定数時間での文字列比較（タイミング攻撃防止・CWE-208対策）
 *
 * 入力値および秘密値の長さに依存せず、常に固定長（FIXED_COMPARE_LENGTH = 256回）の走査ループを実行する。
 * これにより、文字内容の違いだけでなく、秘密値の長さ（文字数）に関する時間差情報の漏洩を完全に遮断する。
 * また、固定上限を超える巨大な入力に対してもループが肥大化せず、DoS を防止する。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const lenA = a.length;
  const lenB = b.length;

  // 長さの不一致をビットに蓄積
  let mismatch = lenA === lenB ? 0 : 1;

  // 上限（256文字）を超える長さの場合は不一致フラグを立てる
  mismatch |=
    (lenA > FIXED_COMPARE_LENGTH ? 1 : 0) |
    (lenB > FIXED_COMPARE_LENGTH ? 1 : 0);

  // 常に FIXED_COMPARE_LENGTH 回ループし、秘密値長・入力長に関わらず一定時間で比較
  for (let i = 0; i < FIXED_COMPARE_LENGTH; i++) {
    const charA = i < lenA ? a.charCodeAt(i) : 0;
    const charB = i < lenB ? b.charCodeAt(i) : 0;
    mismatch |= charA ^ charB;
  }

  return mismatch === 0;
}

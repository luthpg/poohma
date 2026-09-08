/**
 * CSVインジェクション攻撃を防ぐためのサニタイズ関数
 * Excel等の表計算ソフトで数式として解釈される先頭文字をエスケープします。
 */
export function sanitizeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";

  const strValue = String(value);
  // = (等号), + (プラス), - (マイナス), @ (アットマーク), \t (タブ), \r (キャリッジリターン) が先頭にある場合
  if (/^[=+\-@\t\r]/.test(strValue)) {
    return `'${strValue}`; // シングルクォートを付与して文字列として強制認識させる
  }
  return strValue;
}

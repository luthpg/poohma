/**
 * HTML文字列から安全にタグを除去してプレーンテキストを生成する。
 * <script> や <style> ブロックの中身を除去した上で、
 * タグ除去を繰り返し適用し、残留する孤立タグや多重タグ（例: <<script>script>）を完全に排除します。
 */
export function stripHtmlTags(input: string): string {
  if (!input) return "";

  // 1. <script>...</script> および <style>...</style> ブロックを中身ごと非貪欲に除去
  let text = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi, " ");

  // 2. HTMLタグの繰り返し除去（<[^<>]+> により、タグ外テキストの巻き込みやネストすり抜けを完全防止）
  let prev = "";
  while (text !== prev) {
    prev = text;
    text = text.replace(/<[^<>]+>/g, " ");
  }

  // 3. 閉じられていないタグ残骸による < や > の残留を物理的に排除
  const sanitized = text.replace(/[<>]/g, "");

  return sanitized.replace(/\s+/g, " ").trim();
}

/**
 * JSON-LD 構造化データオブジェクトを HTML <script type="application/ld+json"> 内に安全に埋め込むためのシリアライザー。
 * `<` や `>`、`&` などの HTML 特殊文字を Unicode エスケープシーケンスに置換することで、
 * </script> タグの早期終了や HTML 要素インジェクション (XSS) を完全に防ぎます。
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

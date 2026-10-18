/**
 * PoohMa 拡張機能用 URL / オリジン検証ユーティリティ
 */

/**
 * PoohMa の信頼されたオリジンパターン（動的環境・プレビュー・ローカル対応）
 */
export function isTrustedPoohmaOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".ciderlabs.link") ||
      host.endsWith(".vercel.app") ||
      host.endsWith(".workers.dev")
    );
  } catch {
    return false;
  }
}

/**
 * クエリパラメータやフラグメントを除去した正規化URLを取得
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return rawUrl;
  }
}

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
    const protocol = url.protocol;

    // ローカル開発環境（http / https 両対応）
    if (host === "localhost" || host === "127.0.0.1") {
      return protocol === "http:" || protocol === "https:";
    }

    // 外部環境は必ず HTTPS 必須
    if (protocol !== "https:") {
      return false;
    }

    // 公式ドメイン（本番・ステージング）
    if (host === "ciderlabs.link" || host.endsWith(".ciderlabs.link")) {
      return true;
    }

    // Vercel プレビューおよび本番（poohma プロジェクトおよび認証されたチームスコーププレビュー）
    if (
      host === "poohma.vercel.app" ||
      (host.startsWith("poohma-") &&
        host.endsWith("-luths-projects.vercel.app")) ||
      (host.startsWith("poohma-git-") && host.endsWith(".vercel.app"))
    ) {
      return true;
    }

    return false;
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

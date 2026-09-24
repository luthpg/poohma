/**
 * メールテンプレート内リンクやCTA用のベースURLを解決する。
 * 優先順位:
 * 1. process.env.VITE_SITE_URL（Convex / サーバー実行時）
 * 2. import.meta.env.VITE_SITE_URL（Viteクライアントバンドル時）
 * 3. デフォルト "https://poohma.ciderlabs.link"
 */
export function getEmailBaseUrl(): string {
  if (typeof process !== "undefined" && process.env?.VITE_SITE_URL) {
    return process.env.VITE_SITE_URL.replace(/\/+$/, "");
  }
  try {
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      typeof import.meta.env.VITE_SITE_URL === "string"
    ) {
      return import.meta.env.VITE_SITE_URL.replace(/\/+$/, "");
    }
  } catch {
    // import.meta 参照不可環境のフォールバック
  }
  return "https://poohma.ciderlabs.link";
}

/**
 * パスまたはURLを受け取り、完全な絶対URLを構築して返す。
 * - すでに "http://" や "https://" で始まる場合はそのまま返す。
 * - 相対パス（例: "/family", "records"）の場合は getEmailBaseUrl() を前置する。
 */
export function resolveEmailUrl(pathOrUrl?: string): string {
  if (!pathOrUrl) {
    return getEmailBaseUrl();
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${getEmailBaseUrl()}${cleanPath}`;
}

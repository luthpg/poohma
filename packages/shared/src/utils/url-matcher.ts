import { parse } from "tldts";

export type UrlMatchType = "exact" | "related" | "none";

/**
 * URL から正規化されたオリジン (例: "https://example.com") を抽出
 * - http / https スキームのみ許可
 * - ポート番号が含まれる場合はポートも維持 (例: "https://example.com:8080")
 * - 不正なURLやサポート外スキームは null を返す
 */
export function normalizeOrigin(
  urlString: string | null | undefined,
): string | null {
  if (!urlString) return null;
  try {
    const url = new URL(urlString.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * 現在の閲覧ページURLと、保存されているレコードURLを照合する
 *
 * @returns
 * - "exact": オリジンが完全一致 (例: https://example.com と https://example.com/login)
 * - "related": 同一の登録可能ドメイン (eTLD+1) の別サブドメイン (例: https://accounts.google.com と https://google.com)
 * - "none": ドメインが異なる、または無効なURL (例: https://example.com.evil.test と https://example.com)
 */
export function matchRecordUrl(
  pageUrl: string | null | undefined,
  recordUrl: string | null | undefined,
): UrlMatchType {
  const pageOrigin = normalizeOrigin(pageUrl);
  const recordOrigin = normalizeOrigin(recordUrl);

  if (!pageOrigin || !recordOrigin) {
    return "none";
  }

  // 1. 完全オリジン一致
  if (pageOrigin === recordOrigin) {
    return "exact";
  }

  // 2. 登録可能ドメイン (eTLD+1) 照合
  try {
    const pageParsed = parse(pageOrigin, { allowPrivateDomains: true });
    const recordParsed = parse(recordOrigin, { allowPrivateDomains: true });

    // スキームが異なる場合は関連候補としない (例: http と https の混在は安全のため除外)
    const pageProtocol = new URL(pageOrigin).protocol;
    const recordProtocol = new URL(recordOrigin).protocol;
    if (pageProtocol !== recordProtocol) {
      return "none";
    }

    // domain (eTLD+1) が存在し、かつ一致するか検証
    // tldts は Public Suffix List を考慮するため、
    // "example.com.evil.test" の domain は "evil.test" となり、"example.com" とは一致しない。
    if (
      pageParsed.domain &&
      recordParsed.domain &&
      pageParsed.domain.toLowerCase() === recordParsed.domain.toLowerCase()
    ) {
      return "related";
    }
  } catch {
    return "none";
  }

  return "none";
}

/**
 * 照合結果がログインIDの自動入力補助 (FILL_LOGIN_ID) の対象として安全か判定
 * - "exact" (同一オリジン) のみ許可
 * - "related" (別サブドメイン) はフィッシングやテナント越境防止のため自動入力対象から除外
 */
export function isEligibleForIdFill(matchType: UrlMatchType): boolean {
  return matchType === "exact";
}

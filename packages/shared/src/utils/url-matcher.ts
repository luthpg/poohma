import { parse } from "tldts";

export type UrlMatchType = "exact" | "related" | "none";

export type DomainRankTier = 1 | 2 | 3;

export interface DomainRankResult {
  tier: DomainRankTier;
  matchedLabels: number;
}

/**
 * URL からプロトコル (http: または https:) を抽出
 */
export function extractProtocol(
  urlString: string | null | undefined,
): string | null {
  if (!urlString) return null;
  try {
    const url = new URL(urlString.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.protocol;
  } catch {
    return null;
  }
}

/**
 * URL から正規化されたホスト名を取得
 * - http / https スキームのみ許可
 * - 小文字化
 * - 先頭の "www." を除去
 * - ポート・パス・クエリ・フラグメントは除外
 */
export function normalizeHostname(
  urlString: string | null | undefined,
): string | null {
  if (!urlString) return null;
  try {
    const url = new URL(urlString.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

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
 * 閲覧中URLとレコードURLのドメイン一致度を段階評価する
 *
 * @returns
 * - tier 1: 完全一致 (正規化ホストが一致)
 * - tier 2: メインドメイン一致 (同じ eTLD+1 で、保存URLの正規化ホストがルートドメイン)
 * - tier 3: 一部サブドメイン一致 (同じ eTLD+1 で、後方から連続して一致するラベル数 matchedLabels を付与)
 * - 不一致または不正URL、スキーム不一致の場合は null
 */
export function rankRecordUrl(
  pageUrl: string | null | undefined,
  recordUrl: string | null | undefined,
): DomainRankResult | null {
  // スキーム検証（HTTP/HTTPS スキーム違いは関連候補から除外）
  const pageProto = extractProtocol(pageUrl);
  const recordProto = extractProtocol(recordUrl);
  if (!pageProto || !recordProto || pageProto !== recordProto) {
    return null;
  }

  const pageHost = normalizeHostname(pageUrl);
  const recordHost = normalizeHostname(recordUrl);
  if (!pageHost || !recordHost) {
    return null;
  }

  // 1. 完全一致 (tier 1): eTLD+1 を持たないホスト (localhost / IPアドレス / 単一ラベル等) も同一ホストなら tier 1
  if (pageHost === recordHost) {
    return {
      tier: 1,
      matchedLabels: pageHost.split(".").length,
    };
  }

  try {
    const pageParsed = parse(pageHost, { allowPrivateDomains: true });
    const recordParsed = parse(recordHost, { allowPrivateDomains: true });

    if (
      !pageParsed.domain ||
      !recordParsed.domain ||
      pageParsed.domain.toLowerCase() !== recordParsed.domain.toLowerCase()
    ) {
      return null;
    }

    const rootDomain = recordParsed.domain.toLowerCase();

    // 2. メインドメイン一致 (tier 2: 保存URLの正規化ホストがルートドメイン)
    if (recordHost === rootDomain) {
      return {
        tier: 2,
        matchedLabels: rootDomain.split(".").length,
      };
    }

    // 3. 一部サブドメイン一致 (tier 3: 右端から連続して一致するラベル数を数える)
    const pageLabels = pageHost.split(".");
    const recordLabels = recordHost.split(".");
    let matchedLabels = 0;
    const minLen = Math.min(pageLabels.length, recordLabels.length);
    for (let i = 1; i <= minLen; i++) {
      if (
        pageLabels[pageLabels.length - i] ===
        recordLabels[recordLabels.length - i]
      ) {
        matchedLabels++;
      } else {
        break;
      }
    }

    return {
      tier: 3,
      matchedLabels,
    };
  } catch {
    return null;
  }
}

/**
 * レコード配列を閲覧中URLに対するドメイン一致度順（tier 昇順 → matchedLabels 降順 → 安定ソート）でソート
 */
export function sortByDomainRank<T extends { url?: string | null }>(
  records: T[],
  pageUrl: string | null | undefined,
): T[] {
  if (!pageUrl) return [];

  interface RankedItem {
    record: T;
    rank: DomainRankResult;
    index: number;
  }

  const ranked: RankedItem[] = [];

  records.forEach((record, index) => {
    if (!record.url) return;
    const rank = rankRecordUrl(pageUrl, record.url);
    if (rank !== null) {
      ranked.push({ record, rank, index });
    }
  });

  ranked.sort((a, b) => {
    // 1. tier 昇順 (1 -> 2 -> 3)
    if (a.rank.tier !== b.rank.tier) {
      return a.rank.tier - b.rank.tier;
    }
    // 2. matchedLabels 降順 (4 -> 3)
    if (a.rank.matchedLabels !== b.rank.matchedLabels) {
      return b.rank.matchedLabels - a.rank.matchedLabels;
    }
    // 3. 元インデックス順（安定ソート）
    return a.index - b.index;
  });

  return ranked.map((item) => item.record);
}

/**
 * 現在の閲覧ページURLと、保存されているレコードURLを照合する（後方互換・オリジン判定用）
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

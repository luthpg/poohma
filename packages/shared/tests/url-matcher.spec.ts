import { describe, expect, it } from "vitest";
import {
  extractProtocol,
  isEligibleForIdFill,
  matchRecordUrl,
  normalizeHostname,
  normalizeOrigin,
  rankRecordUrl,
  sortByDomainRank,
} from "../src/utils/url-matcher";

describe("url-matcher", () => {
  describe("extractProtocol", () => {
    it("httpおよびhttpsスキームを抽出できること", () => {
      expect(extractProtocol("https://example.com")).toBe("https:");
      expect(extractProtocol("http://example.com/path")).toBe("http:");
    });

    it("無効なURLやサポート外スキームではnullを返すこと", () => {
      expect(extractProtocol("ftp://example.com")).toBeNull();
      expect(extractProtocol("javascript:alert(1)")).toBeNull();
      expect(extractProtocol("invalid")).toBeNull();
      expect(extractProtocol(null)).toBeNull();
    });
  });

  describe("normalizeHostname", () => {
    it("有効なURLから小文字化されたホスト名を取得できること", () => {
      expect(normalizeHostname("https://EXAMPLE.COM/login")).toBe(
        "example.com",
      );
    });

    it("先頭の www. を除去すること", () => {
      expect(normalizeHostname("https://www.example.com")).toBe("example.com");
      expect(normalizeHostname("https://www.login.example.co.jp")).toBe(
        "login.example.co.jp",
      );
    });

    it("ポート番号やパス、クエリを除外すること", () => {
      expect(
        normalizeHostname("https://example.com:8080/path?foo=bar#hash"),
      ).toBe("example.com");
    });

    it("無効なURLではnullを返すこと", () => {
      expect(normalizeHostname("not-a-url")).toBeNull();
      expect(normalizeHostname("")).toBeNull();
      expect(normalizeHostname(null)).toBeNull();
    });
  });

  describe("normalizeOrigin", () => {
    it("有効なHTTPS URLからオリジンを抽出できること", () => {
      expect(normalizeOrigin("https://example.com/login?foo=bar#hash")).toBe(
        "https://example.com",
      );
    });

    it("ポート番号を含むURLでポートが保持されること", () => {
      expect(normalizeOrigin("https://localhost:3000/dashboard")).toBe(
        "https://localhost:3000",
      );
    });

    it("HTTP URLも有効なオリジンとして抽出できること", () => {
      expect(normalizeOrigin("http://example.com/")).toBe("http://example.com");
    });

    it("無効なURL文字列やjavascript:スキームではnullを返すこと", () => {
      expect(normalizeOrigin("not-a-url")).toBeNull();
      expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
      expect(normalizeOrigin("file:///C:/Users/file.txt")).toBeNull();
      expect(normalizeOrigin("")).toBeNull();
      expect(normalizeOrigin(null)).toBeNull();
      expect(normalizeOrigin(undefined)).toBeNull();
    });
  });

  describe("rankRecordUrl", () => {
    const pageUrl = "https://login.accounts.example.co.jp/signin";

    it("完全一致 (tier 1): 正規化ホスト名が一致すること", () => {
      const res1 = rankRecordUrl(
        pageUrl,
        "https://login.accounts.example.co.jp/settings",
      );
      expect(res1).toEqual({ tier: 1, matchedLabels: 5 });

      // www. 付きも正規化で完全一致
      const res2 = rankRecordUrl(
        pageUrl,
        "https://www.login.accounts.example.co.jp",
      );
      expect(res2).toEqual({ tier: 1, matchedLabels: 5 });

      // ポート番号違いもホスト名が同じなら tier 1
      const res3 = rankRecordUrl(
        pageUrl,
        "https://login.accounts.example.co.jp:8443/login",
      );
      expect(res3).toEqual({ tier: 1, matchedLabels: 5 });
    });

    it("メインドメイン一致 (tier 2): 保存URLの正規化ホストが登録可能ドメインそのものであること", () => {
      const res1 = rankRecordUrl(pageUrl, "https://example.co.jp");
      expect(res1).toEqual({ tier: 2, matchedLabels: 3 });

      const res2 = rankRecordUrl(pageUrl, "https://www.example.co.jp");
      expect(res2).toEqual({ tier: 2, matchedLabels: 3 });
    });

    it("一部サブドメイン一致 (tier 3): 右端から連続して一致するラベル数を返すこと", () => {
      // accounts.example.co.jp -> 4ラベル一致 (jp, co, example, accounts)
      const res1 = rankRecordUrl(pageUrl, "https://accounts.example.co.jp");
      expect(res1).toEqual({ tier: 3, matchedLabels: 4 });

      // admin.accounts.example.co.jp -> 4ラベル一致
      const res2 = rankRecordUrl(
        pageUrl,
        "https://admin.accounts.example.co.jp",
      );
      expect(res2).toEqual({ tier: 3, matchedLabels: 4 });

      // mail.example.co.jp -> 3ラベル一致 (jp, co, example)
      const res3 = rankRecordUrl(pageUrl, "https://mail.example.co.jp");
      expect(res3).toEqual({ tier: 3, matchedLabels: 3 });
    });

    it("登録可能ドメインが異なる場合は null (対象外) を返すこと", () => {
      expect(
        rankRecordUrl(pageUrl, "https://login.accounts.other.co.jp"),
      ).toBeNull();
      expect(
        rankRecordUrl(pageUrl, "https://example.co.jp.evil.test"),
      ).toBeNull();
    });

    it("スキームが異なる場合 (http と https) は null (対象外) を返すこと", () => {
      expect(
        rankRecordUrl(pageUrl, "http://login.accounts.example.co.jp/settings"),
      ).toBeNull();
    });

    it("PSL Private Domain の境界を跨ぐ場合は null を返すこと", () => {
      expect(
        rankRecordUrl("https://user-a.github.io", "https://user-b.github.io"),
      ).toBeNull();
    });

    it("eTLD+1 を持たないホスト (localhost / IP / 単一ラベル) でも同一ホストなら tier 1 を返すこと", () => {
      expect(
        rankRecordUrl("http://localhost:3000/login", "http://localhost:8080"),
      ).toEqual({ tier: 1, matchedLabels: 1 });
      expect(
        rankRecordUrl("http://192.168.0.1/admin", "http://192.168.0.1:80"),
      ).toEqual({ tier: 1, matchedLabels: 4 });
      expect(
        rankRecordUrl("http://intranet/portal", "http://intranet:8080/app"),
      ).toEqual({ tier: 1, matchedLabels: 1 });
      // 異なるIPやホストは null
      expect(
        rankRecordUrl("http://192.168.0.1/admin", "http://192.168.0.2/admin"),
      ).toBeNull();
      expect(
        rankRecordUrl("http://localhost:3000", "http://otherhost:3000"),
      ).toBeNull();
    });
  });

  describe("sortByDomainRank (Issue 383 表示例テーブルの総合検証)", () => {
    it("閲覧中URLに対応する候補一覧が仕様どおりの優先順位と安定ソートで整列されること", () => {
      const pageUrl = "https://login.accounts.example.co.jp/signin";

      const records = [
        { id: "1", url: "https://mail.example.co.jp" }, // tier 3, matched 3
        { id: "2", url: "https://login.accounts.other.co.jp" }, // 不一致
        { id: "3", url: "https://example.co.jp" }, // tier 2, matched 3
        { id: "4", url: "https://www.example.co.jp" }, // tier 2, matched 3
        { id: "5", url: "https://login.accounts.example.co.jp/settings" }, // tier 1, matched 5
        { id: "6", url: "https://example.co.jp.evil.test" }, // 不一致
        { id: "7", url: "https://www.login.accounts.example.co.jp" }, // tier 1, matched 5
        { id: "8", url: "https://accounts.example.co.jp" }, // tier 3, matched 4
        { id: "9", url: "https://admin.accounts.example.co.jp" }, // tier 3, matched 4
      ];

      const sorted = sortByDomainRank(records, pageUrl);

      // 不一致の 2 と 6 が除外されていること
      expect(sorted.map((r) => r.id)).toEqual([
        "5", // 完全一致 1 (入力順で 5 が先)
        "7", // 完全一致 1と同順位 (入力順で 7 が後)
        "3", // メインドメイン一致 2
        "4", // メインドメイン一致 2と同順位
        "8", // 一部サブドメイン一致・後方4ラベル
        "9", // 一部サブドメイン一致・後方4ラベルと同順位
        "1", // 一部サブドメイン一致・後方3ラベル
      ]);
    });
  });

  describe("matchRecordUrl", () => {
    it("完全同一オリジンの場合は exact を返すこと", () => {
      expect(
        matchRecordUrl(
          "https://example.com/login",
          "https://example.com/settings",
        ),
      ).toBe("exact");
    });

    it("同一登録可能ドメイン (eTLD+1) の別サブドメインの場合は related を返すこと", () => {
      // Google のメインサイトと認証サブドメイン
      expect(
        matchRecordUrl(
          "https://accounts.google.com/signin",
          "https://google.com",
        ),
      ).toBe("related");

      // Yahoo! JAPAN
      expect(
        matchRecordUrl(
          "https://login.yahoo.co.jp/v1/auth",
          "https://yahoo.co.jp",
        ),
      ).toBe("related");
    });

    it("悪意ある類似ドメインやフィッシングURLは none を返すこと", () => {
      // サブドメインに見せかけた別ドメイン
      expect(
        matchRecordUrl(
          "https://google.com.evil.test/login",
          "https://google.com",
        ),
      ).toBe("none");

      // タイポスクワッティング
      expect(
        matchRecordUrl("https://evilgoogle.com/login", "https://google.com"),
      ).toBe("none");
    });

    it("共有ホスティングの別テナントは一致させないこと", () => {
      // github.io などの PSL private ドメイン
      expect(
        matchRecordUrl(
          "https://alice.github.io/app",
          "https://bob.github.io/app",
        ),
      ).toBe("none");
    });

    it("スキームが異なる場合 (http と https) は一致させないこと", () => {
      expect(
        matchRecordUrl("http://example.com/login", "https://example.com"),
      ).toBe("none");
    });

    it("ポートが異なる場合は none を返すこと", () => {
      expect(
        matchRecordUrl(
          "https://localhost:3000/login",
          "https://localhost:4000/login",
        ),
      ).toBe("none");
    });

    it("いずれかのURLが無効または空の場合は none を返すこと", () => {
      expect(matchRecordUrl("invalid", "https://example.com")).toBe("none");
      expect(matchRecordUrl("https://example.com", null)).toBe("none");
    });
  });

  describe("isEligibleForIdFill", () => {
    it("exact のみ true を返し、related や none は false を返すこと", () => {
      expect(isEligibleForIdFill("exact")).toBe(true);
      expect(isEligibleForIdFill("related")).toBe(false);
      expect(isEligibleForIdFill("none")).toBe(false);
    });
  });
});

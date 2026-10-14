import { describe, expect, it } from "vitest";
import {
  isEligibleForIdFill,
  matchRecordUrl,
  normalizeOrigin,
} from "../src/utils/url-matcher";

describe("url-matcher", () => {
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

import { describe, expect, it } from "vitest";
import { isTrustedPoohmaOrigin, normalizeUrl } from "../lib/url";

describe("Extension URL & Origin Verification", () => {
  describe("isTrustedPoohmaOrigin", () => {
    it("allows localhost and 127.0.0.1 development origins", () => {
      expect(isTrustedPoohmaOrigin("http://localhost:3000")).toBe(true);
      expect(isTrustedPoohmaOrigin("http://localhost:5173")).toBe(true);
      expect(isTrustedPoohmaOrigin("http://127.0.0.1:8080")).toBe(true);
    });

    it("allows official domains and subdomains", () => {
      expect(isTrustedPoohmaOrigin("https://poohma.ciderlabs.link")).toBe(true);
      expect(isTrustedPoohmaOrigin("https://sub.ciderlabs.link")).toBe(true);
    });

    it("allows Vercel preview and staging deployments", () => {
      expect(isTrustedPoohmaOrigin("https://poohma.vercel.app")).toBe(true);
      expect(
        isTrustedPoohmaOrigin(
          "https://poohma-git-feat-issue-270-luths-projects.vercel.app",
        ),
      ).toBe(true);
    });

    it("rejects non-HTTPS remote origins even if domain matches", () => {
      expect(isTrustedPoohmaOrigin("http://poohma.ciderlabs.link")).toBe(false);
      expect(isTrustedPoohmaOrigin("http://poohma.vercel.app")).toBe(false);
    });

    it("rejects untrusted third-party, attacker, and non-web origins", () => {
      expect(isTrustedPoohmaOrigin("https://evil.com")).toBe(false);
      expect(isTrustedPoohmaOrigin("https://attacker.vercel.app")).toBe(false);
      expect(isTrustedPoohmaOrigin("https://poohma-attacker.vercel.app")).toBe(
        false,
      );
      expect(isTrustedPoohmaOrigin("https://attacker.workers.dev")).toBe(false);
      expect(
        isTrustedPoohmaOrigin("https://poohma-backup.user.workers.dev"),
      ).toBe(false);
      expect(isTrustedPoohmaOrigin("https://attacker.com/ciderlabs.link")).toBe(
        false,
      );
      expect(
        isTrustedPoohmaOrigin("https://fake-ciderlabs.link.attacker.com"),
      ).toBe(false);
      expect(isTrustedPoohmaOrigin("https://notvercel.app.phishing.com")).toBe(
        false,
      );
    });

    it("safely returns false for malformed or invalid URLs", () => {
      expect(isTrustedPoohmaOrigin("not-a-url")).toBe(false);
      expect(isTrustedPoohmaOrigin("")).toBe(false);
      expect(isTrustedPoohmaOrigin("://malformed")).toBe(false);
    });
  });

  describe("normalizeUrl", () => {
    it("strips query parameters and hash fragments", () => {
      expect(
        normalizeUrl("https://example.com/auth/login?tab=1&redirect=foo#hash"),
      ).toBe("https://example.com/auth/login");
    });

    it("preserves ports and complex pathnames", () => {
      expect(normalizeUrl("http://localhost:3000/nested/path/to/page/")).toBe(
        "http://localhost:3000/nested/path/to/page/",
      );
    });

    it("returns raw input safely if URL is invalid", () => {
      expect(normalizeUrl("invalid-raw-string")).toBe("invalid-raw-string");
    });
  });
});

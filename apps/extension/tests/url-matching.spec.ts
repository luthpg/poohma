import {
  isEligibleForIdFill,
  matchRecordUrl,
  sortByDomainRank,
} from "@poohma/shared/utils/url-matcher";
import { describe, expect, it } from "vitest";

describe("Extension URL Matching Logic", () => {
  it("matches identical hosts with exact", () => {
    expect(
      matchRecordUrl("https://github.com/login", "https://github.com"),
    ).toBe("exact");
  });

  it("matches subdomain to root domain with related", () => {
    expect(
      matchRecordUrl(
        "https://accounts.google.com/signin",
        "https://google.com",
      ),
    ).toBe("related");
    expect(
      matchRecordUrl("https://mail.google.com", "https://accounts.google.com"),
    ).toBe("related");
  });

  it("prevents crossing public suffix boundaries (e.g. github.io) returning none", () => {
    expect(
      matchRecordUrl(
        "https://user-a.github.io/app",
        "https://user-b.github.io/app",
      ),
    ).toBe("none");
  });

  it("filters and sorts service records correctly with domain rank (Issue 383)", () => {
    const currentTabUrl = "https://sub.example.com/login";
    const records = [
      { id: "1", title: "Example Root", url: "https://example.com" }, // tier 2
      { id: "2", title: "Other Service", url: "https://other.com" }, // none
      {
        id: "3",
        title: "Example Sub",
        url: "https://sub.example.com/dashboard", // tier 1
      },
    ];

    const sorted = sortByDomainRank(records, currentTabUrl);
    expect(sorted).toHaveLength(2);
    // 完全一致 (3) がメインドメイン一致 (1) より優先されること
    expect(sorted.map((m) => m.id)).toEqual(["3", "1"]);
  });

  it("ID自動入力補助は完全同一オリジンのみ許可され、ポート違いや関連候補は除外されること", () => {
    // 同一オリジン -> 許可
    const exactMatch = matchRecordUrl(
      "https://example.com/login",
      "https://example.com/settings",
    );
    expect(exactMatch).toBe("exact");
    expect(isEligibleForIdFill(exactMatch)).toBe(true);

    // 別サブドメイン (related) -> 不許可
    const relatedMatch = matchRecordUrl(
      "https://sub.example.com/login",
      "https://example.com",
    );
    expect(relatedMatch).toBe("related");
    expect(isEligibleForIdFill(relatedMatch)).toBe(false);

    // ポート違い -> 不許可
    const portDiffMatch = matchRecordUrl(
      "https://localhost:3000/login",
      "https://localhost:8080/login",
    );
    expect(portDiffMatch).toBe("none");
    expect(isEligibleForIdFill(portDiffMatch)).toBe(false);
  });
});

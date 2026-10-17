import { matchRecordUrl } from "@poohma/shared/utils/url-matcher";
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

  it("filters service records correctly for active tab", () => {
    const currentTabUrl = "https://sub.example.com/login";
    const records = [
      { id: "1", title: "Example Root", url: "https://example.com" },
      { id: "2", title: "Other Service", url: "https://other.com" },
      {
        id: "3",
        title: "Example Sub",
        url: "https://sub.example.com/dashboard",
      },
    ];

    const matched = records.filter(
      (r) => matchRecordUrl(currentTabUrl, r.url) !== "none",
    );
    expect(matched).toHaveLength(2);
    expect(matched.map((m) => m.id)).toEqual(["1", "3"]);
  });
});

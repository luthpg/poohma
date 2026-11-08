import { defaultStringifySearch } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { newRecordSearchSchema } from "@/lib/new-record-search";
import { parseSearch } from "@/lib/search-params";

describe("new record identifier search parameters", () => {
  it.each([
    "0",
    "9007199254740990",
    "9007199254740991",
    "9007199254740992",
    "9007199254740993",
    "18446744073709551615",
    "999999999999999999999999999999999999",
    "000123",
    "1e30",
    "-9007199254740993",
  ])("preserves both IDs exactly: %s", (id) => {
    const search = `?loginId=${id}&accountId=${id}`;
    expect(newRecordSearchSchema.parse(parseSearch(search))).toEqual({
      loginId: id,
      accountId: id,
    });
    const serialized = defaultStringifySearch({ loginId: id, accountId: id });
    expect(newRecordSearchSchema.parse(parseSearch(serialized))).toEqual({
      loginId: id,
      accountId: id,
    });
  });
  it("retains default parsing for other values and optional fields", () => {
    expect(
      parseSearch("?page=2&enabled=true&filter=%7B%22a%22%3A1%7D"),
    ).toEqual({ page: 2, enabled: true, filter: { a: 1 } });
    expect(newRecordSearchSchema.parse(parseSearch(""))).toEqual({});
  });
});

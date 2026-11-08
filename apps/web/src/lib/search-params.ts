import { defaultParseSearch } from "@tanstack/react-router";

/** Preserve identifier precision before route schemas coerce values to strings. */
export function parseSearch(search: string) {
  const parsed: Record<string, unknown> = defaultParseSearch(search);
  const raw = new URLSearchParams(search);
  for (const key of ["loginId", "accountId"]) {
    if (typeof parsed[key] === "number") {
      parsed[key] = raw.get(key);
    }
  }
  return parsed;
}

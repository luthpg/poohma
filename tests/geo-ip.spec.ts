import { describe, expect, it } from "vitest";
import { fetchGeoLocation } from "../src/utils/geo-ip.server";

describe("fetchGeoLocation", () => {
  it("IPが空またはローカルホスト・プライベートIPの場合は undefined を返す", async () => {
    expect(await fetchGeoLocation("")).toBeUndefined();
    expect(await fetchGeoLocation("127.0.0.1")).toBeUndefined();
    expect(await fetchGeoLocation("::1")).toBeUndefined();
    expect(await fetchGeoLocation("localhost")).toBeUndefined();
    expect(await fetchGeoLocation("192.168.1.1")).toBeUndefined();
    expect(await fetchGeoLocation("10.0.0.1")).toBeUndefined();
    expect(await fetchGeoLocation("172.20.0.1")).toBeUndefined();
  });
});

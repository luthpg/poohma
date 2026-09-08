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

  it("IPv6 fc00::/7 範囲（ULA）は undefined を返す", async () => {
    expect(await fetchGeoLocation("fc00::1")).toBeUndefined();
    expect(await fetchGeoLocation("fd12::1")).toBeUndefined();
  });

  it("IPv6 fe80::/10 範囲（リンクローカル）は undefined を返す", async () => {
    expect(await fetchGeoLocation("fe80::1")).toBeUndefined();
    expect(await fetchGeoLocation("fea0::1")).toBeUndefined();
  });

  it("IPv4 169.254.0.0/16 範囲（リンクローカル）は undefined を返す", async () => {
    expect(await fetchGeoLocation("169.254.0.1")).toBeUndefined();
    expect(await fetchGeoLocation("169.254.1.1")).toBeUndefined();
    expect(await fetchGeoLocation("169.254.255.255")).toBeUndefined();
  });
});

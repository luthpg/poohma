import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateIp, validateUrlSafety } from "../src/utils/url-safety";

describe("isPrivateIp", () => {
  // IPv4 プライベートアドレス
  it.each([
    ["127.0.0.1", true],
    ["127.0.0.2", true],
    ["10.0.0.1", true],
    ["10.255.255.255", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["192.168.0.1", true],
    ["192.168.255.255", true],
    ["169.254.169.254", true],
    ["169.254.0.1", true],
    ["0.0.0.0", true],
  ])("should detect %s as private (expected: %s)", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  // IPv4 パブリックアドレス
  it.each([
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["172.15.255.255", false],
    ["172.32.0.0", false],
    ["192.167.0.1", false],
    ["169.253.0.1", false],
    ["93.184.216.34", false],
  ])("should detect %s as public (expected: %s)", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  // IPv6
  it.each([
    ["::1", true],
    ["fc00::1", true],
    ["fd12::1", true],
    ["fe80::1", true],
    ["::", true],
  ])("should detect IPv6 %s as private (expected: %s)", (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe("validateUrlSafety", () => {
  // 不正形式・非許可スキーム・プライベートIPの拒否
  it.each([
    {
      url: "not-a-url",
      expectedError: "Invalid URL format",
    },
    {
      url: "ftp://example.com",
      expectedError: "Only http and https URLs are allowed",
    },
    {
      url: "file:///etc/passwd",
      expectedError: "Only http and https URLs are allowed",
    },
    {
      url: "javascript:alert(1)",
      expectedError: "Only http and https URLs are allowed",
    },
    {
      url: "http://127.0.0.1",
      expectedError: "Access to private IP addresses is not allowed",
    },
  ])(
    "should reject invalid/unsafe URL ($url) with error",
    async ({ url, expectedError }) => {
      await expect(validateUrlSafety(url)).rejects.toThrow(expectedError);
    },
  );

  it("should allow direct public IPv4 address", async () => {
    const ip = await validateUrlSafety("http://8.8.8.8");
    expect(ip).toBe("8.8.8.8");
  });

  it("should detect IPv4-mapped IPv6 addresses correctly", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateIp("::ffff:7f00:0001")).toBe(true);
    // 完全展開表記（非省略）
    expect(isPrivateIp("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("0:0:0:0:0:ffff:8.8.8.8")).toBe(false);
  });

  it("should detect 6to4 addresses correctly", () => {
    // 2002:7f00:0001:: -> 127.0.0.1 (private)
    expect(isPrivateIp("2002:7f00:0001::")).toBe(true);
    // 2002:0808:0808:: -> 8.8.8.8 (public)
    expect(isPrivateIp("2002:0808:0808::")).toBe(false);
  });

  it("should detect Teredo addresses correctly", () => {
    // 2001:0000:... with XOR inverted IPv4
    // 127.0.0.1 -> 0x7f00, 0x0001 -> inverted: 0x80ff, 0xfffe
    expect(isPrivateIp("2001:0000:4136:e378:8000:63bf:80ff:fffe")).toBe(true);
    // 8.8.8.8 -> 0x0808, 0x0808 -> inverted: 0xf7f7, 0xf7f7
    expect(isPrivateIp("2001:0000:4136:e378:8000:63bf:f7f7:f7f7")).toBe(false);
  });

  it("should treat public IPv6 as non-private", () => {
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });

  it("should handle embedded IPv4 directly following :: (compression)", () => {
    // IPv4-compatible (::x.x.x.x)
    expect(isPrivateIp("::8.8.8.8")).toBe(false);
    expect(isPrivateIp("::127.0.0.1")).toBe(true);
    expect(isPrivateIp("::10.0.0.1")).toBe(true);

    // Well-Known prefix / NAT64 (64:ff9b::x.x.x.x)
    expect(isPrivateIp("64:ff9b::8.8.8.8")).toBe(false);
    expect(isPrivateIp("64:ff9b::127.0.0.1")).toBe(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should validate hostname via DNS resolution", async () => {
    const resolve4Spy = vi.spyOn(dns, "resolve4");
    const resolve6Spy = vi.spyOn(dns, "resolve6");

    // 正常なパブリックIPv4
    resolve4Spy.mockResolvedValueOnce(["93.184.216.34"]);
    resolve6Spy.mockResolvedValueOnce([]);
    const ip = await validateUrlSafety("https://example.com");
    expect(ip).toBe("93.184.216.34");

    // 正常なパブリックIPv6 (IPv4解決なし)
    resolve4Spy.mockResolvedValueOnce([]);
    resolve6Spy.mockResolvedValueOnce(["2606:4700:4700::1111"]);
    const ip6 = await validateUrlSafety("https://ipv6.example.com");
    expect(ip6).toBe("2606:4700:4700::1111");

    // プライベートIPv4が返る場合は拒否
    resolve4Spy.mockResolvedValueOnce(["10.0.0.1"]);
    resolve6Spy.mockResolvedValueOnce([]);
    await expect(validateUrlSafety("https://internal.service")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );

    // プライベートIPv6が返る場合は拒否
    resolve4Spy.mockResolvedValueOnce([]);
    resolve6Spy.mockResolvedValueOnce(["::1"]);
    await expect(
      validateUrlSafety("https://localhost.internal"),
    ).rejects.toThrow("Access to private IP addresses is not allowed");

    // DNS解決失敗 (resolve4/resolve6 が空またはエラー)
    resolve4Spy.mockRejectedValueOnce(new Error("ENOTFOUND"));
    resolve6Spy.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(validateUrlSafety("https://notfound.example")).rejects.toThrow(
      "Could not resolve host",
    );
  });
});

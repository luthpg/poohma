import { describe, expect, it } from "vitest";
import { isPrivateIp, validateUrlSafety } from "@/utils/url-safety";

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
    ["203.0.113.1", false],
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
});

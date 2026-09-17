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
  // プライベートIPへのアクセス拒否
  it("should reject private IP addresses", async () => {
    await expect(validateUrlSafety("http://127.0.0.1")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

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
});

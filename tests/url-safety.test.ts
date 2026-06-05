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
  it("should allow valid https URLs", async () => {
    const ip = await validateUrlSafety("https://example.com");
    expect(ip).toBeTypeOf("string");
    expect(isPrivateIp(ip)).toBe(false);
  });

  it("should allow valid http URLs", async () => {
    const ip = await validateUrlSafety("http://example.com");
    expect(ip).toBeTypeOf("string");
    expect(isPrivateIp(ip)).toBe(false);
  });

  it("should reject ftp URLs", async () => {
    await expect(validateUrlSafety("ftp://example.com")).rejects.toThrow(
      "Only http and https URLs are allowed",
    );
  });

  it("should reject file URLs", async () => {
    await expect(validateUrlSafety("file:///etc/passwd")).rejects.toThrow(
      "Only http and https URLs are allowed",
    );
  });

  it("should reject javascript URLs", async () => {
    await expect(validateUrlSafety("javascript:alert(1)")).rejects.toThrow(
      "Only http and https URLs are allowed",
    );
  });

  it("should reject invalid URL format", async () => {
    await expect(validateUrlSafety("not-a-url")).rejects.toThrow(
      "Invalid URL format",
    );
  });

  // プライベートIPへのアクセス拒否
  it("should reject http://127.0.0.1", async () => {
    await expect(validateUrlSafety("http://127.0.0.1")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

  it("should reject http://10.0.0.1", async () => {
    await expect(validateUrlSafety("http://10.0.0.1")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

  it("should reject http://169.254.169.254 (AWS metadata)", async () => {
    await expect(validateUrlSafety("http://169.254.169.254")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

  it("should reject http://192.168.1.1", async () => {
    await expect(validateUrlSafety("http://192.168.1.1")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

  it("should reject http://172.16.0.1", async () => {
    await expect(validateUrlSafety("http://172.16.0.1")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

  it("should reject http://[::1]", async () => {
    await expect(validateUrlSafety("http://[::1]")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });

  it("should reject http://0.0.0.0", async () => {
    await expect(validateUrlSafety("http://0.0.0.0")).rejects.toThrow(
      "Access to private IP addresses is not allowed",
    );
  });
});

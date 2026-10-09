import { describe, expect, it } from "vitest";
import { timingSafeEqual } from "../convex/cryptoUtils";

describe("timingSafeEqual", () => {
  it("同一の英数字文字列で true を返すこと", () => {
    expect(timingSafeEqual("abc123XYZ", "abc123XYZ")).toBe(true);
  });

  it("同一の空文字列で true を返すこと", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("同一の日本語・マルチバイト文字列で true を返すこと", () => {
    expect(
      timingSafeEqual("ひみつのパスコード🔑", "ひみつのパスコード🔑"),
    ).toBe(true);
  });

  it("1文字だけ異なる文字列で false を返すこと", () => {
    expect(timingSafeEqual("abc123XYZ", "abc123XYz")).toBe(false);
    expect(timingSafeEqual("abc123XYZ", "Abc123XYZ")).toBe(false);
    expect(timingSafeEqual("abc123XYZ", "abcX23XYZ")).toBe(false);
  });

  it("長さが異なる文字列（プレフィックス一致含む）で false を返すこと", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("abcd", "abc")).toBe(false);
    expect(timingSafeEqual("a", "")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });

  it("ハッシュ文字列（SHA-256 Base64等）の比較が正しく機能すること", () => {
    const hash1 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash2 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const hash3 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b856";

    expect(timingSafeEqual(hash1, hash2)).toBe(true);
    expect(timingSafeEqual(hash1, hash3)).toBe(false);
  });

  it("string型以外が渡された場合は安全に false を返すこと", () => {
    // @ts-expect-error テスト用不正入力
    expect(timingSafeEqual(null, "abc")).toBe(false);
    // @ts-expect-error テスト用不正入力
    expect(timingSafeEqual("abc", undefined)).toBe(false);
    // @ts-expect-error テスト用不正入力
    expect(timingSafeEqual(123, 123)).toBe(false);
  });

  it("256文字ちょうどの文字列が正しく比較されること", () => {
    const str256 = "a".repeat(256);
    expect(timingSafeEqual(str256, str256)).toBe(true);
    expect(timingSafeEqual(str256, `${"a".repeat(255)}b`)).toBe(false);
  });

  it("256文字を超える入力（巨大ペイロード・上限超過）で安全に false を返すこと", () => {
    const str300 = "x".repeat(300);
    // 256文字を超える場合は同一であっても安全のため false（上限保護）
    expect(timingSafeEqual(str300, str300)).toBe(false);
    expect(timingSafeEqual(str300, "x".repeat(256))).toBe(false);
    expect(timingSafeEqual("secret", "s".repeat(1000))).toBe(false);
  });
});

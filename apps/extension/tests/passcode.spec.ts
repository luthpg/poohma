import { describe, expect, it } from "vitest";
import { calculateLockoutDelayMs } from "../lib/passcode";

describe("Extension Passcode Lockout Delay", () => {
  it("returns 0ms delay for fewer than 3 failed attempts", () => {
    expect(calculateLockoutDelayMs(0)).toBe(0);
    expect(calculateLockoutDelayMs(1)).toBe(0);
    expect(calculateLockoutDelayMs(2)).toBe(0);
  });

  it("calculates exponential backoff delay starting at attempt 3", () => {
    // 3回目: 1秒 (2^0)
    expect(calculateLockoutDelayMs(3)).toBe(1000);
    // 4回目: 2秒 (2^1)
    expect(calculateLockoutDelayMs(4)).toBe(2000);
    // 5回目: 4秒 (2^2)
    expect(calculateLockoutDelayMs(5)).toBe(4000);
    // 6回目: 8秒 (2^3)
    expect(calculateLockoutDelayMs(6)).toBe(8000);
    // 7回目: 16秒 (2^4)
    expect(calculateLockoutDelayMs(7)).toBe(16000);
  });

  it("caps maximum delay at 30 seconds", () => {
    // 8回目: 32秒 -> 最大30秒キャップ
    expect(calculateLockoutDelayMs(8)).toBe(30000);
    expect(calculateLockoutDelayMs(10)).toBe(30000);
    expect(calculateLockoutDelayMs(100)).toBe(30000);
  });
});

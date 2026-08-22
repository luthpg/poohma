import { describe, expect, it } from "vitest";
import {
  evaluatePasscodeStrength,
  MIN_PASSCODE_LENGTH,
} from "@/utils/passcode-strength";

describe("evaluatePasscodeStrength", () => {
  it("最低文字数未満は無効になること", () => {
    const result = evaluatePasscodeStrength("short1");
    expect(result.isValid).toBe(false);
    expect(result.reasons.join()).toContain(`${MIN_PASSCODE_LENGTH}文字以上`);
  });

  it("単純な連続文字列は文字数を満たしていても無効になること", () => {
    const result = evaluatePasscodeStrength("123456789012");
    expect(result.isValid).toBe(false);
  });

  it("同じ文字の繰り返しは無効になること", () => {
    const result = evaluatePasscodeStrength("aaaaaaaaaaaa");
    expect(result.isValid).toBe(false);
  });

  it("全角文字や非ASCII文字が含まれている場合は無効になること", () => {
    const resultWithZenkaku = evaluatePasscodeStrength(
      "Tanuki-Coffee-９２８４！",
    );
    expect(resultWithZenkaku.isValid).toBe(false);
    expect(resultWithZenkaku.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );

    const resultWithJapanese = evaluatePasscodeStrength(
      "TanukiCoffeeパスコード99!",
    );
    expect(resultWithJapanese.isValid).toBe(false);
    expect(resultWithJapanese.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );
  });

  it("十分な長さとランダム性を持つパスコードは有効になること", () => {
    const result = evaluatePasscodeStrength("Tanuki-Coffee-9284!");
    expect(result.isValid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(2);
  });
});

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

  it("非印字ASCII（制御文字、改行、タブなど）が含まれている場合は無効になること", () => {
    // \x1F (制御文字)
    const resultWith0x1F = evaluatePasscodeStrength("Tanuki-Coffee\x1F9284!");
    expect(resultWith0x1F.isValid).toBe(false);
    expect(resultWith0x1F.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );

    // \x7F (DEL制御文字)
    const resultWith0x7F = evaluatePasscodeStrength("Tanuki-Coffee\x7F9284!");
    expect(resultWith0x7F.isValid).toBe(false);
    expect(resultWith0x7F.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );

    // 改行 (\n)
    const resultWithNewline = evaluatePasscodeStrength("Tanuki-Coffee\n9284!");
    expect(resultWithNewline.isValid).toBe(false);
    expect(resultWithNewline.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );

    // タブ (\t)
    const resultWithTab = evaluatePasscodeStrength("Tanuki-Coffee\t9284!");
    expect(resultWithTab.isValid).toBe(false);
    expect(resultWithTab.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );
  });

  it("半角スペースが含まれている場合は無効になること", () => {
    const result = evaluatePasscodeStrength("Tanuki Coffee-9284!");
    expect(result.isValid).toBe(false);
    expect(result.reasons.join()).toContain(
      "半角英数字（大文字、小文字）、半角記号のみ使用できます",
    );
  });

  it("十分な長さとランダム性を持つパスコードは有効になること", () => {
    const result = evaluatePasscodeStrength("Tanuki-Coffee-9284!");
    expect(result.isValid).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(2);
  });
});

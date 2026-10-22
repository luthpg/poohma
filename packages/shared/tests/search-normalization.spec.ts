import { describe, expect, it } from "vitest";
import {
  extractSearchWords,
  generateSearchVariants,
  katakanaToHiragana,
  matchesSearchWords,
  normalizeSearchWord,
} from "../src/utils/search-normalization";

describe("search-normalization", () => {
  describe("katakanaToHiragana", () => {
    it("全角カタカナをひらがなに変換すること", () => {
      expect(katakanaToHiragana("ファミリー")).toBe("ふぁみりー");
      expect(katakanaToHiragana("パスワード")).toBe("ぱすわーど");
      expect(katakanaToHiragana("アイウエオ")).toBe("あいうえお");
    });

    it("ひらがなや英数字、漢字はそのまま維持されること", () => {
      expect(katakanaToHiragana("ふぁみりー漢字ABC123")).toBe(
        "ふぁみりー漢字ABC123",
      );
    });
  });

  describe("normalizeSearchWord", () => {
    it("全角英数・半角カナを正規化し、小文字かつひらがなにすること", () => {
      expect(normalizeSearchWord("Ｇｏｏｇｌｅ")).toBe("google");
      expect(normalizeSearchWord("ｶﾀｶﾅ")).toBe("かたかな");
      expect(normalizeSearchWord("ファミリー")).toBe("ふぁみりー");
    });
  });

  describe("extractSearchWords", () => {
    it("スペース（半角・全角）で区切られた単語を抽出・正規化すること", () => {
      expect(extractSearchWords("Google  Drive")).toEqual(["google", "drive"]);
      expect(extractSearchWords("Google　Drive")).toEqual(["google", "drive"]);
    });

    it("中黒（・）も単語区切りとして認識し、ひらがな化すること", () => {
      expect(extractSearchWords("Google・ドライブ")).toEqual([
        "google",
        "どらいぶ",
      ]);
    });

    it("空文字やスペースのみの場合は空配列を返すこと", () => {
      expect(extractSearchWords("")).toEqual([]);
      expect(extractSearchWords("   　  ")).toEqual([]);
    });
  });

  describe("generateSearchVariants", () => {
    it("スペースや中黒を除去したバリエーションおよびひらがな化バリエーションを生成すること", () => {
      const variants = generateSearchVariants("Google Drive");
      expect(variants).toContain("google drive");
      expect(variants).toContain("googledrive");

      const variantsKana = generateSearchVariants("ファミリー・マート");
      expect(variantsKana).toContain("ふぁみりー・まーと");
      expect(variantsKana).toContain("ふぁみりーまーと");
      expect(variantsKana).toContain("ファミリー・マート".toLowerCase());
      expect(variantsKana).toContain("ファミリーマート".toLowerCase());
    });
  });

  describe("matchesSearchWords", () => {
    it("ひらがな検索でカタカナ対象がヒットすること", () => {
      const words = extractSearchWords("ふぁみりー");
      expect(matchesSearchWords(["ファミリーマート"], words)).toBe(true);
    });

    it("カタカナ検索でひらがな対象がヒットすること", () => {
      const words = extractSearchWords("ファミリー");
      expect(matchesSearchWords(["ふぁみりー"], words)).toBe(true);
    });

    it("スペースなし検索語でスペースあり対象テキストがヒットすること", () => {
      const words = extractSearchWords("GoogleDrive");
      expect(matchesSearchWords(["Google Drive"], words)).toBe(true);
    });

    it("スペースあり検索語でAND検索として機能すること", () => {
      const words = extractSearchWords("Google Drive");
      // 両方含まれる場合
      expect(matchesSearchWords(["Google Workspace - Drive"], words)).toBe(
        true,
      );
      // 片方しか含まれない場合
      expect(matchesSearchWords(["Google Photos"], words)).toBe(false);
      expect(matchesSearchWords(["OneDrive Storage"], words)).toBe(false);
    });

    it("中黒の有無を吸収してヒットすること", () => {
      const words = extractSearchWords("ファミリーマート");
      expect(matchesSearchWords(["ファミリー・マート"], words)).toBe(true);

      const wordsWithDot = extractSearchWords("ファミリー・マート");
      expect(matchesSearchWords(["ファミリーマート"], wordsWithDot)).toBe(true);
    });

    it("複数フィールド（title, credentials等）のいずれかに単語が含まれていればAND検索を満たすこと", () => {
      const words = extractSearchWords("Google user@example.com");
      const fields = ["Google Cloud", "user@example.com"];
      expect(matchesSearchWords(fields, words)).toBe(true);
    });
  });
});

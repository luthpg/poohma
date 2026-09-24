import { describe, expect, it } from "vitest";
import { serializeJsonLd, stripHtmlTags } from "@/utils/seo";

describe("SEO / JSON-LD セキュリティユーティリティ", () => {
  describe("stripHtmlTags", () => {
    it("通常のHTMLタグをプレーンテキストに変換できること", () => {
      const html = "<p>通常は<strong>30日間</strong>維持されます。</p>";
      expect(stripHtmlTags(html)).toBe("通常は 30日間 維持されます。");
    });

    it("ネストされたタグや不完全なタグでも < や > が残留せず安全化されること", () => {
      const malicious = "<<SCRIPT>alert(1)</script>テキスト<script>";
      const result = stripHtmlTags(malicious);
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).toContain("テキスト");
    });

    it("<script> タグ内の実行コード本文が丸ごと除去されること", () => {
      const malicious = "<p>案内文</p><script>console.log('secret');</script>";
      const result = stripHtmlTags(malicious);
      expect(result).toBe("案内文");
      expect(result).not.toContain("secret");
    });

    it("終了タグに空白が含まれる <script > や </script >、<style > も安全に除去されること", () => {
      const malicious =
        "前<script type='text/javascript' >alert(1);</script >中<style >body{color:red;}</style  >後";
      const result = stripHtmlTags(malicious);
      expect(result).toBe("前 中 後");
      expect(result).not.toContain("alert");
      expect(result).not.toContain("color:red");
    });

    it("連続する空白や改行を単一スペースに正規化すること", () => {
      const html = "<div>  項目1  \n\n  <p>  項目2  </p></div>";
      expect(stripHtmlTags(html)).toBe("項目1 項目2");
    });

    it("空文字列や null/undefined 相当の入力を安全に処理できること", () => {
      expect(stripHtmlTags("")).toBe("");
    });
  });

  describe("serializeJsonLd", () => {
    it("JSONオブジェクトを正常にシリアライズできること", () => {
      const data = { name: "PoohMa", count: 123 };
      const serialized = serializeJsonLd(data);
      expect(JSON.parse(serialized)).toEqual(data);
    });

    it("HTMLメタ文字（<, >, &）がUnicodeエスケープされ、</script> タグ脱出を防ぐこと", () => {
      const data = {
        question: "テスト <script>alert('xss')</script>",
        answer: "答え & 案内 > 次へ",
      };
      const serialized = serializeJsonLd(data);

      // 生の < や > や & は含まれない
      expect(serialized).not.toContain("<");
      expect(serialized).not.toContain(">");
      expect(serialized).not.toContain("&");
      expect(serialized).toContain("\\u003c");
      expect(serialized).toContain("\\u003e");
      expect(serialized).toContain("\\u0026");

      // JSONパーサーでは元の文字列として完全に復元される
      expect(JSON.parse(serialized)).toEqual(data);
    });
  });
});

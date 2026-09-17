import { describe, expect, it } from "vitest";
import type { FAQContent } from "@/lib/cms.server";
import {
  FAQ_CATEGORIES,
  filterAndGroupFaqs,
  OTHER_CATEGORY_KEY,
  OTHER_CATEGORY_LABEL,
} from "@/lib/faq";

const mockFaqs: FAQContent[] = [
  {
    id: "faq-1",
    slug: "usage-1",
    question: "ログイン状態はどれくらい維持されますか？",
    answer: "<p>通常は<strong>30日間</strong>維持されます。</p>",
    category: "usage",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revisedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "faq-2",
    slug: "troubleshooting-1",
    question: "パスコードを忘れた場合はどうすればよいですか？",
    answer: "<p>家族の他のメンバーに再招待してもらう必要があります。</p>",
    category: { name: "troubleshooting" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revisedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "faq-3",
    slug: "security-1",
    question: "暗号化のアルゴリズムは何ですか？",
    answer: "<p>AES-GCM 256bit による E2EE を採用しています。</p>",
    category: "security",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revisedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "faq-4",
    slug: "technical-1",
    question: "推奨ブラウザは何ですか？",
    answer: "<p>最新の Google Chrome、Safari、Edge を推奨しています。</p>",
    category: "technical",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revisedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "faq-5",
    slug: "custom-1",
    question: "将来追加された未知のカテゴリの質問です",
    answer: "<p>未知のカテゴリでも正常に表示されます。</p>",
    category: { id: "cat-unknown", name: "unknownCategory" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    publishedAt: "2026-01-01T00:00:00Z",
    revisedAt: "2026-01-01T00:00:00Z",
  },
];

describe("FAQ ユーティリティと検索・グルーピング", () => {
  describe("filterAndGroupFaqs", () => {
    it("検索クエリがない場合、8つの固定カテゴリが指定順で返却され、未知カテゴリは「その他」として末尾に追加されること", () => {
      const grouped = filterAndGroupFaqs(mockFaqs, "");

      expect(grouped.length).toBe(9); // 8 fixed + 1 other
      expect(grouped[1].key).toBe(FAQ_CATEGORIES[1].key);
      expect(grouped[1].label).toBe(FAQ_CATEGORIES[1].label);
      expect(grouped[1].items.length).toBe(1);

      expect(grouped[5].key).toBe(FAQ_CATEGORIES[5].key);
      expect(grouped[5].label).toBe(FAQ_CATEGORIES[5].label);
      expect(grouped[5].items.length).toBe(1);

      expect(grouped[6].key).toBe(FAQ_CATEGORIES[6].key);
      expect(grouped[6].label).toBe(FAQ_CATEGORIES[6].label);
      expect(grouped[6].items.length).toBe(1);

      expect(grouped[7].key).toBe(FAQ_CATEGORIES[7].key);
      expect(grouped[7].label).toBe(FAQ_CATEGORIES[7].label);
      expect(grouped[7].items.length).toBe(1);

      // 固定カテゴリ順序の確認
      const fixedKeys = FAQ_CATEGORIES.map((c) => c.key);
      for (let i = 0; i < fixedKeys.length; i++) {
        expect(grouped[i].key).toBe(fixedKeys[i]);
      }

      // 末尾に「その他」が存在すること
      expect(grouped[8].key).toBe(OTHER_CATEGORY_KEY);
      expect(grouped[8].label).toBe(OTHER_CATEGORY_LABEL);
      expect(grouped[8].items.length).toBe(1);
      expect(grouped[8].items[0].id).toBe("faq-5");
    });

    it("質問文で検索できること", () => {
      const grouped = filterAndGroupFaqs(mockFaqs, "ログイン状態");
      expect(grouped.length).toBe(1);
      expect(grouped[0].key).toBe("usage");
      expect(grouped[0].items[0].id).toBe("faq-1");
    });

    it("回答文（HTMLタグ除去後）で検索できること", () => {
      const grouped = filterAndGroupFaqs(mockFaqs, "30日間");
      expect(grouped.length).toBe(1);
      expect(grouped[0].key).toBe("usage");
      expect(grouped[0].items[0].id).toBe("faq-1");
    });

    it("HTMLタグそのもの（例: strong, p）ではヒットしないこと", () => {
      const grouped = filterAndGroupFaqs(mockFaqs, "strong");
      expect(grouped.length).toBe(0);
    });

    it("カテゴリ名（日本語およびキー名）で検索できること", () => {
      const groupedByLabel = filterAndGroupFaqs(mockFaqs, "セキュリティ");
      expect(groupedByLabel.length).toBe(1);
      expect(groupedByLabel[0].key).toBe("security");

      const groupedByKey = filterAndGroupFaqs(mockFaqs, "troubleshooting");
      expect(groupedByKey.length).toBe(1);
      expect(groupedByKey[0].key).toBe("troubleshooting");
    });

    it("大文字・小文字、全角・半角の差を吸収して検索できること", () => {
      // "E2EE" vs "e2ee"
      const groupedLower = filterAndGroupFaqs(mockFaqs, "e2ee");
      expect(groupedLower.length).toBe(1);
      expect(groupedLower[0].items[0].id).toBe("faq-3");

      const groupedUpper = filterAndGroupFaqs(mockFaqs, "E2EE");
      expect(groupedUpper.length).toBe(1);
      expect(groupedUpper[0].items[0].id).toBe("faq-3");

      // 全角「Ｓａｆａｒｉ」 vs 半角「Safari」
      const groupedZenkaku = filterAndGroupFaqs(mockFaqs, "Ｓａｆａｒｉ");
      expect(groupedZenkaku.length).toBe(1);
      expect(groupedZenkaku[0].items[0].id).toBe("faq-4");
    });

    it("前後空白を含む検索でも正しくヒットすること", () => {
      const grouped = filterAndGroupFaqs(mockFaqs, "   パスコード   ");
      expect(grouped.length).toBe(1);
      expect(grouped[0].items[0].id).toBe("faq-2");
    });

    it("該当がない場合は空の配列が返ること", () => {
      const grouped = filterAndGroupFaqs(mockFaqs, "存在しないキーワード12345");
      expect(grouped.length).toBe(0);
    });
  });
});

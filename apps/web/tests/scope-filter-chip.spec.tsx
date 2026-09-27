// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ScopeFilterChip,
  type ScopeFilterType,
} from "@/components/dashboard/ScopeFilterChip";

describe("ScopeFilterChip Component", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("現在のフィルター状態（すべて）が正しくトリガーに描画されること", () => {
    render(
      <ScopeFilterChip
        currentFilter="all"
        onFilterChange={vi.fn()}
        counts={{ all: 10, personal: 6, shared: 4 }}
      />,
    );

    const trigger = screen.getByTestId("scope-filter-chip");
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain("すべて");
    expect(trigger.textContent).toContain("(10)");
  });

  it("自分のみ（personal）選択時に正しいラベルと件数が描画されること", () => {
    render(
      <ScopeFilterChip
        currentFilter="personal"
        onFilterChange={vi.fn()}
        counts={{ all: 10, personal: 6, shared: 4 }}
      />,
    );

    const trigger = screen.getByTestId("scope-filter-chip");
    expect(trigger.textContent).toContain("自分のみ");
    expect(trigger.textContent).toContain("(6)");
  });

  it("共有中（shared）選択時に正しいラベルと件数が描画されること", () => {
    render(
      <ScopeFilterChip
        currentFilter="shared"
        onFilterChange={vi.fn()}
        counts={{ all: 10, personal: 6, shared: 4 }}
      />,
    );

    const trigger = screen.getByTestId("scope-filter-chip");
    expect(trigger.textContent).toContain("共有中");
    expect(trigger.textContent).toContain("(4)");
  });

  it("トリガーをクリックしてドロップダウンを展開し、選択肢をタップすると onFilterChange が発火すること", async () => {
    const onFilterChange = vi.fn();
    render(
      <ScopeFilterChip
        currentFilter="all"
        onFilterChange={onFilterChange}
        counts={{ all: 10, personal: 6, shared: 4 }}
      />,
    );

    const trigger = screen.getByTestId("scope-filter-chip");
    fireEvent.keyDown(trigger, { key: "Enter" });

    // ドロップダウン内の項目
    const personalOption = await screen.findByTestId("scope-option-personal");
    expect(personalOption).toBeTruthy();
    expect(personalOption.textContent).toContain("自分のみ");
    expect(personalOption.textContent).toContain("6");

    fireEvent.click(personalOption);
    expect(onFilterChange).toHaveBeenCalledWith("personal");
  });

  it("不変条件テスト: ownerType === 'family' のみ共有と判定し、それ以外（userやundefined）は個人レコードとして分類されること", () => {
    const mockRecords = [
      { id: "1", title: "個人A", ownerType: "user" },
      { id: "2", title: "個人B (未定義)", ownerType: undefined },
      { id: "3", title: "共有C", ownerType: "family" },
    ];

    const filterRecords = (
      filter: ScopeFilterType,
      records: typeof mockRecords,
    ) => {
      if (filter === "personal") {
        return records.filter((r) => r.ownerType !== "family");
      }
      if (filter === "shared") {
        return records.filter((r) => r.ownerType === "family");
      }
      return records;
    };

    const allResult = filterRecords("all", mockRecords);
    const personalResult = filterRecords("personal", mockRecords);
    const sharedResult = filterRecords("shared", mockRecords);

    expect(allResult).toHaveLength(3);
    expect(personalResult).toHaveLength(2);
    expect(personalResult.map((r) => r.title)).toEqual([
      "個人A",
      "個人B (未定義)",
    ]);
    expect(sharedResult).toHaveLength(1);
    expect(sharedResult[0]?.title).toBe("共有C");
  });

  it("検索幅拡張テスト: 読み仮名、URL、タグ、全角半角表記揺れに対応して正しくヒットすること", () => {
    const mockRecords = [
      {
        id: "1",
        title: "Google",
        titleReading: "グーグル",
        url: "https://google.com",
        tags: ["検索", "便利"],
        credentials: [{ label: "メイン", loginId: "user@gmail.com" }],
      },
      {
        id: "2",
        title: "Amazon",
        titleReading: "アマゾン",
        url: "https://amazon.co.jp",
        tags: ["ショッピング", "通販"],
        credentials: [{ label: "個人用", loginId: "shopper" }],
      },
      {
        id: "3",
        title: "GitHub",
        titleReading: "ギットハブ",
        url: "https://github.com",
        tags: ["開発", "仕事"],
        credentials: [{ label: "Work", loginId: "developer" }],
      },
    ];

    const searchRecords = (rawQuery: string, records: typeof mockRecords) => {
      const rawQ = rawQuery.trim();
      if (!rawQ) return records;
      const searchWords = rawQ
        .normalize("NFKC")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      if (searchWords.length === 0) return records;

      return records.filter((r) => {
        const searchableTexts: string[] = [
          r.title,
          r.titleReading,
          r.url,
          ...(r.tags ?? []),
          ...r.credentials.flatMap((c) => [c.label, c.loginId]),
        ]
          .filter(
            (text): text is string =>
              typeof text === "string" && text.length > 0,
          )
          .map((text) => text.normalize("NFKC").toLowerCase());

        return searchWords.every((word) =>
          searchableTexts.some((text) => text.includes(word)),
        );
      });
    };

    // 1. 読み仮名（カタカナ）による検索
    expect(searchRecords("グーグル", mockRecords)).toHaveLength(1);
    expect(searchRecords("グーグル", mockRecords)[0]?.title).toBe("Google");

    // 2. URL（ドメイン）による検索
    expect(searchRecords("github.com", mockRecords)).toHaveLength(1);
    expect(searchRecords("github.com", mockRecords)[0]?.title).toBe("GitHub");

    // 3. タグ名による検索
    expect(searchRecords("仕事", mockRecords)).toHaveLength(1);
    expect(searchRecords("仕事", mockRecords)[0]?.title).toBe("GitHub");

    // 4. 全角英数（Ａｍａｚｏｎ）による表記揺れ検索
    expect(searchRecords("Ａｍａｚｏｎ", mockRecords)).toHaveLength(1);
    expect(searchRecords("Ａｍａｚｏｎ", mockRecords)[0]?.title).toBe("Amazon");

    // 5. ログインIDによる検索
    expect(searchRecords("gmail", mockRecords)).toHaveLength(1);
    expect(searchRecords("gmail", mockRecords)[0]?.title).toBe("Google");

    // 6. 半角スペース区切りの AND 検索（タイトル × タグ）
    expect(searchRecords("GitHub 仕事", mockRecords)).toHaveLength(1);
    expect(searchRecords("GitHub 仕事", mockRecords)[0]?.title).toBe("GitHub");
    expect(searchRecords("GitHub ショッピング", mockRecords)).toHaveLength(0);

    // 7. 全角スペース区切りの AND 検索（読み仮名　×　ログインID）
    expect(searchRecords("グーグル　gmail", mockRecords)).toHaveLength(1);
    expect(searchRecords("グーグル　gmail", mockRecords)[0]?.title).toBe(
      "Google",
    );
    expect(searchRecords("グーグル　developer", mockRecords)).toHaveLength(0);
  });
});

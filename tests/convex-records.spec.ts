import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

describe("2.2.1 閲覧権限（Visibility）の境界値テスト (Convex版)", () => {
  it("「自分のみ (PRIVATE)」「家族と共有 (SHARED)」の設定が、DBクエリレベルで正しくフィルタリングされること", async () => {
    const t = convexTest(schema, modules);

    let family1Id!: Id<"families">;

    // 1. 初期シードデータのインサート
    await t.run(async (ctx) => {
      // 家族1
      family1Id = await ctx.db.insert("families", {
        name: "Family 1",
        updatedAt: Date.now(),
      });

      // ユーザーA と ユーザーB (家族1所属)
      await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId: family1Id,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "user_b",
        email: "b@example.com",
        familyId: family1Id,
        updatedAt: Date.now(),
      });

      // ユーザーC (家族未所属)
      await ctx.db.insert("users", {
        userId: "user_c",
        email: "c@example.com",
        updatedAt: Date.now(),
      });

      // AがPRIVATEレコードを作成
      await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        familyId: family1Id,
        title: "Private Record A",
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // AがSHAREDレコードを作成
      await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        familyId: family1Id,
        title: "Shared Record A",
        visibility: "SHARED",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    // ユーザーA自身のコンテキストでクエリ
    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
    const resA = await userA.query(api.records.getRecords, {});
    expect(resA).toHaveLength(2);

    // ユーザーBのコンテキストでクエリ (SHAREDレコードのみ取得できること)
    const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });
    const resB = await userB.query(api.records.getRecords, {});
    expect(resB).toHaveLength(1);
    expect(resB[0].title).toBe("Shared Record A");

    // ユーザーCのコンテキストでクエリ (取得できないこと)
    const userC = t.withIdentity({ subject: "user_c", email: "c@example.com" });
    const resC = await userC.query(api.records.getRecords, {});
    expect(resC).toHaveLength(0);
  });
});

describe("2.2.2. OGP取得処理のフェイルセーフとタイムアウト (Convex版)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("正常系", () => {
    it("正しい OGP メタタグを持つ HTML から、タイトル・画像・説明文を抽出できること", async () => {
      const mockHtml = `
        <html>
          <head>
            <meta property="og:title" content="テストサービスタイトル" />
            <meta property="og:image" content="https://example.com/ogp.png" />
            <meta property="og:description" content="テストサービスの詳細説明文です。" />
          </head>
        </html>
      `;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode(mockHtml).buffer,
          headers: {
            get: () => "text/html; charset=utf-8",
          },
        }),
      );

      const t = convexTest(schema, modules);
      const user = t.withIdentity({ subject: "user_a" });
      const result = await user.action(api.actions.getOgpInfo, {
        url: "https://example.com",
      });

      expect(result).toEqual({
        title: "テストサービスタイトル",
        image: "https://example.com/ogp.png",
        description: "テストサービスの詳細説明文です。",
      });
    });

    it("OGPメタタグがない場合、通常の title タグと description メタタグからフォールバック抽出できること", async () => {
      const mockHtml = `
        <html>
          <head>
            <title>フォールバックタイトル</title>
            <meta name="description" content="フォールバック用の説明文。" />
          </head>
        </html>
      `;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode(mockHtml).buffer,
          headers: {
            get: () => "text/html; charset=utf-8",
          },
        }),
      );

      const t = convexTest(schema, modules);
      const user = t.withIdentity({ subject: "user_a" });
      const result = await user.action(api.actions.getOgpInfo, {
        url: "https://example.com",
      });

      expect(result).toEqual({
        title: "フォールバックタイトル",
        image: "",
        description: "フォールバック用の説明文。",
      });
    });
  });

  describe("異常系 (フェイルセーフ)", () => {
    it("HTTP ステータスコードが 500 などのエラーを返却した場合、クラッシュせず空のOGP情報を返却すること", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      const t = convexTest(schema, modules);
      const user = t.withIdentity({ subject: "user_a" });
      const result = await user.action(api.actions.getOgpInfo, {
        url: "https://example.com",
      });

      expect(result).toEqual({
        title: "",
        image: "",
        description: "",
      });
    });

    it("ネットワーク接続エラー等の理由で fetch が例外をスローした場合、クラッシュせず空のOGP情報を返却すること", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network Error")),
      );

      const t = convexTest(schema, modules);
      const user = t.withIdentity({ subject: "user_a" });
      const result = await user.action(api.actions.getOgpInfo, {
        url: "https://example.com",
      });

      expect(result).toEqual({
        title: "",
        image: "",
        description: "",
      });
    });
  });
});

describe("2.2.3 CSV一括インポートのトランザクションと部分成功 (Convex版)", () => {
  it("正常なデータ2件と不正なデータ1件を含む配列で、successes: 2, failures: 1 が返り、DBには2件のみ登録されること", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;

    // ユーザーと家族の作成
    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "CSV Test Family",
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "csv_user",
        email: "csv@example.com",
        familyId,
        updatedAt: Date.now(),
      });
    });

    const user = t.withIdentity({
      subject: "csv_user",
      email: "csv@example.com",
    });

    // 正常2件 + タイトル空の不正1件
    const rows = [
      {
        title: "Netflix",
        url: "https://netflix.com",
        visibility: "PRIVATE" as const,
        credentials: [],
        tags: [],
      },
      {
        title: "",
        url: "https://invalid.com",
        visibility: "PRIVATE" as const,
        credentials: [],
        tags: [],
      }, // タイトル空 → 失敗
      {
        title: "Amazon Prime",
        url: "https://amazon.co.jp",
        visibility: "SHARED" as const,
        credentials: [],
        tags: [],
      },
    ];

    const result = await user.mutation(api.records.importRecords, {
      records: rows,
    });

    expect(result.successes).toBe(2);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].row).toBe(2);
    expect(result.failures[0].reason).toContain("タイトル");

    // DBに2件登録されていること
    await t.run(async (ctx) => {
      const records = await ctx.db
        .query("serviceRecords")
        .withIndex("by_userId", (q) => q.eq("userId", "csv_user"))
        .collect();
      expect(records).toHaveLength(2);
      const titles = records.map((r) => r.title).sort();
      expect(titles).toEqual(["Amazon Prime", "Netflix"]);
    });
  });

  it("501件のデータを渡した場合、500件上限エラーがスローされること", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Limit Test Family",
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "limit_user",
        email: "limit@example.com",
        familyId,
        updatedAt: Date.now(),
      });
    });

    const user = t.withIdentity({
      subject: "limit_user",
      email: "limit@example.com",
    });

    const rows = Array.from({ length: 501 }, (_, i) => ({
      title: `Record ${i + 1}`,
      visibility: "PRIVATE" as const,
      credentials: [],
      tags: [],
    }));

    await expect(
      user.mutation(api.records.importRecords, { records: rows }),
    ).rejects.toThrow("最大500行");
  });

  it("家族未所属のユーザーが実行した場合、エラーがスローされること", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        userId: "no_family_user",
        email: "nofamily@example.com",
        updatedAt: Date.now(),
      });
    });

    const user = t.withIdentity({
      subject: "no_family_user",
      email: "nofamily@example.com",
    });

    const rows = [
      {
        title: "Test",
        visibility: "PRIVATE" as const,
        credentials: [],
        tags: [],
      },
    ];

    await expect(
      user.mutation(api.records.importRecords, { records: rows }),
    ).rejects.toThrow("家族グループに所属していません");
  });
});

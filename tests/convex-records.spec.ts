import { EventEmitter } from "node:events";
import type http from "node:http";
import https from "node:https";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");

// E2EE url-safety のモック
vi.mock("../src/utils/url-safety", () => {
  return {
    validateUrlSafety: vi.fn().mockResolvedValue("93.184.216.34"),
    isPrivateIp: vi.fn().mockReturnValue(false),
  };
});

// node:http / node:https のモック
vi.mock("node:http", () => {
  return {
    default: {
      request: vi.fn(),
    },
  };
});
vi.mock("node:https", () => {
  return {
    default: {
      request: vi.fn(),
    },
  };
});

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

      vi.mocked(https.request).mockImplementation(
        (_options: unknown, callback: unknown) => {
          const mockReq = Object.assign(new EventEmitter(), {
            end: () => {
              process.nextTick(() => {
                const mockRes = Object.assign(new EventEmitter(), {
                  statusCode: 200,
                  headers: {},
                }) as unknown as http.IncomingMessage;

                if (typeof callback === "function") {
                  callback(mockRes);
                }
                mockRes.emit("data", Buffer.from(mockHtml));
                mockRes.emit("end");
              });
            },
            destroy: () => {},
          }) as unknown as http.ClientRequest;
          return mockReq;
        },
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

      vi.mocked(https.request).mockImplementation(
        (_options: unknown, callback: unknown) => {
          const mockReq = Object.assign(new EventEmitter(), {
            end: () => {
              process.nextTick(() => {
                const mockRes = Object.assign(new EventEmitter(), {
                  statusCode: 200,
                  headers: {},
                }) as unknown as http.IncomingMessage;

                if (typeof callback === "function") {
                  callback(mockRes);
                }
                mockRes.emit("data", Buffer.from(mockHtml));
                mockRes.emit("end");
              });
            },
            destroy: () => {},
          }) as unknown as http.ClientRequest;
          return mockReq;
        },
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
      vi.mocked(https.request).mockImplementation(
        (_options: unknown, callback: unknown) => {
          const mockReq = Object.assign(new EventEmitter(), {
            end: () => {
              process.nextTick(() => {
                const mockRes = Object.assign(new EventEmitter(), {
                  statusCode: 500,
                  headers: {},
                }) as unknown as http.IncomingMessage;

                if (typeof callback === "function") {
                  callback(mockRes);
                }
                mockRes.emit("end");
              });
            },
            destroy: () => {},
          }) as unknown as http.ClientRequest;
          return mockReq;
        },
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
      vi.mocked(https.request).mockImplementation(
        (_options: unknown, _callback: unknown) => {
          const mockReq = Object.assign(new EventEmitter(), {
            end: () => {
              process.nextTick(() => {
                mockReq.emit("error", new Error("Network Error"));
              });
            },
            destroy: () => {},
          }) as unknown as http.ClientRequest;
          return mockReq;
        },
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

describe("Convexリプレース由来デグレ修正の追加テスト", () => {
  it("getOwnedRecords は自分が所有するレコードのみを返し、家族の共有レコードは含まないこと", async () => {
    const t = convexTest(schema, modules);
    let family1Id!: Id<"families">;

    await t.run(async (ctx) => {
      family1Id = await ctx.db.insert("families", {
        name: "Family 1",
        updatedAt: Date.now(),
      });

      // User A and User B belong to Family 1
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

      // User A owns record
      await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        familyId: family1Id,
        title: "A's Private",
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // User B owns record (SHARED)
      await ctx.db.insert("serviceRecords", {
        userId: "user_b",
        familyId: family1Id,
        title: "B's Shared",
        visibility: "SHARED",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

    // getRecords should return both
    const allRecords = await userA.query(api.records.getRecords, {});
    expect(allRecords).toHaveLength(2);

    // getOwnedRecords should return only A's Private
    const ownedRecords = await userA.query(api.records.getOwnedRecords, {});
    expect(ownedRecords).toHaveLength(1);
    expect(ownedRecords[0].title).toBe("A's Private");
  });

  it("家族共有(SHARED)のレコードは、同じ家族メンバーであれば編集・削除が可能であること", async () => {
    const t = convexTest(schema, modules);
    let family1Id!: Id<"families">;
    let sharedRecordId!: Id<"serviceRecords">;
    let privateRecordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      family1Id = await ctx.db.insert("families", {
        name: "Family 1",
        updatedAt: Date.now(),
      });

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

      // User A creates a SHARED record
      sharedRecordId = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        familyId: family1Id,
        title: "Shared Record",
        visibility: "SHARED",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // User A creates a PRIVATE record
      privateRecordId = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        familyId: family1Id,
        title: "Private Record",
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

    // User B updates User A's SHARED record -> should succeed
    await expect(
      userB.mutation(api.records.updateRecord, {
        id: sharedRecordId,
        data: {
          title: "Shared Record Updated by B",
          visibility: "SHARED",
          credentials: [],
          tags: [],
        },
      }),
    ).resolves.not.toThrow();

    // User B tries to update User A's PRIVATE record -> should fail
    await expect(
      userB.mutation(api.records.updateRecord, {
        id: privateRecordId,
        data: {
          title: "Private Record Updated by B",
          visibility: "PRIVATE",
          credentials: [],
          tags: [],
        },
      }),
    ).rejects.toThrow("Only the owner can update");

    // User B deletes User A's SHARED record -> should succeed
    await expect(
      userB.mutation(api.records.deleteRecord, { id: sharedRecordId }),
    ).resolves.not.toThrow();

    // User B tries to delete User A's PRIVATE record -> should fail
    await expect(
      userB.mutation(api.records.deleteRecord, { id: privateRecordId }),
    ).rejects.toThrow("Only the owner can delete");
  });

  it("Zodによる文字数制限バリデーションが機能し、違反した入力ではエラーが返ること", async () => {
    const t = convexTest(schema, modules);
    let family1Id!: Id<"families">;

    await t.run(async (ctx) => {
      family1Id = await ctx.db.insert("families", {
        name: "Family 1",
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId: family1Id,
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

    // Title exceeds 255 chars
    await expect(
      userA.mutation(api.records.createRecord, {
        title: "a".repeat(256),
        visibility: "PRIVATE",
        credentials: [],
        tags: [],
      }),
    ).rejects.toThrow("Validation failed");

    // Credential label exceeds 100 chars
    await expect(
      userA.mutation(api.records.createRecord, {
        title: "Valid Title",
        visibility: "PRIVATE",
        credentials: [
          {
            id: "cred1",
            label: "a".repeat(101),
          },
        ],
        tags: [],
      }),
    ).rejects.toThrow("Validation failed");
  });
});

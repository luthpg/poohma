import { EventEmitter } from "node:events";
import type http from "node:http";
import https from "node:https";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { computeSortKey } from "../src/utils/index-group";

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

describe("2.2.1 閲覧権限（ownerType）の境界値テスト (Convex版)", () => {
  it("「自分のみ (user)」「家族と共有 (family)」の設定が、DBクエリレベルで正しくフィルタリングされること", async () => {
    const t = convexTest(schema, modules);

    let family1Id!: Id<"families">;
    let userAId!: Id<"users">;

    // 1. 初期シードデータのインサート
    await t.run(async (ctx) => {
      // 家族1
      family1Id = await ctx.db.insert("families", {
        name: "Family 1",
        updatedAt: Date.now(),
      });

      // ユーザーA と ユーザーB (家族1所属)
      userAId = await ctx.db.insert("users", {
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

      // Aが個人レコードを作成
      await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId: family1Id,
        title: "Private Record A",
        sortKey: computeSortKey("Private Record A"),
        ownerType: "user",
        admins: [],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // Aが家族共有レコードを作成
      await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId: family1Id,
        ownerFamilyId: family1Id,
        title: "Shared Record A",
        sortKey: computeSortKey("Shared Record A"),
        ownerType: "family",
        admins: [userAId],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    // ユーザーA自身のコンテキストでクエリ
    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
    const resA = await userA.query(api.records.getRecords, {});
    expect(resA).toHaveLength(2);

    // ユーザーBのコンテキストでクエリ (family共有レコードのみ取得できること)
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

                (callback as (res: http.IncomingMessage) => void)(mockRes);

                mockRes.emit("data", Buffer.from(mockHtml));
                mockRes.emit("end");
              });
            },
            destroy: vi.fn(),
          });
          return mockReq as unknown as http.ClientRequest;
        },
      );

      const t = convexTest(schema, modules);
      const user = t.withIdentity({
        subject: "user_ogp",
        email: "ogp@example.com",
      });
      const res = await user.action(api.actions.getOgpInfo, {
        url: "https://example.com",
      });

      expect(res.title).toBe("テストサービスタイトル");
      expect(res.image).toBe("https://example.com/ogp.png");
      expect(res.description).toBe("テストサービスの詳細説明文です。");
    });
  });
});

describe("2.2.3 CSVインポートのバリデーションと境界値 (Convex版)", () => {
  it("正常なデータ行と不正なデータ行が混在する場合、部分インポートが行われ失敗詳細が返ること", async () => {
    const t = convexTest(schema, modules);

    let familyId!: Id<"families">;

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
        ownerType: "user" as const,
        credentials: [],
        tags: [],
      },
      {
        title: "",
        url: "https://invalid.com",
        ownerType: "user" as const,
        credentials: [],
        tags: [],
      }, // タイトル空 → 失敗
      {
        title: "Amazon Prime",
        url: "https://amazon.co.jp",
        ownerType: "family" as const,
        adminEmails: ["csv@example.com"],
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
      ownerType: "user" as const,
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
        ownerType: "user" as const,
        credentials: [],
        tags: [],
      },
    ];

    await expect(
      user.mutation(api.records.importRecords, { records: rows }),
    ).rejects.toThrow("User does not belong to a family");
  });
});

describe("Drive型ACLモデルのCRUDと共有機能テスト", () => {
  it("getOwnedRecords は自分が所有する個人レコードと自分が管理者である共有レコードを返し、adminEmailsを付与すること", async () => {
    const t = convexTest(schema, modules);
    let family1Id!: Id<"families">;
    let userAId!: Id<"users">;
    let userBId!: Id<"users">;

    await t.run(async (ctx) => {
      family1Id = await ctx.db.insert("families", {
        name: "Family 1",
        updatedAt: Date.now(),
      });

      userAId = await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId: family1Id,
        updatedAt: Date.now(),
      });

      userBId = await ctx.db.insert("users", {
        userId: "user_b",
        email: "b@example.com",
        familyId: family1Id,
        updatedAt: Date.now(),
      });

      // User A personal record
      await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId: family1Id,
        title: "A's Private",
        sortKey: computeSortKey("A's Private"),
        ownerType: "user",
        admins: [],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });

      // User B shared record where only B is admin
      await ctx.db.insert("serviceRecords", {
        userId: "user_b",
        accountId: userBId,
        familyId: family1Id,
        ownerFamilyId: family1Id,
        title: "B's Shared",
        sortKey: computeSortKey("B's Shared"),
        ownerType: "family",
        admins: [userBId],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

    // getRecords returns both
    const allRecords = await userA.query(api.records.getRecords, {});
    expect(allRecords).toHaveLength(2);

    // getOwnedRecords returns only records manageable by A (A's Private)
    const ownedRecords = await userA.query(api.records.getOwnedRecords, {});
    expect(ownedRecords).toHaveLength(1);
    expect(ownedRecords[0].title).toBe("A's Private");
    expect(ownedRecords[0].adminEmails).toBeDefined();
  });

  it("ワンタップ共有 (shareRecord) とワンタップ解除 (unshareRecord) が正しく動作すること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let userAId!: Id<"users">;
    let recordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Test Family",
        updatedAt: Date.now(),
      });

      userAId = await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("users", {
        userId: "user_b",
        email: "b@example.com",
        familyId,
        updatedAt: Date.now(),
      });

      recordId = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId,
        title: "Record To Share",
        sortKey: computeSortKey("Record To Share"),
        ownerType: "user",
        admins: [],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
    const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

    // 共有前: B は閲覧不可
    await expect(
      userB.query(api.records.getRecordDetail, { id: recordId }),
    ).rejects.toThrow("Access denied");

    // A がワンタップ共有
    await userA.mutation(api.records.shareRecord, { id: recordId });

    // 共有後: B も閲覧可能
    const sharedDetail = await userB.query(api.records.getRecordDetail, {
      id: recordId,
    });
    expect(sharedDetail.title).toBe("Record To Share");

    // B は管理者ではないため unshare 不可
    await expect(
      userB.mutation(api.records.unshareRecord, { id: recordId }),
    ).rejects.toThrow("Access denied");

    // A は管理者なので unshare 可能
    await userA.mutation(api.records.unshareRecord, { id: recordId });

    // 解除後: B は再度閲覧不可
    await expect(
      userB.query(api.records.getRecordDetail, { id: recordId }),
    ).rejects.toThrow("Access denied");
  });

  it("管理者追加 (addRecordAdmin) と管理者解除 (removeRecordAdmin) が正しく動作すること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let userAId!: Id<"users">;
    let userBId!: Id<"users">;
    let sharedRecordId!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Test Family",
        updatedAt: Date.now(),
      });

      userAId = await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId,
        updatedAt: Date.now(),
      });

      userBId = await ctx.db.insert("users", {
        userId: "user_b",
        email: "b@example.com",
        familyId,
        updatedAt: Date.now(),
      });

      sharedRecordId = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId,
        ownerFamilyId: familyId,
        title: "Shared Record",
        sortKey: computeSortKey("Shared Record"),
        ownerType: "family",
        admins: [userAId],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });
    const userB = t.withIdentity({ subject: "user_b", email: "b@example.com" });

    // A が B を管理者に昇格
    await userA.mutation(api.records.addRecordAdmin, {
      id: sharedRecordId,
      targetAccountId: userBId,
    });

    // B を管理者から解除
    await userA.mutation(api.records.removeRecordAdmin, {
      id: sharedRecordId,
      targetAccountId: userBId,
    });

    // B は解除されたので削除不可（Access denied）
    await expect(
      userB.mutation(api.records.deleteRecord, { id: sharedRecordId }),
    ).rejects.toThrow("Access denied");

    // A は管理者のままなので削除可能
    await expect(
      userA.mutation(api.records.deleteRecord, { id: sharedRecordId }),
    ).resolves.not.toThrow();
  });

  it("一括共有 (bulkShareRecords) と一括解除 (bulkUnshareRecords) が正しく動作すること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let userAId!: Id<"users">;
    let r1Id!: Id<"serviceRecords">;
    let r2Id!: Id<"serviceRecords">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Test Family",
        updatedAt: Date.now(),
      });

      userAId = await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId,
        updatedAt: Date.now(),
      });

      r1Id = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId,
        title: "R1",
        sortKey: computeSortKey("R1"),
        ownerType: "user",
        admins: [],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });

      r2Id = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId,
        title: "R2",
        sortKey: computeSortKey("R2"),
        ownerType: "user",
        admins: [],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

    // 一括共有
    const shareRes = await userA.mutation(api.records.bulkShareRecords, {
      ids: [r1Id, r2Id],
    });
    expect(shareRes.sharedCount).toBe(2);

    await t.run(async (ctx) => {
      const r1 = await ctx.db.get(r1Id);
      expect(r1?.ownerType).toBe("family");
      expect(r1?.admins).toContain(userAId);

      const r2 = await ctx.db.get(r2Id);
      expect(r2?.ownerType).toBe("family");
      expect(r2?.admins).toContain(userAId);
    });

    // 一括解除
    const unshareRes = await userA.mutation(api.records.bulkUnshareRecords, {
      ids: [r1Id, r2Id],
    });
    expect(unshareRes.unsharedCount).toBe(2);

    await t.run(async (ctx) => {
      const r1 = await ctx.db.get(r1Id);
      expect(r1?.ownerType).toBe("user");
      expect(r1?.admins).toEqual([]);

      const r2 = await ctx.db.get(r2Id);
      expect(r2?.ownerType).toBe("user");
      expect(r2?.admins).toEqual([]);
    });
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
        ownerType: "user",
        credentials: [],
        tags: [],
      }),
    ).rejects.toThrow("Validation failed");

    // Credential label exceeds 100 chars
    await expect(
      userA.mutation(api.records.createRecord, {
        title: "Valid Title",
        ownerType: "user",
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

  it("updateRecord で titleReading を指定しない更新を行った場合、既存の titleReading が保持されること", async () => {
    const t = convexTest(schema, modules);
    let familyId!: Id<"families">;
    let recordId!: Id<"serviceRecords">;
    let userAId!: Id<"users">;

    await t.run(async (ctx) => {
      familyId = await ctx.db.insert("families", {
        name: "Test Family",
        updatedAt: Date.now(),
      });

      userAId = await ctx.db.insert("users", {
        userId: "user_a",
        email: "a@example.com",
        familyId,
        updatedAt: Date.now(),
      });

      recordId = await ctx.db.insert("serviceRecords", {
        userId: "user_a",
        accountId: userAId,
        familyId,
        title: "Amazon",
        titleReading: "あまぞん",
        sortKey: computeSortKey("Amazon", "あまぞん"),
        ownerType: "user",
        admins: [],
        credentials: [],
        tags: [],
        updatedAt: Date.now(),
      });
    });

    const userA = t.withIdentity({ subject: "user_a", email: "a@example.com" });

    // titleReading を含めずに更新を実行
    await userA.mutation(api.records.updateRecord, {
      id: recordId,
      data: {
        title: "Amazon Renewed",
        ownerType: "user",
        credentials: [],
        tags: [],
      },
    });

    await t.run(async (ctx) => {
      const updated = await ctx.db.get(recordId);
      expect(updated?.title).toBe("Amazon Renewed");
      expect(updated?.titleReading).toBe("あまぞん");
    });
  });
});

describe("件数境界値テスト", () => {
  it("createRecordで11件のcredentialsを送信するとバリデーションエラーになること", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert("families", {
        name: "Test Family",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "user_cap",
        email: "cap@example.com",
        familyId,
        updatedAt: Date.now(),
      });
    });

    const user = t.withIdentity({
      subject: "user_cap",
      email: "cap@example.com",
    });

    await expect(
      user.mutation(api.records.createRecord, {
        title: "Too many credentials",
        ownerType: "user",
        credentials: Array.from({ length: 11 }, (_, i) => ({
          id: `cred_${i}`,
          label: `Cred${i}`,
        })),
        tags: [],
      }),
    ).rejects.toThrow("Validation failed");
  });

  it("createRecordで10件ちょうどのcredentialsは登録できること", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const familyId = await ctx.db.insert("families", {
        name: "Test Family",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("users", {
        userId: "user_cap2",
        email: "cap2@example.com",
        familyId,
        updatedAt: Date.now(),
      });
    });

    const user = t.withIdentity({
      subject: "user_cap2",
      email: "cap2@example.com",
    });

    await expect(
      user.mutation(api.records.createRecord, {
        title: "Exactly 10 credentials",
        ownerType: "user",
        credentials: Array.from({ length: 10 }, (_, i) => ({
          id: `cred_${i}`,
          label: `Cred${i}`,
        })),
        tags: [],
      }),
    ).resolves.toBeDefined();
  });
});

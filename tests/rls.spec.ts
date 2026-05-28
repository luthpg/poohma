import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Visibility } from "@/../generated/prisma/client";
import { db } from "@/services/db.server";
import {
  getRecordDetailLogic,
  updateRecordLogic,
} from "@/services/records.server";

// ============================================================================
// ファイルインポート時のクラッシュを防ぐ「空のモック（Void Mock）」
// ============================================================================
vi.mock("@tanstack/react-start", () => {
  const dummyChain = {
    middleware: () => dummyChain,
    inputValidator: () => dummyChain,
    handler: () => dummyChain,
    server: () => dummyChain,
    client: () => dummyChain,
  };
  return {
    createServerFn: () => dummyChain,
    createMiddleware: () => dummyChain,
  };
});
vi.mock("@/utils/url-safety", () => {
  return {
    validateUrlSafety: vi.fn().mockResolvedValue(undefined),
  };
});

// withSession をモックし、テスト環境で RLS を有効にするために
// app_user ロールへの切り替えを行う
vi.mock("@/services/db.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/db.server")>();
  return {
    ...actual,
    withSession: async <T>(
      userId: string,
      familyId: string | null | undefined,
      // biome-ignore lint/suspicious/noExplicitAny: テスト用の型定義
      callback: (tx: any) => Promise<T>,
    ) => {
      // biome-ignore lint/suspicious/noExplicitAny: テスト用の型定義
      return actual.db.$transaction(async (tx: any) => {
        // テスト環境でRLSを強制するためにapp_userロールを使用する
        await tx.$executeRaw`SET LOCAL ROLE app_user;`;
        await tx.$executeRaw`
          SELECT
            set_config('app.current_user_id', ${userId}, true),
            set_config('app.current_family_id', ${familyId ?? ""}, true)
        `;
        return callback(tx);
      });
    },
  };
});

describe("4. セキュリティ/アーキテクチャ特化テスト (RLS検証)", () => {
  beforeEach(async () => {
    // RLSテスト用の非スーパーユーザーロールを作成（存在しない場合のみ）
    await db.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
          CREATE ROLE app_user;
        END IF;
      END
      $$;
    `);
    await db.$executeRawUnsafe(
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;`,
    );
    await db.$executeRawUnsafe(
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;`,
    );

    await db.accountCredential.deleteMany();
    await db.recordTag.deleteMany();
    await db.serviceRecord.deleteMany();
    await db.user.deleteMany();
    await db.family.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  describe("4.1. セッション変数の偽装とRLSによる強制ブロック", () => {
    it("セッション変数を設定せずに (withSessionを使わずに) アクセスした場合、レコードが取得できないこと", async () => {
      // ユーザーとレコードを作成
      const family = await db.family.create({
        data: {
          name: "Test Family",
          masterKeyEncrypted: "dummy",
          masterKeyIv: "dummy",
          masterKeySalt: "dummy",
        },
      });

      const user = await db.user.create({
        data: { id: "user_1", email: "test@example.com", familyId: family.id },
      });

      const record = await db.serviceRecord.create({
        data: {
          userId: user.id,
          familyId: family.id,
          title: "Private Record",
          visibility: Visibility.PRIVATE,
        },
      });

      // withSessionを使わずに直接 db.serviceRecord.findMany を実行
      // PostgreSQLのRLSにより、app.current_user_idが設定されていないためブロックされるはず
      // RLSを有効にするため、テスト実行時は非スーパーユーザー(app_user)として実行する
      const result = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ROLE app_user;`;
        return tx.serviceRecord.findMany({
          where: { id: record.id },
        });
      });

      expect(result).toHaveLength(0);
    });

    it("別ユーザーのapp.current_user_idをセットした状態で、他人のPRIVATEレコードにアクセスした場合、取得できないこと", async () => {
      // ユーザーA(オーナー)とユーザーB(ハッカー)を作成
      const family = await db.family.create({
        data: {
          name: "Test Family",
          masterKeyEncrypted: "dummy",
          masterKeyIv: "dummy",
          masterKeySalt: "dummy",
        },
      });

      const userA = await db.user.create({
        data: { id: "user_A", email: "a@example.com", familyId: family.id },
      });

      const userB = await db.user.create({
        data: { id: "user_B", email: "b@example.com", familyId: family.id },
      });

      // ユーザーAのPRIVATEレコード
      const recordA = await db.serviceRecord.create({
        data: {
          userId: userA.id,
          familyId: family.id,
          title: "User A Private",
          visibility: Visibility.PRIVATE,
        },
      });

      // Prismaの raw query を使ってDBセッション変数にハッカー(user_B)のIDをセット
      // その直後のトランザクション内でレコードAをSELECTする
      const result = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL ROLE app_user;`;
        await tx.$executeRaw`
          SELECT
            set_config('app.current_user_id', ${userB.id}, true),
            set_config('app.current_family_id', ${userB.familyId}, true)
        `;
        return tx.serviceRecord.findMany({
          where: { id: recordA.id },
        });
      });

      // user_Bのコンテキストで取得しているため、PRIVATEなrecordAは取得できないはず
      expect(result).toHaveLength(0);
    });
  });

  describe("4.2. withSessionとDB RLSの連動によるクロスファミリー分離テスト", () => {
    it("API層(サーバーロジック関数)から別家族のレコードにアクセスした場合、データが取得・変更できないこと", async () => {
      // 家族Aと家族Bを作成
      const familyA = await db.family.create({
        data: {
          name: "Family A",
          masterKeyEncrypted: "dummy",
          masterKeyIv: "dummy",
          masterKeySalt: "dummy",
        },
      });
      const familyB = await db.family.create({
        data: {
          name: "Family B",
          masterKeyEncrypted: "dummy",
          masterKeyIv: "dummy",
          masterKeySalt: "dummy",
        },
      });

      const userA = await db.user.create({
        data: { id: "user_A", email: "a@example.com", familyId: familyA.id },
      });
      const userB = await db.user.create({
        data: { id: "user_B", email: "b@example.com", familyId: familyB.id },
      });

      // 家族BのユーザーBがSHAREDレコードを作成
      const recordB = await db.serviceRecord.create({
        data: {
          userId: userB.id,
          familyId: familyB.id,
          title: "User B Shared Record",
          visibility: Visibility.SHARED,
        },
      });

      // ユーザーAのコンテキストとして getRecordDetailLogic を呼び出し
      // ユーザーAが家族BのレコードBを直接ID指定で取得しようとする
      // withSession モックにより app_user ロール + ユーザーAのセッション変数がセットされ、
      // RLS によってレコードBは不可視 → findUnique が null を返す → "Record not found"
      // または RLS を通過した場合でもアプリ層の権限チェックで "Forbidden" がスローされる
      await expect(getRecordDetailLogic(userA, recordB.id)).rejects.toThrow();

      // さらに更新(updateRecordLogic)を試みる
      await expect(
        updateRecordLogic(userA, recordB.id, {
          title: "Hacked Title",
          url: "",
          ogpImage: "",
          ogpDescription: "",
          memo: "",
          visibility: Visibility.SHARED,
          credentials: [],
          tags: [],
        }),
      ).rejects.toThrow();
    });
  });
});

# PoohMa Testing Strategy & Guide

PoohMa におけるテストアーキテクチャ、テスト作成パターン、検証方法を整理する。

---

## 1. テスト構成とツールスタック

| 対象 | ツール | 役割 |
| --- | --- | --- |
| バックエンド関数 (Convex) | `convex-test` + `vitest` | Schema, customBuilders, RLS, DB トランザクション、スケジューラのインメモリ結合テスト |
| 暗号化 / E2EE / ユーティリティ | `vitest` + Web Crypto API (Node 20+ 組み込み) | PBKDF2 鍵導出、DEK/MasterKey ラップ、ソートキー生成、バリデーション |
| フロントエンド UI / Hooks | `@testing-library/react` + `vitest` | `PasscodeProvider`, `AccountProvider`, フォームバリデーション等のコンポーネントテスト |

---

## 2. Convex バックエンド関数のテストパターン (`convex-test`)

Convex の Mutation / Query / RLS テストは `convex-test` を用いてインメモリで完結して実行する。

### 基本セットアップ
```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

// Convex モジュールを glob でロード
const modules = import.meta.glob("../convex/**/*.ts");

it("正常系: 家族作成とユーザーの familyId 紐付け", async () => {
  const t = convexTest(schema, modules);

  // 1. テストデータのシード (t.run を使用)
  await t.run(async (ctx) => {
    await ctx.db.insert("users", {
      userId: "user_123",
      email: "user@example.com",
      updatedAt: Date.now(),
    });
  });

  // 2. 認証コンテキストの生成 (withIdentity)
  const asUser = t.withIdentity({
    subject: "user_123",
    email: "user@example.com",
  });

  // 3. customBuilders / Mutation の実行
  const familyId = await asUser.mutation(api.families.createFamily, {
    name: "テスト家族",
    masterKeyEncrypted: "...",
    masterKeyIv: "...",
    masterKeySalt: "...",
  });

  expect(familyId).toBeDefined();

  // 4. DB 結果の検証
  const user = await t.run(async (ctx) => {
    return await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", "user_123"))
      .unique();
  });
  expect(user?.familyId).toBe(familyId);
});
```

### 認可エラー・RLS 拒否のテスト
```typescript
it("異常系: 対象家族に未所属のユーザーによる共有レコード操作は拒否される", async () => {
  const t = convexTest(schema, modules);
  const targetRecordId = await t.run(async (ctx) => {
    const targetFamilyId = await ctx.db.insert("families", {
      name: "Target Family",
      updatedAt: Date.now(),
    });
    const attackerFamilyId = await ctx.db.insert("families", {
      name: "Attacker Family",
      updatedAt: Date.now(),
    });
    const ownerAccountId = await ctx.db.insert("users", {
      userId: "owner_uid",
      email: "owner@example.com",
      familyId: targetFamilyId,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("users", {
      userId: "attacker_uid",
      email: "attacker@example.com",
      familyId: attackerFamilyId,
      updatedAt: Date.now(),
    });

    return await ctx.db.insert("serviceRecords", {
      title: "Target Record",
      userId: "owner_uid",
      accountId: ownerAccountId,
      familyId: targetFamilyId,
      ownerType: "family",
      ownerFamilyId: targetFamilyId,
      admins: [ownerAccountId],
      credentials: [],
      tags: [],
      updatedAt: Date.now(),
    });
  });
  const attacker = t.withIdentity({ subject: "attacker_uid" });

  await expect(
    attacker.mutation(api.records.deleteRecord, {
      id: targetRecordId,
    }),
  ).rejects.toThrow("Access denied");
});
```

---

## 3. 暗号化 (E2EE) のテストパターン

Node.js 環境の `globalThis.crypto.subtle` を用いて、ブラウザと同一の Web Crypto API ロジックを検証する。

- `crypto.spec.ts`: PBKDF2 反復回数、MasterKey/DEK のラップ＆アンラップ、不正なソルトや破損データ時のエラーハンドリングを網羅。
- `recovery-kit.spec.ts`: Crockford's Base32 リカバリーコードの正規化、類似文字（O/0, I/1）置換、ハッシュ照合のテスト。

---

## 4. UI / Provider のテストパターン

`PasscodeProvider` や `AccountProvider` のように複雑なライフサイクル・揮発性メモリを持つコンポーネントは `@testing-library/react` の `renderHook` や `act` を用いてテストする。

- パスコード誤入力時の指数バックオフ（3回失敗後のロックアウトタイマー）
- アカウント切り替え時の MasterKey リセット検証
- WebAuthn 非対応環境における graceful fallback 動作

---

## 5. テスト実行ルール

- **単体・統合テスト実行**: `pnpm test`
- **一括品質パイプライン**: `pnpm verify`（Typecheck → Lint/Format → Test → Build）
- テスト追加時は `apps/web/tests/` 配下に配置し、ファイル名規則は `*.spec.ts` または `*.test.ts` とする。

# PoohMa Implementation Patterns

PoohMa で実際に採用されている、将来の機能追加や改修で再利用できる実装・調査パターンを整理する。

---

## 1. Convex カスタムビルダーパターン (`convex/customBuilders.ts`)

Convex の関数は直接 export せず、認可レベルに応じたカスタムビルダーでラップして定義する。

```typescript
import { v } from "convex/values";
import { familyBoundMutation } from "./customBuilders";
import { requireContentAccess } from "./rls";

export const updateRecord = familyBoundMutation({
  args: {
    id: v.id("serviceRecords"),
    data: v.object({ /* ... */ }),
  },
  handler: async (ctx, args) => {
    // ctx.user, ctx.identity, ctx.familyId が自動解決・保証されている
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    // RLS による認可チェック
    requireContentAccess(ctx.user, record);

    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
  },
});
```

### ビルダーの選択基準

- `identityVerifiedQuery / Mutation`: ユーザーの Convex DB レコードが存在しない初期登録時のみ使用。
- `authenticatedQuery / Mutation`: アカウントの存在・所有権（IDOR防止）が解決された状態。個人設定やアカウント管理等で使用。
- `familyBoundQuery / Mutation`: 家族所属が前提の操作（レコードCRUD、家族設定、招待管理等）で使用。

---

## 2. レコード単位アクセス制御 (RLS) & レガシー互換パターン (`convex/rls.ts`)

Drive型 ACL 所有権モデル（`user` / `family` + `admins`）と移行期間中のレガシー互換を両立するパターン。

```typescript
// 閲覧・編集の権限確認
requireContentAccess(ctx.user, record);

// 削除・共有解除・管理者変更の権限確認
requireAdminAccess(ctx.user, record);
```

- レコードの `ownerType` や `visibility` を直接判定せず、`getEffectiveOwnerType(record)` や `getEffectiveAdmins(record)` 等のヘルパーを介すことで、スキーマ移行中の旧データと新データを同一ロジックで安全に扱える。

---

## 3. E2EE エンベロープ暗号化・再暗号化パターン (`apps/web/src/lib/crypto.ts`)

### 新規暗号化

1. `generateDEK()` で認証情報単位の DEK を生成
2. `encrypt(passwordHint, dek)` でヒント本体を暗号化
3. `wrapDEK(dek, masterKey)` で DEK をマスターキーで暗号化
4. 両方の暗号文と IV をペアで DB に保存

### 家族移行・パスコード変更時の再暗号化 (`reWrapCredential`)

ヒント本体（暗号化テキスト）の再復号は行わず、**DEK のラップのみを旧マスターキーから新マスターキーへ付け替える**ことで、計算コストと平文漏洩リスクを最小化する。

```typescript
const dek = await unwrapDEK(cred.passwordHintDekEncrypted, cred.passwordHintDekIv, oldMasterKey);
const dekWrapped = await wrapDEK(dek, newMasterKey);
```

---

## 4. Server Functions と ConvexHttpClient のリクエスト分離パターン (`src/services/auth.functions.ts`)

`ConvexHttpClient` は `setAuth` 等で内部状態を持つステートフルなクライアントであるため、**リクエスト間でインスタンスを共有せず、関数実行ごとに生成する**。

```typescript
function createConvexClient() {
  return new ConvexHttpClient(env.VITE_CONVEX_URL as string);
}

export const syncUser = createServerFn({ method: "POST" })
  .validator((data: { idToken: string }) => data)
  .handler(async ({ data: { idToken } }) => {
    const convexClient = createConvexClient();
    convexClient.setAuth(idToken);
    return await convexClient.mutation(api.users.syncUser, { /* ... */ });
  });
```

---

## 5. ログアウト制御とサイレント再認証防止パターン (`useConvexFirebaseAuth.ts`)

ログアウト時は `sessionStorage` に `LOGOUT_FLAG_KEY` をセットし、Cookie による自動セッション復元（サイレント再認証）が即座に再発動するのを防ぐ。

```typescript
// ログアウト時
sessionStorage.setItem("poohma_logout", "true");
await logout(); // Server Function で Cookie 削除 & Firebase トークン失効

// 認証監視時
if (sessionStorage.getItem("poohma_logout")) {
  // サイレント再認証をスキップして未認証状態を確定
  return;
}
```

---

## 6. アカウント切り替え時の状態・キャッシュ破棄パターン (`AccountProvider.tsx`, `PasscodeProvider.tsx`)

同一ブラウザでのアカウント切り替え時に前アカウントの機密データやクエリ結果が残存することを防ぐ。

1. `PasscodeProvider`: `accountId` の変更を検知して `masterKey` を `null` にリセット（再ロック）。
2. `AccountProvider`: 切り替え時にローカルメモリキャッシュの破棄（`clearQueryCache()`）と TanStack Query の無効化・再取得（`await queryClient.invalidateQueries()`）を実行。


---

## 7. 五十音・アルファベット正規化ソートキー生成パターン (`src/utils/index-group.ts`)

日本語・英数字混在レコードを五十音グループ（あ〜わ、英数、記号）順に正確にインデックスクエリするためのパターン。

- サービス名・読み仮名からグループ順位プレフィックス（2桁ゼロ埋め数字）+ NFKC正規化文字列を合成して `sortKey` を生成。
- Convex のインデックス `by_family_sortKey` により、サーバー側でフルテーブルスキャンなしにソート済み取得を実現。

---

## 8. Convex バックエンド関数のテストパターン (`apps/web/tests/convex/`)

`convex-test` を使用し、認証コンテキスト（`as(user)`）や customBuilders、RLS をモックした統合テストを記述する。

```typescript
import { convexTest } from "convex-test";
import { api } from "@/../convex/_generated/api";
import schema from "@/../convex/schema";

test("authenticated user can create record", async () => {
  const t = convexTest(schema);
  const userId = "firebase-uid-123";
  const user = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { userId, email: "test@example.com", updatedAt: Date.now() });
  });

  const asUser = t.withIdentity({ subject: userId });
  // customBuilders を経由した mutation の実行検証
  const recordId = await asUser.mutation(api.records.createRecord, {
    accountId: user,
    title: "Test Service",
    // ...
  });
  expect(recordId).toBeDefined();
});
```

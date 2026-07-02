# 家族間アカウント管理アプリ「PoohMa」詳細設計書

**プロジェクト:** PoohMa (プーマ)
**プラットフォーム:** Vercel (ホスティング) + Convex (Backend / DB)
**フレームワーク:** TanStack Start (Vite / Nitro)

---

## 1. システムアーキテクチャ

TanStack Start によるサーバー・クライアント統合環境を基盤とし、Vercel上にデプロイする。バックエンドおよびデータベースには Convex を全面的に採用し、リアルタイム同期と型安全なデータ層を構築する。

### 1.1 技術スタック

| レイヤー | 技術 |
| :--- | :--- |
| **Framework** | TanStack Start (TanStack Router) |
| **Backend / DB** | Convex |
| **Auth** | Firebase Authentication |
| **State Management** | TanStack Query (SSR/初期データ用) & Convex Hooks (リアルタイム) |

---

## 2. データベース設計 (Convex)

`convex/schema.ts` にて定義されているデータモデル。ドキュメント指向（NoSQL）の特性を活かし、子エンティティは配列として親ドキュメント内にインラインで埋め込む構成をとる。

### 2.1 テーブル定義

- **families**: 家族グループ。`masterKeyEncrypted`, `masterKeyIv`, `masterKeySalt` などの暗号化キー情報を保持。
- **users**: ユーザープロフィール。Firebase UID (`userId`) と `familyId` のマッピング、およびプロフィール情報を管理。
- **serviceRecords**: サービスレコード。アカウント情報の配列（`credentials`）を内包し、`visibility`（PRIVATE / SHARED）によって制御される。

---

## 3. データアクセス層と認可セキュリティ (IDOR対策)

直接Convexの `mutation` や `query` を使用せず、必ずカスタムビルダーを経由して認証とスコープバインドを強制する。

- `authenticatedMutation` / `authenticatedQuery`: ログイン済みユーザーのみ実行可能。
- `familyBoundMutation` / `familyBoundQuery`: ログイン済みかつ家族に所属しているユーザーのみ実行可能。

```typescript
// 実装例: convex/records.ts
export const updateRecord = familyBoundMutation({
  args: { id: v.id("serviceRecords"), data: ConvexRecordInputSchema },
  handler: async (ctx, args) => {
    // 認証と家族所属チェックは自動化済み
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    // RLSバリデーターの実行による認可検証
    requireRecordAccess(ctx.user, record); 
    
    await ctx.db.patch(args.id, { ...args.data, updatedAt: Date.now() });
  },
});
```

---

## 4. キャッシュと状態管理の戦略 (TanStack Query vs Convex)

状態管理の混乱や無駄な二重フェッチ、データの不整合を防ぐため、TanStack QueryとConvexの間でキャッシュと状態管理の責務を厳格に分離する。

### 4.1 役割分担とキャッシュの境界線

| 領域 | 担当技術 | 対象データ | 役割 |
| :--- | :--- | :--- | :--- |
| **認証状態・ルーティング・CMS** | TanStack Query | `authUser`, UI設定, CMSデータ（外部静的コンテンツ） | セッション監視、SSR時の初期データ解決、低頻度更新の外部コンテンツキャッシュ |
| **アプリケーションデータ** | Convex (`useQuery`) | `serviceRecords`, 家族情報, 招待状態など | リアルタイムデータ同期、信頼できる唯一の情報源（Single Source of Truth） |

### 4.2 状態管理における基本原則

1. **二重キャッシュの禁止**
   - Convexが提供するアプリケーションデータ（サービスレコードや家族情報など）は、Convexのリアクティブな同期機構（WebSocket経由の自動更新）を通じてリアルタイムに保たれる。
   - これらのデータをTanStack Queryで再度フェッチまたはラップしてキャッシュすることは、データの不整合（他端末での編集が即時反映されない等）や不要なHTTPリクエストを誘発するため、**厳禁**とする。
2. **描画品質（チラツキ防止）の担保**
   - Convexのデータ取得が開始されてから完了するまでのローディング移行期において、画面のチラツキを防ぐため、コンポーネント内では原則 `usePersistentQuery` を介してメモリ上にフォールバックキャッシュを保持させる。
3. **セッションクリーンアップ**
   - ログアウト時には、TanStack Queryのキャッシュ（`queryClient.clear()`）と `usePersistentQuery` のインメモリキャッシュの両方を即時にクリアし、アカウント間でデータが残存・露出するリスクを排除する。

---

## 5. 開発時の注意点

- **CSVインポート**: メインスレッドのブロッキング（Jank）を防ぐため、10件単位のチャンク分割処理（`processInChunks`）を強制すること。
- **CSV Injection対策**: エクスポート処理時、Excel等の表計算ソフトでの数式誤認を防ぐため、必ず `sanitizeCsvValue` を通して特殊文字（`=`, `+`, `-`, `@`）をエスケープすること。

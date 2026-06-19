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

## 4. キャッシュと状態管理の戦略

状態管理の混乱を防ぐため、以下の明確な境界線を設ける。

| 領域 | 担当技術 | 対象データ | 役割 |
| :--- | :--- | :--- | :--- |
| **ルーティング/SSR** | TanStack Query | `authUser`, UI設定 | URLアクセス時のガード、SSR初期値の決定 |
| **アプリデータ** | Convex (useQuery) | `serviceRecords`, 家族情報 | リアルタイム同期、信頼できる唯一の情報源 |

- **原則**: コンポーネント内では必ず `usePersistentQuery` を使用し、画面遷移時のチラツキ防止を行うこと。
- **ログアウト時**: `queryClient.clear()` を呼び出し、TanStack Query側のセッションキャッシュおよびフォールバックキャッシュを全破棄してデータ残存を防ぐこと。

---

## 5. 開発時の注意点

- **CSVインポート**: メインスレッドのブロッキング（Jank）を防ぐため、10件単位のチャンク分割処理（`processInChunks`）を強制すること。
- **CSV Injection対策**: エクスポート処理時、Excel等の表計算ソフトでの数式誤認を防ぐため、必ず `sanitizeCsvValue` を通して特殊文字（`=`, `+`, `-`, `@`）をエスケープすること。

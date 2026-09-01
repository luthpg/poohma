# PoohMa Pitfalls & Gotchas

AI Agent が誤りやすい点、過去に問題となった点、実装上の罠を整理する。

---

## 1. 実行環境 & シェル (Windows PowerShell)

### `&&` 演算子の使用禁止

- **問題**: Windows PowerShell 7 未満では `&&` が構文エラーになる。
- **回避法**: コマンドの連続実行は避け、個別実行する。やむを得ず連続実行する場合は、各外部コマンドの直後に `$LASTEXITCODE` を確認し、非ゼロなら次のコマンドを実行する前に停止または失敗を報告する（例: `cmd1; if ($LASTEXITCODE -ne 0) { throw "cmd1 failed: $LASTEXITCODE" }; cmd2; if ($LASTEXITCODE -ne 0) { throw "cmd2 failed: $LASTEXITCODE" }`）。

### 丸括弧 `()` を含むパスの誤解釈

- **問題**: `src/routes/(app)/records/$id.tsx` のようなパスをクォートなしで渡すと PowerShell が式として解釈しエラーになる。
- **回避法**: パスは必ずクォートで囲み、`$id` のようなリテラルの `$` を含む場合はシングルクォートを使用する（例: `git add 'src/routes/(app)/records/$id.tsx'`）。

### 日本語コミットメッセージ・PR本文の文字化け

- **問題**: PowerShell の標準パイプライン（`|`）や `-m` 引数はエンコーディングにより日本語が `?` に化ける。
- **回避法**: 必ず **UTF-8 一時ファイルを経由** して `git commit -F $tmpMsgFile` や `gh pr create --body-file $tmpBodyFile` を実行する（GEMINI.md Rule 4, 5）。

---

## 2. Convex & バックエンド開発

### `convex dev` の常駐プロセス

- **問題**: `convex dev` はファイル変更監視モードで常駐するため、AI Agent のセッションが終了しなくなる。
- **回避法**: ワンショットで完了する `pnpm convex:sync`（デプロイ+codegen+フォーマット）または `pnpm convex:codegen` のみを使用する。

### ConvexHttpClient の共有による状態汚染

- **問題**: `ConvexHttpClient` に `setAuth(token)` を呼ぶとクライアント内部に認証状態が保持されるため、モジュールグローバルで共有するとマルチユーザー間で認証情報が混混する。
- **回避法**: Server Functions 内でリクエストごとに `new ConvexHttpClient()` を生成する。

### 生の Convex query / mutation の直接 export

- **問題**: 認可チェックや `resolveAccount` を通さずに Convex 関数を公開すると、未認証アクセスや IDOR 脆弱性の原因になる。
- **回避法**: 必ず `convex/customBuilders.ts` のビルダー（`authenticated*`, `familyBound*` 等）を使用する。

### レコード所有権判定の直接参照

- **問題**: `record.ownerType === "family"` や `record.admins` を直接参照すると、移行前の旧レコード（`visibility: "SHARED"`）で正しく判定できない。
- **回避法**: 必ず `convex/rls.ts` の `getEffectiveOwnerType(record)`, `getEffectiveAdmins(record)` ヘルパーを使用する。

### Firebase UID (`userId: string`) と Convex ID (`Id<"users">`) の混同・型アサーション

- **問題**: Firebase UID（文字列）と Convex の `users` テーブルのドキュメント ID（`Id<"users">`）は別物である。`userId as unknown as Id<"users">` のような安易な型アサーションを行うと、Convex の引数バリデーション（`v.id("users")`）で実行時エラーが発生し、`try-catch` で握りつぶされて障害が表面化しない原因になる。
- **回避法**: `users.syncUser` は対象アカウントの `Id<"users">` を返す。Convex ID を要求する引数には必ず実在する `_id` を渡し、型アサーションで不正な文字列を渡さない。

---

## 3. 暗号化 (E2EE) & WebAuthn

### WebAuthn PRF 拡張の役割の誤解

- **問題**: PRF 拡張が生体認証によるマスターキー直接導出や認証バイパスを行っていると誤認しやすい。
- **実際**: PRF 拡張は「家族パスコードをローカル IndexedDB に暗号化保存し、次回以降のパスコード入力を生体認証で代行する」ためだけに利用されている。復号されたパスコードは通常の `unlock(passcode)`（PBKDF2 鍵導出）に渡される。

### CryptoKey の `extractable` と `keyUsages` の不整合

- **問題**: `generateDEK()` や `unwrapMasterKey()` で `extractable: false` に設定すると、後の再ラップ（`wrapKey`）や家族移行処理でエクスポートできずランタイムエラーになる。また DEK の usages に不要な `wrapKey` を含めると暗号化仕様の整合性を欠く。
- **回避法**: `apps/web/src/lib/crypto.ts` の既存関数（`generateDEK`, `wrapMasterKey`, `unwrapDEK`）のパラメータ設計を厳守し、独自に `crypto.subtle.generateKey` を呼ばない。

### `KDF_VERSIONS` の変更による既存データ復号不能

- **問題**: パスコード反復回数を引き上げる際に `KDF_VERSIONS[1]` の値を書き換えると、既存ファミリーのデータが復号できなくなる。
- **回避法**: `KDF_VERSIONS` は新しいバージョン番号（2, 3...）を追記し、既存エントリは絶対に変更しない。

---

## 4. モノレポ・品質検証・ドキュメント

### Biome の Markdown 非対応

- **問題**: `pnpm check` で `.ai/*.md` や `.docs/*.md` のフォーマットやリンク切れを検出しようとする。
- **実際**: Biome 2.x は Markdown をパース/チェックしない。ドキュメントの整合性確認は手動または専用スクリプトで行う。

### ドキュメント更新の失念

- **問題**: DB スキーマ、API 仕様、E2EE 方式、脅威モデルに関わるコード変更を行った後、`.docs/` や `.docs/security/threat-model.md` の更新を忘れてコミットしてしまう。
- **回避法**: 実装計画時およびコミット前に必ずドキュメント更新要否を確認する（GEMINI.md Rule 6）。

### 環境変数の追加・変更時の CI 設定（`.github/workflows/ci.yml`）更新漏れ

- **問題**: `apps/web/src/env/client.ts` や `server.ts` に必須環境変数を追加・変更した際、ローカルの `.env` のみ更新して `.github/workflows/ci.yml` の `env` を更新し忘れると、GitHub Actions CI の Test / Build ステップで `@t3-oss/env-core` の Zod バリデーションエラーが発生して CI が失敗する。
- **回避法**: 環境変数を追加・変更・削除した際は、必ず `.github/workflows/ci.yml`（`check-and-test` ジョブの `env`）に対応するダミー環境変数を追記・修正する。


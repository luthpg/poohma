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

### 外部 UI / API 連携追加時の CSP（Content Security Policy）設定漏れ

- **問題**: Google Picker などの iframe 埋め込み型 UI や外部 API をクライアントに追加した際、`apps/web/src/start.ts` の CSP ミドルウェアで許可していないと、ブラウザにより iframe や通信がブロックされ、白背景エラー（`Framing 'https://docs.google.com/' violates frame-src 'self'` 等）や通信失敗が発生する。
- **回避法**:
  - iframe を使用する外部機能を追加する場合は、`apps/web/src/start.ts` の `frame-src` に許可対象ドメイン（例: `https://docs.google.com https://drive.google.com`）を明示的に追加する。
  - クライアントから直接呼び出す外部 API がある場合は、`connect-src` に対象ドメイン（例: `https://www.googleapis.com https://apis.google.com`）を追加する。

### Google Picker API の `setEnableDrives(true)` とルートフォルダ選択の制約

- **問題**: `DocsView(ViewId.FOLDERS)` に `setEnableDrives(true)` を設定すると、そのビューは共有ドライブ専用フィルターとなり「マイドライブ」が表示・選択できなくなる。また、Google Picker は一覧内のフォルダアイテムを選択する UI であるため、「マイドライブ直下（root）」そのものを選択状態にできず、Picker 内でのフォルダ新規作成機能も提供されていない。
- **回避法**:
  - マイドライブと共有ドライブを両立させる場合は、マイドライブ用（`setParent("root")`）と共有ドライブ用（`setEnableDrives(true)`）の 2 つの独立した `DocsView` を `PickerBuilder` に登録する。
  - ルート直下保存やフォルダ作成が必要な場合は、Picker だけに依存せず、Google Drive API（`createGoogleDriveFolder` や `parentFolderId: undefined` でのアップロード）をアプリ側 UI（ドロップダウンメニュー等）で選択肢として提供する。

---

## 5. 認証・セッション管理

### Convex 認証への Firebase Custom Token の誤用

- **問題**: Server Function 内などで `adminAuth().createCustomToken(uid)` を生成し、`ConvexHttpClient.setAuth(customToken)` に渡しても Convex 側で JWT 検証エラー（`Unauthenticated`）が発生する。
- **原因**: Convex の OIDC 認証（`auth.config.ts`）は Google 発行の Firebase ID Token（`securetoken.google.com/poohma`）のみを受け付ける。Custom Token は Firebase サービスアカウントによる署名であり OIDC JWT ではない。
- **回避法**: Convex の Mutation / Query 実行は、ブラウザの認証済みクライアント（`useMutation`, `useQuery`）から直接 Firebase ID Token を使って呼び出す。

### Session Cookie への過剰依存による早期ログアウト（数ヶ月ログイン維持の破壊）

- **問題**: TanStack Router の `(app)` ルート保護（`beforeLoad`）で `context.user`（Session Cookie 由来）のみを見て未認証判定（`/login` へ強制リダイレクト）すると、Cookie の最大有効期限（14日）や iOS Safari の Cookie 制約で Cookie が切れた瞬間にユーザーが追い出される。
- **原因**: 長期ログインの本体（Single Source of Truth）はブラウザの Firebase Auth（LOCAL 永続性）であり、Session Cookie は SSR 補助キャッシュに過ぎない。
- **回避法**: ルート保護はクライアント側 `useAuth().isAuthenticated` を判定基準とし、Cookie が切れていても Firebase Auth が生きていればバックグラウンドで `refreshSessionCookie` により Cookie を自動ローリング延長する（DB更新やログイン通知は行わない）。また、`refreshSessionCookie` 内では `verifyIdToken(idToken, true)` で明示的に失効チェックを行い、失効済みアカウントによる不正なセッション延長を防ぐ。

### `verifySessionCookie(..., true)` の `checkRevoked` 誤用によるセッション消失

- **問題**: 通常のセッション検証で `verifySessionCookie(sessionCookie, true)`（`checkRevoked = true`）を指定すると、リクエストごとに Google Auth サーバーへの外部通信が発生し、ネットワークの揺らぎやタイミング差で `session-cookie-revoked` が誤検知され、セッションが突然切れる。

### バックグラウンド非同期処理におけるユーザー・ログアウトのレースコンディション

- **問題**: `syncSessionCookieInBackground` 等のバックグラウンド非同期処理において、`await user.getIdToken()` などの非同期呼び出しの合間にユーザーがログアウトしたり別ユーザーへ切り替わった場合、遅れて返ってきた古いレスポンスが共有の `session` Cookie を上書きし、失効したセッションが復活してしまう。
- **回避法**: 非同期処理の「開始前」と「完了直前（Cookie書き込み前）」の双方で、`auth?.currentUser?.uid === user.uid` かつ `!localStorage.getItem(LOGOUT_FLAG_KEY)` を検証し、状態変化が起きていれば即座に処理を破棄（no-op）する。

### リカバリー用 Custom Token 発行時のセッション失効検証漏れ

- **問題**: セッションCookieからCustom Tokenを再発行するリカバリー関数（`getCustomTokenFromSession`）で `verifySessionCookie(cookie, false)`（失効検査オフ）を使うと、別端末や他タブでログアウト（`revokeRefreshTokens`）済みとなった古いCookieからでもCustom Tokenが再発行され、再ログインに成功してしまう。
- **回避法**: 通常のSSR検証（`getAuthUser`）ではパフォーマンス・遅延防止のため `checkRevoked: false` を用いるが、**セッションの再生産・リカバリーを行う `getCustomTokenFromSession` では必ず `checkRevoked: true` を明示**して失効済みセッションを遮断する。

### ログアウト状態のタブローカル管理（sessionStorage の誤用）

- **問題**: ログアウトフラグを `sessionStorage` だけで保持すると、他タブにログアウトが伝播せず、他タブ側のサイレント再認証が古いCookieを使ってセッションを復活させてしまう。
- **回避法**: オリジン全体で共有すべき認証状態・ログアウトフラグは `localStorage` に一本化し、`window.addEventListener("storage", ...)` で他タブのログアウトを即時検知して全タブを未認証状態へ同期させる。

---

## 6. ドキュメント管理・仕様整合

### 部分的・局所的修正によるドキュメント間の不整合（セルフレビューの落とし穴）

- **問題**: コード修正時に該当箇所のドキュメント（例: フロー図や要件定義）のみを更新し、設計書（`code-design.md`）内の他セクション（ER概要、API一覧、状態管理責務表、シーケンス）や `.docs/security/`、`.ai/` に古い仕様（例: 削除されたServer Function、変更前のテーブル参照関係、古いCookie検証方針）が残骸として残り、CodeRabbit等の静的レビューで指摘される。
- **回避法（セルフレビューのチェックリスト）**:
  仕様やコードの変更を行った際は、必ず以下の関連セクションを横断検索して漏れなく同期する:
  1. **スキーマ・データモデル**: テーブル構成や外部キー（`accountId` vs `userId`）を変更したら、`code-design.md` の「4.1 ER概要」「4.2 テーブル定義」と `.ai/domain.md` を確認。
  2. **API・関数**: Server Function や Convex 関数を追加・削除・改名したら、`code-design.md` の「7. API設計」「7.6 Server Functions」表と `.ai/architecture.md` を確認。
  3. **認証・セッション**: 認証イベント（`onAuthStateChanged` / `onIdTokenChanged`）やストレージ（`localStorage`）を変更したら、`code-design.md` の「5.2 認証フロー」「5.6 ログアウトフロー」「8.4 状態管理表」「security-model.md」を確認。

---

## 7. E2E テスト & クライアントルーティング

### テスト作成時の安易なプロダクションコード改変

- **問題**: テストコード作成中にテストが失敗した際、原因を精査せず安易にプロダクションコードを変更したり、プロダクションコードのバグを発見した際にユーザーの許可なく独断で修正を加えてしまう。
- **回避法**: テスト実装時の不具合はまずテストコード自体の改善・待機処理の調整で解決できないかを試みる。どうしてもプロダクションコードの修正が必要、またはプロダクションコードの明らかなバグである場合は、独断で修正を実行せず、必ず事前にユーザーへ事象・原因・修正案を報告し、実行の許可を得てから対応する。

### Playwright `extraHTTPHeaders` による外部 API の CORS プリフライト拒否

- **問題**: `playwright.config.ts` の `use.extraHTTPHeaders` に `x-vercel-protection-bypass` や Cloudflare Access ヘッダーを指定すると、ブラウザが発行するすべてのリクエスト（Google Identity Toolkit `identitytoolkit.googleapis.com` 等の外部サードパーティ API を含む）に付与される。Google 等の API サーバーは非ホワイトリストのカスタムヘッダーを CORS OPTIONS プリフライトで拒否するため、`auth/network-request-failed` が発生してログインできなくなる。
- **回避法**: `playwright.config.ts` でのグローバルヘッダー設定を廃止し、`e2e/support/test-fixtures.ts` 内で `context.route` を使って `baseURL`（自アプリのオリジン）宛て通信のみにバイパスヘッダーを注入する。

### 未認証ルートガード（`(app)/route.tsx`）における `useEffect` ナビゲーションの無限ループ / Abort

- **問題**: `(app)/route.tsx` で未認証時に `useEffect` 内で `navigate({ to: "/login", search: { redirect: location.href } })` を呼ぶ際、依存配列に `location.href` を含めていると、リダイレクト処理中の中間 URL 変化で再レンダリングが連鎖し、先行するナビゲーションが次々とキャンセル（Abort）されてローディングスピナーのまま遷移が完了しなくなる。
- **回避法**: `useRef(false)`（`hasRedirectedRef`）を用いて、未認証遷移がトリガーされたら1度だけ `navigate` を実行するようにガードする。

### ログアウト処理における Server Function と Client Auth の実行順序（Race Condition）

- **問題**: ログアウト時に `await signOut(auth)` を先に実行し、その後に Server Function `await logout()` を呼ぶと、`signOut` 完了瞬間に `onAuthStateChanged` が発火してコンポーネントツリーがアンマウント / 未認証遷移を開始し、進行中の `logout()` fetch がブラウザによって中断（`TypeError: Failed to fetch`）される。その結果、サーバー側の Session Cookie が削除されずに残り、セッションが不整合となる。
- **回避法**: 必ず **Server Function `await logout()`（Cookie 削除）を先に完了**させ、その後に `await signOut(auth)`（クライアント認証状態破棄）を呼び出す順序を徹底する。

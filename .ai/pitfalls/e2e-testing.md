# Pitfalls: E2E テスト & クライアントルーティング

Playwright E2E テストおよびフロントエンド遷移における落とし穴と回避法です。

---

### テスト作成時の安易なプロダクションコード改変（絶対禁止）

- **問題**: テストコード作成中にテストが失敗した際、原因を精査せず安易にプロダクションコードを変更したり、プロダクションコードのバグを発見した際にユーザーの許可なく独断で修正を加えてしまう。
- **回避法**: テスト実装時の不具合はまずテストコード自体の改善・待機処理の調整で解決できないかを試みる。どうしてもプロダクションコードの修正が必要な場合は、独断で修正を実行せず、必ず事前にユーザーへ事象・原因・修正案を報告し、実行の許可を得てから対応する（GEMINI.md 最重要原則）。

---

### Playwright `extraHTTPHeaders` による外部 API の CORS プリフライト拒否

- **問題**: `playwright.config.ts` の `use.extraHTTPHeaders` に `x-vercel-protection-bypass` や Cloudflare Access ヘッダーを指定すると、ブラウザが発行するすべてのリクエスト（Google Identity Toolkit 等の外部 API を含む）に付与され、CORS OPTIONS プリフライト拒否で `auth/network-request-failed` が発生してログインできなくなる。
- **回避法**: グローバルヘッダー設定を廃止し、`e2e/support/test-fixtures.ts` 内で `context.route` を使って自アプリオリジン（`baseURL`）宛て通信のみにバイパスヘッダーを注入する。

---

### 未認証ルートガード（`(app)/route.tsx`）における `useEffect` ナビゲーションの無限ループ / Abort

- **問題**: `(app)/route.tsx` で未認証時に `useEffect` 内で `navigate({ to: "/login", search: { redirect: location.href } })` を呼ぶ際、依存配列に `location.href` を含めていると、中間 URL 変化で再レンダリングが連鎖し、先行ナビゲーションが次々と Abort されてローディングスピナーのままフリーズする。
- **回避法**: `useRef(false)`（`hasRedirectedRef`）を用いて、未認証遷移がトリガーされたら1度だけ `navigate` を実行するようにガードする。

---

### ログアウト処理における Server Function と Client Auth の実行順序（Race Condition）

- **問題**: ログアウト時に `await signOut(auth)` を先に実行し、その後に Server Function `await logout()` を呼ぶと、`signOut` 完了瞬間に `onAuthStateChanged` が発火してコンポーネントツリーが未認証遷移を開始し、進行中の `logout()` fetch がブラウザによって中断（`TypeError: Failed to fetch`）される。その結果、サーバー側の Session Cookie が削除されずに残る。
- **回避法**: 必ず **Server Function `await logout()`（Cookie 削除）を先に完了**させ、その後に `await signOut(auth)`（クライアント認証状態破棄）を呼び出す順序を徹底する。

---

### 家族所属状態によるログアウト UI の配置分岐と E2E テスト

- **問題**: 家族未所属時は画面直下に「ログアウト」ボタンが直接レンダリングされるが、家族所属済みになると「ダッシュボードへ」リンクに変化し、ログアウトボタンは `UserMenu`（アバタードロップダウン）内へ格納される。家族所属状態でテストが走ると、画面直下のログアウトボタンが見つからず `TimeoutError` となる。
- **回避法**: E2E テストでは画面直下にログアウトボタンが存在するかを判定し、存在しない場合は `[data-testid="user-menu-trigger"]` をクリックして `UserMenu` 内のログアウトを選択するフォールバックを組む。

---

### 大量データ暗号化・外部APIフェッチを伴うE2Eテストのタイムアウト

- **問題**: CSVインポートテスト（`e2ee-seed-import.spec.ts`）など、数十件のレコードに対してクライアント側 Web Crypto 暗号化、外部 OGP フェッチ、形態素解析（ルビ取得）を順次実行する巨大なジャーニーテストでは、`@playwright/test` のテストごとのデフォルトタイムアウト（30秒）を超えてしまうことがある。これは `playwright.config.ts` の `webServer` 起動タイムアウト（120秒）とは別の設定である。
- **回避法**: 大量の非同期暗号化・外部通信を伴うテストスイートでは、個別の `test.setTimeout(300_000)` 等で十分なタイムアウト値を明示的に設定する。

---

### 動的 Convex Preview 環境における CSP（Content-Security-Policy）違反

- **問題**: Vercel Preview デプロイメントで動的な Convex Preview Deployment（`preview/e2e-test` 等）を使用する場合、Convex URL は `https://<preview-hash>.convex.cloud` のように動的サブドメインとなる。サーバー側（TanStack Start の `cspMiddleware`）で生成する CSP ヘッダーが本番・開発用の固定 Convex URL のみ許可していると、ブラウザからの WebSocket / HTTPS 接続が CSP 違反でブロックされ、全ミューテーションやサブスクリプションが失敗する。
- **回避法**: Preview 環境（`VERCEL_ENV === "preview"`）においては、CSP の `connect-src` に `wss://*.convex.cloud https://*.convex.cloud` を含めて任意の Convex Deployment を許可する（Production は引き続き単一ドメインに限定）。

---

### パブリック CI における Playwright トレースと機密ヘッダー漏洩（CWE-200）

- **問題**: Playwright の `trace: "on-first-retry"` をパブリックリポジトリの CI で有効化し、`test-results/` をそのまま GitHub Actions Artifacts にアップロードすると、リトライ時に生成された `trace.zip` のネットワーク HAR ログ内に `x-vercel-protection-bypass` や `CF-Access-Client-Secret`、セッショントークンなどの機密値が記録され、ダウンロード可能な成果物経由で外部漏洩するリスク（CWE-200）がある。
- **回避法**:
  1. `playwright.config.ts` で `trace: process.env.CI ? "off" : "on-first-retry"` とし、CI 環境では生ネットワークトレースの記録自体を無効化する（ローカルではデバッグ用に維持）。
  2. ワークフロー（`upload-artifact`）のパスに `!apps/web/test-results/**/*.zip` を指定し、万が一のアーカイブ生成時もアップロードから完全除外する。
  3. 失敗時のデバッグには `screenshot: "only-on-failure"` の画像および HTML レポート、ターミナル出力を使用する。

---

### 未認証ガード検証時の `page.goto` とクライアント即時リダイレクトによる `net::ERR_ABORTED`

- **問題**: ログアウト完了や未認証状態を確認するため、テストコードから保護ルート（`/family` など）へ直接 `page.goto` する際、アプリ側の未認証ガード（`apps/web/src/routes/(app)/route.tsx`）が即座に `/login` へのクライアントサイド遷移を実行すると、HTML ロード完了前にナビゲーションが中断され、Playwright で `page.goto: net::ERR_ABORTED` 例外が発生してテストがタイムアウト・失敗する。
- **回避法**: 未認証ガードでリダイレクトされることが期待されるルートへの直接アクセス検証（`apps/web/e2e/logout.spec.ts` 等）では、`Promise.all` を用いて `/login` への遷移完了待機と `page.goto` の中断例外（`ERR_ABORTED`）の許容を同時に行う。

  ```typescript
  await Promise.all([
    page.waitForURL((url) => url.pathname === "/login", { timeout: 20000 }),
    page.goto("/family").catch((err: Error) => {
      if (!err.message.includes("ERR_ABORTED")) throw err;
    }),
  ]);
  await expect(page).toHaveURL(/.*\/login/);
  ```

---

### Convex Preview 環境における E2E テストの再利用（reuse）とクリーン（recreate）のトレードオフ

- **問題**: ローカルで `pnpm test:e2e`（または `test:e2e:show`）を反復実行した際、先行テスト（例: `e2ee-seed-import` 等の統合ジャーニーテスト）が途中で失敗・中断すると、Convex Preview DB 上にテスト用サブアカウントや家族データが残留し、後続テストで「未認証リダイレクト（`/login` へ強制遷移）」が連鎖発生して無関係なテストまで巻き添えで落ちる。
- **原因**: 通常の `pnpm test:e2e` はデプロイ高速化のために既存の Preview Deployment を再利用（`--preview-name`）しており、先行テストの失敗でクリーンアップされなかったゴミデータが DB に残存してセッションやユニーク制約の競合を引き起こすため。
- **回避法**:
  1. 通常の開発反復時は高速な再利用モード（`test:e2e`）で良いが、**セッション切断やデータ不整合による連鎖失敗が発生した際、およびコミット前・PR提出前の最終フル検証時は `pnpm test:e2e:clean`（`--preview-create`）を実行**して Preview DB を完全に初期化・地ならしする。
  2. これにより、`e2e/.auth` の古いストレージも破棄され、`auth.setup.ts` で完全に新規の Firebase ID トークンとセッション Cookie からクリーンにテストが開始される。
- **関連実装**:
  - `packages/backend/scripts/setup-preview.ts`
  - `apps/web/e2e/auth.setup.ts`

---

### Vitest 単一ファイル実行時における全体カバレッジ閾値未達判定の誤解

- **問題 (Problem)**:
  `pnpm vitest run <ファイルパス>` で特定のコンポーネントテストや単体テストを実行した際、全テストケースが合格しているにもかかわらず、プロセスが exit code 1 で失敗終了し、テストが落ちていると誤認してしまう。
- **原因 (Root Cause)**:
  Vitest のカバレッジプロバイダが有効な状態で単一ファイルのみを動かすと、実行されなかったファイルも含めたプロジェクト全体のグローバル閾値（例: Lines 50%, Branches 40% 等）と突き合わされるため、分母に対して分子が不足し、カバレッジ閾値エラーとして判定されるため。
- **誤ったアプローチ (Anti-Pattern)**:
  - 単一テストのためにプロダクションコードを無理に改変したり、テストケースを強引に増やして局所的なカバレッジ数値を上げようとする。
  - テストが壊れていると勘違いして設定を壊してしまう。
- **正しいアプローチ (Correct Pattern)**:
  - 個別テストの開発・確認時は `--coverage.enabled=false` を付与してテスト自体の合否のみを確認する。
  - プロジェクト全体の網羅率が基準を満たしているかは、単一ファイルではなく `pnpm test` 等で全テストスイートを一括実行して確認する。

---

### E2E 並列実行における Firebase UID 共有と空振りタイムアウト待機の落とし穴

- **問題**:
  1. 複数の並列ワーカーが同一の Firebase UID（`e2e-test-user`）や共通 `storageState` を共有すると、アクティブアカウント Cookie（`poohma_active_account`）や家族名の書き換えが競合し、さらに `logout.spec.ts` の `revokeRefreshTokens(uid)` が他ワーカーのセッションを強制失効させる。
  2. `<OnboardingModal>` が描画されないルート（`/family`、`/records/new`）で `ensureOnboardingCompleted` の固定4秒待機を呼んだり、家族所属済み状態で `familyCreateInput.waitFor({ timeout: 5000 })` のタイムアウト例外で分岐判定すると、テスト全体で数十秒の空振り待ちが積み重なる。
  3. `/records/new` 等の家族必須ルートへ未所属状態で直接 `page.goto` すると、SSR/初期描画で一瞬フォームが見えた直後に `(app)/route.tsx` の非同期ガードで `/family` へリダイレクトされ、単独実行時にフォーム入力途中で要素消失エラーとなる。
- **回避法**:
  1. `e2e/support/test-fixtures.ts` の `workerStorageState`（`scope: "worker"`）と `getWorkerIdentity` により、Worker ごと（および `logout` 専用）に独立した Firebase UID と `storageState` を分離し、`cleanup.ts` で全アクティブ UID の Convex データ削除と動的 Firebase ユーザー回収を行う。
  2. 分岐判定には固定タイムアウトの `try/catch` を使わず、`familyCreateInput.or(familyManagerSection).first().waitFor({ state: "visible" })` や `modalTitle.or(recordCount).first().waitFor({ state: "visible" })` のような複合ロケータによる状態待機を用いる。
  3. 家族所属が前提のテスト（`/records/new` 等）は、先行テストの副作用に依存せず `ensureFamilyAssigned` で家族所属状態を確定させてから対象ルートへ遷移する。

---

### 外部サービス間（Convex + Firebase Auth）を跨ぐ E2E テストデータ回収における削除順序と Source of Truth 消失の罠

- **問題**:
  - 動的ワーカー UID や過去の中断セッションを回収する際、`purgeConvexDataForUid` が一時的な通信エラーや Convex 例外で失敗したにもかかわらず、呼び出し元が無条件に `deleteE2EFirebaseUserIfDynamic(uid)` を実行してしまうと、Firebase ユーザーのみが先に削除され、Convex 側のファミリー・アカウント・レコードが孤立データとして取り残される。
  - 残留テストユーザーの自動検知機構（`listStaleE2ETestUids`）は Firebase Auth（`auth.listUsers`）を走査して動的 UID（`e2e-*@poohma-staging.internal`）を列挙しているため、Firebase 側を消してしまうと、次回以降のテスト実行時に当該 UID を再発見・再パージする手段（Source of Truth）が永久に失われる。
- **回避法**:
  - Convex パージ処理の戻り値を `Promise<number | null>` とし、正常終了（削除件数 0 件を含む）と異常終了（`null`）を厳格に区別する。
  - Convex パージが成功した UID（`deleted !== null`）のみ Firebase ユーザーを削除し、パージ失敗時は Firebase ユーザーを意図的に保持する。これにより、次回以降の実行（`auth.setup.ts` や `auth.teardown.ts`）で `listStaleE2ETestUids` から自動的に再検出され、Convex データの確実な後続クリーンアップが行われる。

---

### E2E テスト反復実行による Convex クラウド枠（Usage Limit）枯渇の罠

- **問題**:
  - E2E テストは短時間に大量の DB クエリ・ミューテーション（セットアップ、認証、シードインポート、一括削除、監査ログ、Teardown 等）を発行する。
  - ローカル開発中に E2E テストを頻繁に反復実行すると、Convex 無料プランの月間呼び出し枠（Usage Limit）が急速に消費され、制限到達によりステージング環境や開発環境全体の API が停止するリスクがある。
- **回避法**:
  - ローカルでの反復検証には、Docker による Self-hosted Local Backend（`pnpm test:e2e:local`）を活用する。
  - `packages/backend/docker-compose.local.yml` およびセットアップスクリプトにより、ローカル Docker（`http://127.0.0.1:3210`）へコードを即時デプロイし、`e2e/.env.e2e-local` 経由で Playwright に読み込ませることで、クラウド枠の消費をゼロに抑えて E2E テストを安全に反復実行できる。

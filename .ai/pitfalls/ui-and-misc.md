# Pitfalls: UI・スタイリング & 環境設定

UI 実装、外部 API 連携、環境変数、モノレポ設定における落とし穴と回避法です。

---

### Biome の Markdown 非対応

- **問題**: `pnpm check` で `.ai/*.md` や `.docs/*.md` のフォーマットやリンク切れを検出しようとする。
- **実際**: Biome 2.x は Markdown をパース/チェックしない。ドキュメントの整合性確認は手動または専用スクリプトで行う。

---

### 環境変数の追加・変更時の CI 設定（`.github/workflows/ci.yml`）更新漏れ

- **問題**: `apps/web/src/env/client.ts` や `server.ts` に必須環境変数を追加した際、ローカルの `.env` のみ更新して `.github/workflows/ci.yml` の `env` を更新し忘れると、GitHub Actions CI の Test / Build で Zod バリデーションエラーが発生して CI が失敗する。
- **回避法**: 環境変数を追加・変更した際は、必ず `.github/workflows/ci.yml`（`check-and-test` ジョブ）に対応するダミー環境変数を追記する。

---

### 外部 UI / API 連携追加時の CSP（Content Security Policy）設定漏れ

- **問題**: Google Picker などの iframe 埋め込み型 UI や外部 API を追加した際、`apps/web/src/start.ts` の CSP ミドルウェアで許可していないと、ブラウザにより通信や埋め込みがブロックされる。
- **回避法**: iframe を使用する場合は `frame-src`、クライアントから直接呼び出す外部 API がある場合は `connect-src` に対象ドメインを明示的に追加する。

---

### Google Picker API の `setEnableDrives(true)` とルートフォルダ選択の制約

- **問題**: `DocsView(ViewId.FOLDERS)` に `setEnableDrives(true)` を設定するとマイドライブが表示されなくなる。また Google Picker はマイドライブ直下（root）そのものを選択状態にできない。
- **回避法**: マイドライブ用（`setParent("root")`）と共有ドライブ用（`setEnableDrives(true)`）の 2 つの独立した `DocsView` を登録する。

---

### 親コンテナのパディングとネガティブマージンの不整合による水平オーバーフロー

- **問題**: 親コンテナが `p-4 sm:p-6` とモバイル時に縮小されているにもかかわらず、子要素で `-mx-6` を固定指定してしまうと、モバイル画面で左右 8px ずつ画面外へ飛び出し、水平スクロール（横揺れ）が発生する。
- **回避法**: ネガティブマージンは必ず親要素のレスポンシブパディングと完全に同一のブレークポイントと値で指定する（例: `-mx-4 sm:-mx-6 px-4 sm:px-6`）。

---

### ドキュメント・設定ファイルにおけるローカル絶対パス（`file:///`）の混入

- **問題**:
  - AI エージェントのチャット出力用リンク指示（`file:///...` スキームの絶対パスリンク）に引きずられ、リポジトリにコミット・管理するドキュメント（`GEMINI.md`、`.ai/*.md`、`.agents/skills/...` 等）にまで `file:///c:/Users/...` のようなローカル絶対パスを記述してしまう。
  - 他の開発者環境や GitHub Web 上でリンク切れを引き起こすだけでなく、OS のローカルユーザー名や環境固有パスなどの情報が Git履歴に漏洩する。
- **回避法**:
  - コミット対象となるドキュメント内の Markdown リンクは、**必ずリポジトリ内相対パス（例: `./.ai/invariants.md`、`../invariants.md` 等）** で記述する。
  - チャット返答用の絶対パスリンクと、コミットするドキュメントの相対パスリンクの責務を厳格に区別し、ドキュメント変更時はコミット前に `file:///` や `Users/` が残存していないか確認する。

---

### iOS Safari における入力欄フォーカス時の自動ズーム（フォントサイズ 16px 未満）

- **問題**: モーダルやフォーム内の `<input>`、`<textarea>` に `text-sm`（14px）等の 16px 未満のフォントサイズが指定されていると、iOS Safari でフォーカス時に画面全体が勝手に拡大（自動ズーム）され、ボタンが隠れたりレイアウト崩れが発生する。
- **回避法**: プロジェクト内のすべての入力欄（サブアカウント作成、リカバリーコード入力、パスコード入力など）は、モバイル表示時に必ず `text-base`（16px）以上を維持する（デスクトップで縮小する場合は `text-base md:text-sm` 等にする）。

---

### Driver.js ガイドツアーにおける誤離脱とUI操作必須ステップの設計

- **問題**:
  1. `allowClose: true` のままにすると、暗い背景オーバーレイを誤クリックしただけでツアーが不意に終了してしまい、離脱したユーザーが二度とツアーを体験できなくなる。
  2. 画面上のボタン（例: 暗号化ヒントの「🔒 クリックして表示」）を押させたいステップで、ポップオーバー側にも「次へ」「完了」ボタンが表示されていると、ユーザーが画面のボタンを押さずに次へ進んでしまい、未復号のまま完了扱いになってデータやUIの状態不整合が発生する。
  3. 画面間を跨ぐツアー（ダッシュボード ➔ 詳細 ➔ ダッシュボード後半）において、URLクエリ（`?onboarding=part2`）の復帰ロジックに「初回オンボーディング未完了（`needsOnboarding`）」のガードを入れてしまうと、既存アカウントやツアー再開時に後半ツアーが拒絶されて起動しなくなる。
  4. **`nextButton` / `previousButton` への直接 DOM `addEventListener` の不発**: Driver.js は内部で `document` にキャプチャフェーズ（`capture: true`）のクリックリスナーを登録し、`stopImmediatePropagation()` を実行する。そのため、`onPopoverRender` 内で `popover.nextButton.addEventListener("click", ...)` を登録してもイベントが到達せず発火しない。
  5. **単一ステップツアーでの `previousButton` 自動 disabled 化と離脱時の完了誤認**: Driver.js は先頭ステップ（`isFirstStep()`）で `previousButton` を自動的に `disabled` かつ `driver-popover-btn-disabled` にする。これを単一ステップツアーのサブアクション（「このまま家族設定を見る」等）に流用すると非活性のままになる。また、単一ステップツアーは常に `isLastStep()` が true になるため、終了フック（`onDestroyStarted`）で `driver.isLastStep()` を完了判定に含めていると、背景クリックや閉じるボタン等の離脱でも「ツアー完了」と誤認される。
- **回避法**:
  1. 通常の手動ツアーでは `allowClose: false` を指定して背景クリックによる離脱を禁止し、離脱はポップオーバー右上の「×」ボタンに一元化する。
  2. UIボタン操作が必須のステップでは `popover.showButtons: ["previous", "close"]` を設定し、ポップオーバーの「次へ」ボタンを物理的に非表示にする。UI側のボタンクリック時にツアーを一時閉じ（`onRevealStart`）、処理完了後に次のツアーを自動再開（`onRevealSuccess`）させる。
  3. URLクエリに `onboarding=part2` や `onboarding=modal` などの明示的なシグナルがある場合は、完了フラグの有無に関係なく素直にフェーズを復元・起動する。
  4. 完了や戻るのアクションは DOM イベントではなく、Driver.js 公式の `onDoneClick`、`onPrevClick`、`onCloseClick` コールバックで宣言的に実装する。
  5. 単一ステップで `previousButton` をサブアクションとして使う場合は、`onPopoverRender` で `removeAttribute("disabled")`、`disabled = false`、`pointerEvents = "auto"` を指定して強制活性化する。また完了判定は `isLastStep()` に頼らず、`onDoneClick` で明示的に立てたフラグのみで行う。


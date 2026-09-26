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

---

### オンボーディング完了処理におけるレスポンシブ即時完了とクエリ消去によるレースコンディション

- **問題**:
  - オンボーディングの「スキップ」や「ツアー完了」時、ユーザー体験向上のためサーバー通信待ちの前にレスポンシブにローカル状態（`phase = "completed"`）を更新し、同時に URL クエリ（`?onboarding=...`）を消去することがある。
  - しかし、クエリ消去によってコンポーネントが再レンダリングされ、ダッシュボード等の自動初期化 effect が再発火する。
  - この時、Convex 等のバックエンド更新とキャッシュ（TanStack Query / authUser）の反映には通信遅延（数十〜数百ms）があるため、キャッシュ上はまだ未完了（`needsOnboarding === true`）のままとなる。
  - その結果、新規家族（レコード件数 0）などで「初回モーダルを自動表示する」ロジックが誤って再発火し、スキップしたはずのモーダルが再オープンするレースコンディションが発生する。
- **回避法**:
  - **Single Source of Truth**: クライアントローカルで `phase === "completed"` となった時点で、キャッシュの遅延に関わらず未完了判定を即時無効化（`if (phase === "completed") return false;`）する。
  - **状態機械の防衛**: `showModal` に `if (phase === "completed") return;` ガードを設け、完了状態からモーダル表示への逆戻りを防止する。
  - **初期化 effect の責務限定**: ダッシュボード等の自動起動 effect では `if (phase !== "idle") return;` を設け、既に進行中または完了状態の場合は自動判定を確実にスキップする。

---

### iOS WebKit（特に PWA）における `window.scrollTo({ behavior: "smooth" })` のドラッグ連続呼出しによるキューイング暴走

- **問題**:
  - インデックススクロールバーやシークバー等のタッチドラッグ操作時に、移動イベント（`touchmove` / `pointermove`）の都度 `window.scrollTo({ behavior: "smooth" })` を高頻度で呼び出すと、iOS WebKit（特にホーム画面追加した PWA 環境）でスクロールアニメーションが競合・内部キューイングされる。
  - その結果、指を離した後もキューが消化されるまで画面が勝手にスクロールし続け、目的位置を大幅にオーバーランしたり制御不能になる。
- **回避法**:
  - タップ時の単発ジャンプにはブラウザ標準の `behavior: "smooth"` を使いつつ、ドラッグ追従操作には `requestAnimationFrame` + 線形補間（lerp: `current + (target - current) * factor`、減速カーブ）による自前スムーススクロールを採用する。
  - ドラッグ中はターゲット座標を上書き更新するだけに留め、1つの rAF ループで現在位置をターゲットへ追従させることで、WebKit ネイティブ smooth のキューイング暴走を回避しながら滑らかな追従を実現する。

---

### iOS Safari / PWA におけるタッチドラッグ中の `:active` 擬似クラス残留と WebKit タップハイライト

- **問題**:
  - iOS Safari / PWA では、タッチ開始（`touchstart`）した要素に付与された CSS `:active` 疑似クラス（例: Tailwind の `active:bg-orange-500/25`）やデフォルトのタップハイライト枠が、指をドラッグして他要素上へ移動してもタッチ終了（`touchend`）まで解除されない。
  - これにより、インデックススクロールバー等で「最初に触れたボタン」と「現在指がいるボタン（ドラッグ追従）」の双方が同時に光ってしまい、視覚的混乱を招く。
- **回避法**:
  - ドラッグ追従する連続要素群では `:active` 疑似クラスによるハイライト装飾を行わず、JavaScript 側の追従状態（`activeKey === key`）のみで背景色・文字色を排他的に制御する。
  - また、WebKit 固有のタップ時のグレー枠を消去するために対象ボタンへ `-webkit-tap-highlight-color: transparent` を付与し、タッチスクロールとの衝突を防ぐために `touch-action: none` を指定する。

---

### React Hooks のトップレベル呼び出しルールと権限制限セクションの安全なモック分離

- **問題**:
  - 管理者専用機能など特定の権限や条件でのみ表示したいセクションにおいて、コンポーネント冒頭で `if (!isAdmin) return <AdminRestrictedSection />` のように早期リターンしてしまうと、その直下に記述されている `useState`, `useMutation`, `useQuery` 等のフック呼び出しが条件付き実行となり、React の「Rules of Hooks（フックをループや条件分岐の内部で呼んではならない）」に違反する。
  - これにより Biome の `lint/correctness/useHookAtTopLevel` エラーが発生するだけでなく、権限切り替え時等にフックの呼び出し順序が崩れて状態不整合・クラッシュの原因となる。
  - かといって全フックを実行した後に `if (!isAdmin)` で表示だけ切り替えると、一般メンバーの端末上で不要な Convex Query やフックが常時起動・購読されてしまい、パフォーマンス低下やセキュリティ・認可エラーのリスクを招く。
- **回避法**:
  - **ラッパーとコンテンツの分離**: フック群を持つ実機能コンポーネント（`*Content`）と、フックを持たない外側ラッパーコンポーネントを明確に分離する。
  - **排他的マウント**: 外側のラッパー側で `isAdmin` を判定し、非管理者時には外形のみを模した静的スケルトン（`AdminRestrictedSection`）のみを返し、管理者時のみ `*Content` をマウントする。
  - これにより、React Hooks のルールを厳格に遵守しつつ、一般メンバー端末では実フックやクエリが一切起動しないクリーンで安全な権限分離が実現できる。


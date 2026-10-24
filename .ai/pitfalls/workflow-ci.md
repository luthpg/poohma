# GitHub Actions & CI/CD ワークフローの落とし穴

GitHub Actions ワークフロー作成・保守における典型的な落とし穴と、PoohMa における対策・防止策をまとめる。

---

## 1. `jq` フィルタ内でのシェル変数直接参照によるコンパイルエラー

### 事象

GitHub Actions のインラインスクリプト内で、シングルクォート括りの `jq` 式にシェル変数を直接記述する：

```bash
TRIGGERED_BY=$(echo "$RESPONSE_JSON" | jq -r '.triggeredBy // $ACTOR')
```

一見正しそうに見えるが、シングルクォート内であるためシェル変数 `$ACTOR` は展開されず、そのまま文字通り `'.triggeredBy // $ACTOR'` として `jq` に渡される。`jq` は `$ACTOR` を未定義の `jq` 内部変数と判定し、**コンパイルエラー（`jq: error: $ACTOR is not defined`）** となる。
GitHub Actions の Ubuntu ランナーは既定で `bash -e`（エラー時即時中断）が有効なため、この行でジョブがクラッシュし、後続のステップ（Discord 通知等）が中断してしまう。

### 対策

シェル変数は必ず `jq` の `--arg` または `--argjson` オプションで渡す：

```bash
TRIGGERED_BY=$(echo "$RESPONSE_JSON" | jq -r --arg actor "$ACTOR" '.triggeredBy // $actor')
```

---

## 2. `$GITHUB_OUTPUT` や `$GITHUB_STEP_SUMMARY` のクォート不足と個別リダイレクト

### 事象

```bash
echo "http_status=${HTTP_STATUS}" >> $GITHUB_OUTPUT
echo "response_body<<EOF" >> $GITHUB_OUTPUT
...
cat <<EOF >> $GITHUB_STEP_SUMMARY
```

`$GITHUB_OUTPUT` や `$GITHUB_STEP_SUMMARY` をダブルクォートで囲まないと、`shellcheck` により **SC2086 (Double quote to prevent globbing and word splitting)** の警告・エラーが報告される。
また、同一ファイルに対して複数回個別に `>> $GITHUB_OUTPUT` を繰り返すと、**SC2129 (Consider using { cmd1; cmd2; } >> file instead of individual redirects)** が報告される。

### 対策

リダイレクト先は必ずダブルクォートで保護し、複数行出力はブロックでまとめる：

```bash
{
  echo "http_status=${HTTP_STATUS}"
  echo "response_body<<EOF"
  echo "$HTTP_BODY"
  echo "EOF"
} >> "$GITHUB_OUTPUT"

cat <<EOF >> "$GITHUB_STEP_SUMMARY"
```

---

## 3. `curl` のタイムアウト未指定によるジョブの最長6時間ハング

### 事象

外部エンドポイント（Convex HTTP Action や Discord Webhook など）を呼び出す `curl` コマンドにタイムアウトが指定されていないと、ネットワーク瞬断や相手先サーバーの応答ハング時に接続が切れず、GitHub Actions ジョブの既定上限である**最大6時間**まで runner を占有し続けてしまう。

### 対策

すべての `curl` 呼び出しに適切な `--connect-timeout` と `--max-time` を設定する：

```bash
# 重い処理（リセット実行など）
curl -s --connect-timeout 10 --max-time 60 ...

# 外部通知（Discord Webhook など）
curl -s --connect-timeout 5 --max-time 15 ...
```

---

## 4. `curl | bash` による未検証スクリプトの動的実行リスク

### 事象

CI ワークフロー内でツールを導入する際、`bash <(curl https://raw.githubusercontent.com/.../install.sh)` のようにインターネット上の生スクリプトをパイプ実行すると、サプライチェーン攻撃やネットワーク障害時のビルド不安定化を招く。

### 対策

- CI ワークフローでは、コミットハッシュやバージョンタグで固定された公式 GitHub Action（例: `reviewdog/action-actionlint@v1.77.0`）を使用する。
- ローカル検証では、CI と 100% 同一の検出ルールを維持するため、CI で使われているイメージと同一の `ghcr.io/reviewdog/action-actionlint:v1.77.0` を用いて actionlint を実行する（古い `rhysd/actionlint:latest` は Node 20 非推奨チェック等の新しいルールが未反映で検知漏れの原因となる）。

---

## 5. コミット前のローカル静的検証義務（`pnpm lint:workflows`）

### ルール

ワークフローファイルを変更・追加した際は、**必ずコミット前にローカルで以下を実行し、エラー 0 件であることを確認する**：

```bash
pnpm lint:workflows
```

これにより、YAML 構文エラー、`${{ }}` 式の型エラー、未定義 context、Node ランタイム非推奨、および埋め込みシェルスクリプトの shellcheck 指摘をプッシュ前に 100% 確実にローカルで検知・解消できる。
Docker Desktop が未起動の場合は起動してから実行すること。

---

## 6. `actions/checkout` の shallow clone（`fetch-depth: 1`）による `git diff` 失敗

### 事象

CI ワークフローで `pnpm check:doc-sync -- --base "origin/$GITHUB_BASE_REF"` を実行する際、`actions/checkout` のデフォルト設定（`fetch-depth: 1`）では最新の 1 コミットしか取得されないため、`origin/main...HEAD` や `HEAD~1` の比較対象コミットが存在せず、`git diffSummary` が `fatal: ambiguous argument` で失敗する。

### 対策

PR やブランチ差分を検査するワークフローでは、必ず `fetch-depth: 0` を指定して全履歴をチェックアウトする：

```yaml
- name: Checkout code
  uses: actions/checkout@v5
  with:
    fetch-depth: 0
```

また、シェルスクリプト内で `${{ github.base_ref }}` を扱う際は、シェルインジェクションや SC2086 を防止するため、必ず `env:` を経由して `"$GITHUB_BASE_REF"` として安全に参照すること。

---

## 7. CI ステップ実行コマンドとルート package.json スクリプトの一元管理（Single Source of Truth）

### 事象

CI ワークフローファイル（`.github/workflows/ci.yml` 等）内で `pnpm exec convex deploy --dry-run` などの生のコマンドを直接記述していると、ルート `package.json` で定義された管理スクリプトとの間でオプション変更や環境変数対応の乖離が生じるリスクがある。

### 対策

CI 内で実行するコマンド群は、可能な限りルート `package.json` の scripts（例: `convex:deploy:dry-run`）として一元定義し、CI 側からは `pnpm run <script-name>` を呼び出すことで、ローカル開発と CI の挙動の一貫性（Single Source of Truth）を保つ。

---

## 8. モノレポ分離・スクリプト移管時の CI ワークフロー追従漏れ（ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT）

### 事象

モノレポ化やパッケージ分離に伴い、スクリプトの責務を別パッケージへ移管（例: 旧 setup-e2e-preview.ts を `packages/backend/scripts/setup-preview.ts` へ移動し、`apps/web/package.json` から旧スクリプトを削除）した際、GitHub Actions ワークフロー（`.github/workflows/deploy-staging.yml` 等）内に `pnpm --filter @poohma/web run setup:e2e-preview` の直接呼び出しが残存していると、CI 実行時に `[ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT] None of the selected packages has a "..." script` でジョブが即死する。

### 対策

1. **ワークフロー定義の横断検索義務**: パッケージ間でスクリプトの移管・削除を行った際は、ルートやアプリケーションの `package.json` だけでなく、必ず `.github/workflows/*.yml` も対象に旧スクリプト名の参照がないかを grep 検索して追従すること。
2. **移管先パッケージへの即時切り替え**: 旧パッケージに不要な後方互換ダミースクリプトを残さず（KISS原則）、CI ワークフロー側の呼び出し先を新パッケージ（例: `pnpm --filter @poohma/backend run preview:setup`）へ直ちに更新する。

---

## 9. 環境間デプロイキーの共有・フォールバック混同による環境上書き事故

### 事象

本番ワークフロー（`deploy-production.yml`）とステージングワークフロー（`deploy-staging.yml`）で、同一の `secrets.CONVEX_DEPLOY_KEY` を参照していた場合：
1. Secret が開発用インスタンスを向いていると、本番デプロイ時にも開発環境へ反映されてしまい本番が更新されない。
2. 逆に Secret を本番用キーに更新すると、ステージングのワークフローが本番インスタンスを直接上書きしてしまう。
3. さらに「未設定なら開発用や本番用をフォールバックする」コードを入れると、シークレットの設定漏れ時に本番への誤爆がサイレントに発生する。

### 対策

- **フォールバックの完全排除（Single Source of Truth & KISS原則）**:
  - 本番用（`CONVEX_DEPLOY_KEY`）とステージング用（`CONVEX_STAGING_DEPLOY_KEY`）のシークレット名を厳格に分離する。
  - ステージング側および CI ワークフロー（`ci.yml` の `convex-dry-run`）ではフォールバックコード（`|| secrets.CONVEX_DEPLOY_KEY` 等）を一切置かず、ジョブレベル（`env:`）およびステップレベルの双方で確実に `CONVEX_STAGING_DEPLOY_KEY` をバインドし、キー未設定時は直ちに fail-fast させて他環境への誤爆を遮断する。また、PR 時の CI に本番用キーを渡さないことで権限最小化（Least Privilege）を保つ。

---

## 10. ジョブ間での環境変数（Convex Preview URL等）の output/input 伝播不足による E2E 後処理のサイレント失敗

### 事象

マルチジョブ構成のワークフローで、前段のプロビジョニングジョブ（`deploy-e2e`）が動的に Preview 環境（`VITE_CONVEX_URL`）を作成してローカル `.env` に書き出しているにもかかわらず、その URL をジョブの `outputs` として定義していなかった。
後続のテスト実行ジョブ（`e2e` / `workflow_call`）は別ランナー・別コンテナで動作するため前段のローカルファイルを参照できず、`VITE_CONVEX_URL` が未定義となり `auth.teardown.ts` が例外で失敗。
さらに Teardown 側が `catch (error) {}` で例外を握りつぶしていたため、CI 上はグリーン（成功）に見えながらテストデータが残存し続けるゾンビデータ問題が発生した。

### 対策

1. **ジョブ間での明示的 outputs / inputs 伝播**:
   前段ジョブで動的生成された環境情報（URL等）は、必ずステップの `$GITHUB_OUTPUT` およびジョブの `outputs` を経由して後続ジョブの `inputs` / `env` へ渡す。
2. **Teardown 例外の握りつぶし禁止**:
   テスト後処理のエラーは握りつぶさず明示的にテスト失敗として表面化させ、環境変数の受け渡し不備やパージ失敗を CI で即時検知可能にする。

---

## 11. CI 支援スクリプト内での child_process 文字列結合による OS コマンドインジェクション（CWE-78）

### 事象

`setup-preview.ts` 等の Node.js スクリプト内で、`execSync(`pnpm exec convex env set --from-file ${JSON.stringify(filePath)}`)` のように文字列結合でコマンドを組み立てて実行していた。
`JSON.stringify()` は単にダブルクォートで文字列を囲むだけであり、POSIX シェルでは `$()` やバッククォートによるコマンド置換がシェル展開されてしまうため、CodeQL 等の静的解析で `Shell command built from environment values`（CWE-78: OS Command Injection）として重大警告を受ける。

### 対策

シェル（`cmd.exe` や `/bin/sh`）を一切経由しない `execFileSync` パターンを採用する：
```ts
import { execFileSync } from "node:child_process";

const pnpmExecPath = process.env.npm_execpath;
if (!pnpmExecPath) throw new Error("npm_execpath is missing");

execFileSync(
  process.execPath,
  [
    pnpmExecPath,
    "exec",
    "convex",
    "env",
    "set",
    "--force",
    "--from-file",
    filePath,
    "--deployment",
    deploymentName,
  ],
  {
    cwd: backendDir,
    env: { ...process.env, CONVEX_DEPLOY_KEY: previewKey },
    stdio: "inherit",
  },
);
```
`process.execPath`（Node.js バイナリ）から `pnpmExecPath` を引数配列として直接起動することで、シェル展開の介在余地を根本から排除する。

---

## 12. 配布用成果物（Release）ビルドワークフローへの CI/テスト用ダミー環境変数の流用

### 事象

Chrome 拡張機能などの配布用 ZIP パッケージを生成・GitHub Releases に添付するリリースワークフロー（`release-extension.yml` 等）において、CI のユニットテスト用設定を流用し、`VITE_FIREBASE_API_KEY: "dummy_key"` やステージング用 URL などの仮値をハードコードしてビルドしてしまう。
この成果物がそのまま Release に添付・配布されると、ユーザーがインストールした拡張機能で Firebase 認証（ログイン）が必ず失敗し、実運用不能な ZIP が公開されてしまう。

### 対策

1. **CI ジョブとリリース（配布物生成）ジョブの明確な分離**:
   - 単なる構文・型・テスト検査（`ci.yml`）ではダミー値で十分だが、配布用パッケージを生成するワークフローでは実環境用の環境変数を注入する。
2. **GitHub Secrets / Variables からの本番環境変数注入**:
   - `VITE_FIREBASE_API_KEY`、`VITE_FIREBASE_PROJECT_ID`、`VITE_CONVEX_URL` 等はハードコードせず、GitHub Secrets または Variables（`${{ secrets.VITE_FIREBASE_API_KEY }}`）から安全に注入してビルドする。

---

## 13. Monorepo 内パッケージの `postinstall` による環境変数バリデーションと CI での `pnpm install` 失敗

### 事象

Monorepo 配下に新しいパッケージ（例: Chrome 拡張機能 `apps/extension`）を追加した際、`package.json` に `"postinstall": "wxt prepare"` などの型生成・初期化スクリプトが定義されていると、リポジトリルートで `pnpm install` を実行した際に自動的にこの `postinstall` がトリガーされる。
このツール（WXT 等）がエントリーポイントを静的走査して `@t3-oss/env-core` などの環境変数スキーマを評価する場合、**必須の環境変数が未定義（または URL 形式でない）だとバリデーションエラー（ZodError）でプロセスが exit 1 で異常終了し、`pnpm install` 自体が失敗する**。
その結果、対象パッケージとは直接関係のない CI/CD ジョブ（例: `convex-dry-run`、`deploy-staging.yml`、`deploy-production.yml`）であっても、`pnpm install` ステップでジョブ全体がクラッシュしてしまう。

### 対策

1. **CI ワークフローの依存解決ステップへの環境変数の局所供給（Scoped Env 原則）**:
   - `pnpm install` を実行するステップ（`Install dependencies` 等）において、ステップレベルの `env:` で必要な環境変数を明示的に供給する（※ジョブ全体への安易な配置は後続の `vercel build` 等の設定値を上書きするリスクがあるため、第14節の局所スコープ配置原則を遵守する）。
   - テスト・ドライラン・Convex デプロイなど、実際のフロントエンド成果物をビルドしないジョブでは、安全なダミー値（`VITE_FIREBASE_API_KEY: "dummy_key"`, `VITE_CONVEX_URL: "https://dummy.convex.cloud"` 等）を定義してバリデーションを通過させる。
   - ステージングデプロイ等の実ビルドを伴うジョブでは、適切な Preview 用 Secrets を注入して整合性を保つ。
2. **新パッケージ導入時の Monorepo 影響範囲チェック**:
   - `postinstall` で実行されるコマンドが外部環境変数に依存していないかを事前に点検し、Monorepo 全体の CI/CD パイプラインへの波及影響を意識する。

---

## 14. ジョブレベル `env:` での環境変数スコープ過剰によるビルド設定上書き事故

### 事象

`deploy-staging.yml` や `deploy-e2e` において、Monorepo 内パッケージの `postinstall` バリデーション対策としてジョブ全体（`env:`）に `VITE_CONVEX_URL: ${{ secrets.CONVEX_PREVIEW_URL }}` を配置してしまうと、後続の `vercel build` や動的 Preview 設定注入ステップ（`.vercel/.env.preview.local`）に対して OS プロセス環境変数が優先してしまい、Staging ビルドが Preview URL で固められたり、動的 Preview URL が固定値で上書きされてしまう。

### 対策

- **環境変数の局所スコープ配置（Scoped Env 原則）**:
  `postinstall` 対策の環境変数はジョブ全体ではなく、必要なステップ（`Install dependencies` 等）に局所配置する。後続のビルドステップに意図しない環境変数が漏洩・上書きすることを構造的に遮断する。
  - 例: `deploy-production.yml` において、Convex デプロイキーは `Deploy Convex Backend` ステップのみにバインドし、`postinstall` 用のダミー環境変数（`VITE_FIREBASE_API_KEY` 等）は `Install dependencies` ステップのみに閉じることで、デプロイ実行プロセスへのダミー値混入を完全に防止する。

---

## 15. リリースワークフローでの GITHUB_TOKEN 漏洩防止（`persist-credentials: false`）と成果物保存

### 事象

`release-extension.yml` 等で `contents: write` 権限を付与する場合、`actions/checkout` に `persist-credentials: false` を明示しないと、ローカル `.git/config` に書き込み権限付きトークンが残存し、npm スクリプト等から窃取されるリスク（CWE-200）がある。また、タグプッシュ時に GitHub Release が未作成だと `gh release upload` が失敗し、手動実行時（`workflow_dispatch`）には成果物がどこにも保存されない問題が生じる。

### 対策

1. **`persist-credentials: false` の徹底**:
   `actions/checkout` には必ず `persist-credentials: false` を指定し、トークンのローカルディスク残存を防止する。
2. **リリース自動作成フォールバック**:
   タグリリース時は `if ! gh release view "${TAG_NAME}" >/dev/null 2>&1; then gh release create ...; else gh release upload ...; fi` で安全にフォールバックする。
3. **成果物の一時保存（Artifact Upload）**:
   手動実行時でも ZIP をダウンロードして動作検証できるよう、`actions/upload-artifact@v7` で成果物を Actions Artifact として保存する。
4. **PR テストビルド時の動的アーティファクト名分岐と Step Summary 案内**:
   - `pull_request` トリガー時、`github.ref_name`（`372/merge` 等）をそのままアーティファクト名に使うとスラッシュが含まれ不正な名前になる恐れがあるため、`poohma-extension-pr<PR番号>` と命名する。
   - `github.event_name == 'pull_request'` の際は GitHub Release へのアップロードを確実にスキップし、Step Summary（`$GITHUB_STEP_SUMMARY`）にダウンロード・インストール手順を出力して PR レビュー時の実機検証を支援する。
5. **actions/upload-artifact での二重 zip 化防止と隠しディレクトリ（`.output`等）除外事故**:
   - `actions/upload-artifact` はダウンロード時に自動で全体を zip 圧縮するため、`path: apps/extension/.output/*.zip` のように zip ファイルを指定すると「zip の中に zip」という 2 重 zip 構造になり、ユーザーが 2 回解凍を強いられる。
   - そのため Artifacts にはビルド展開ディレクトリ（`apps/extension/.output/chrome-mv3`）を指定し、ダウンロードされた zip を 1 度解凍するだけで直接 Chrome に読み込める単一 zip 構造とする。
   - また `actions/upload-artifact` は既定で `include-hidden-files: false` で動作するため、`.output` のようなドットから始まる隠しディレクトリを探索パスに含める際は、配下のファイルが全て除外され `No files were found with the provided path` でジョブが異常終了するのを防ぐため、必ず `include-hidden-files: true` を明示する（KISS原則・Single Source of Truth）。
6. **インラインスクリプト内への GitHub 式直接埋め込み禁止（Template Injection 対策）**:
   - `run:` スクリプトブロック内に `${{ github.event_name }}` や `${{ github.sha }}`、`${{ github.event.pull_request.number }}` などの GitHub 式を直接展開すると、シェルエスケープの破壊や zizmor / CodeQL による script injection 脆弱性（CWE-78）指摘の原因となる。
   - PR Job Summary 生成ステップ（`$GITHUB_STEP_SUMMARY`）等も含め、すべてのコンテキスト値はステップレベルの `env:` でシェル変数（例: `PR_NUMBER: ${{ github.event.pull_request.number }}`）として安全に注入し、スクリプト内では `"$PR_NUMBER"` として参照すること。

---

## 16. Convex `auth.config.ts` での環境変数参照による Preview Deployment クラッシュと CI 切り替えパターン

### 事象

Convex CLI は `convex deploy` や `convex dev` 実行時、`convex/auth.config.ts` 内に記述された `process.env.XXX` を静的解析し、「デプロイ対象の Convex 環境（サーバー側）にその環境変数が設定されているか」を強制検証する。

このため、`auth.config.ts` 内で `process.env.CONVEX_AUTH_PROJECT_ID` などの環境変数を参照させていると、PR ごとにオンデマンドで生成される **Convex Preview Deployment**（`--preview-name=e2e-test`）やローカル開発環境（`convex dev --once`）において、デプロイ初回時にサーバー側環境変数が未設定であるため、以下のエラーで即座にビルド・デプロイがクラッシュする：

```text
Environment variable CONVEX_AUTH_PROJECT_ID is used in auth config file but its value was not set.
```

### 対策

1. **リポジトリ上はステージング用の静的設定に固定**:
   `packages/backend/convex/auth.config.ts` のデフォルトは環境変数を使わず、ステージング環境（`poohma-staging`）の静的リテラルとしてコミットする。これにより、Preview Deployment やローカル開発環境でサーバー側環境変数の事前注入を一切要求せず、即座にデプロイを成立させる。
2. **本番デプロイ時（CI）に専用スクリプトで本番設定に切り替え**:
   本番デプロイパイプライン（`.github/workflows/deploy-production.yml`）でのみ、デプロイ直前に `pnpm --filter @poohma/backend run auth:switch production`（`packages/backend/scripts/switch-auth-config.ts`）を実行し、`auth.config.ts` を本番用（`poohma`）に書き換えてから `convex deploy` を実行する。
3. **単一プロバイダー境界の死守**:
   ステージング用・本番用の配列を併記（マルチプロバイダー化）する安易な逃げ道は厳禁（本番 Convex がステージングの ID トークンを受け入れてしまう脆弱性 CWE-287 / P1 指摘の再発）。静的リテラルの単一プロバイダーを CI でアトミックに切り替える方式により、安全性と Preview デプロイの安定性を両立する。

---

## 17. Playwright E2E テストでの OS 依存インストールによる CI 遅延と Docker コンテナ自動同期

### 事象

GitHub Actions の Ubuntu ランナー上で Playwright E2E テストを実行する際、`playwright install-deps chromium` を実行すると、毎回使い捨ての VM 上で `apt-get update` および多数の deb パッケージのダウンロード・展開が走り、3〜6分以上の待ち時間が発生する。
ブラウザバイナリ（`~/.cache/ms-playwright`）をキャッシュしても、OS 側の共有ライブラリ（`libnss3` 等）はキャッシュされないため、毎回のオーバーヘッドが解消されない。

### 対策

1. **Playwright 公式 Docker コンテナ（`mcr.microsoft.com/playwright`）の採用**:
   ブラウザバイナリと必要な Linux 依存関係が最初から組み込まれた公式コンテナ上でジョブを実行することで、`install` および `install-deps` を完全に不要化（0秒化）する。
2. **`package.json` からのバージョン自動抽出（Single Source of Truth）**:
   YAML へのコンテナタグ直書きはパッケージ更新時の追従漏れ（バージョン不一致エラー）を招くため、先行の軽量ジョブ（`sparse-checkout` で `apps/web/package.json` のみ取得）で `@playwright/test` のバージョンを抽出し、後続の E2E ジョブの `container.image` に動的注入する。
3. **共有メモリ枯渇防止（`--ipc=host`）**:
   Docker コンテナ内で Chromium を動作させる際、デフォルトの共有メモリ（`/dev/shm` 64MB）ではクラッシュ（SIGSEGV）の原因となるため、コンテナオプションに `options: --ipc=host` を指定する。

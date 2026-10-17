# PoohMa Chrome 拡張機能

家族向けアカウント・パスワードヒント管理アプリ「PoohMa」の公式 Chrome 拡張機能（Manifest V3）です。
閲覧中の Web サイトに応じて、家族で共有しているログインIDや E2EE 暗号化されたパスワードヒントを参照・コピー・自動入力支援します。

---

## 主な機能

- **ドメイン自動検知 & 候補表示**: 閲覧中サイトのドメイン（Public Suffix List 準拠）に合致するアカウント情報を瞬時に抽出。
- **E2EE 暗号パスワードヒントの安全な復号**: 家族のマスターパスコードをメモリ上（`extractable: false`）に展開し、暗号化ヒントを復号表示。
- **ログインID ワンクリック自動入力**: ページ上のログインID入力欄（`input[type="email"]`, `input[type="text"]` 等）にワンクリックで反映。
- **非干渉型フォーム検知**: パスワード入力欄へのフォーカス時に邪魔にならないフローティングバッジを表示。※ 平文パスワードの読み取りや送信は一切行いません。
- **オートロック**: 15分間の非アクティブ時、またはブラウザ終了時にマスターキーをメモリから自動消去。
- **ゼロ・シークレット設計（Zero-Secrets Client）**: 配布物内にサーバーシークレットを一切含みません。

---

## インストール手順（利用者向け）

Chrome Web Store の審査を経ず、GitHub Releases から直接インストールできます。

1. **zip ファイルのダウンロード**:
   - [PoohMa Releases](https://github.com/luthpg/poohma/releases) から最新の `poohma-extension-vX.X.X-chrome.zip` をダウンロードします。
2. **zip の解凍**:
   - ダウンロードした zip ファイルを任意の安全なフォルダに解凍します。
3. **Chrome に読み込む**:
   - Google Chrome を開き、アドレスバーに `chrome://extensions` と入力してアクセスします。
   - 右上の「**デベロッパー モード**」トグルを **ON** にします。
   - 左上に表示される「**パッケージ化されていない拡張機能を読み込む**」ボタンをクリックします。
   - 先ほど解凍したフォルダ（`manifest.json` が入っているフォルダ）を選択します。
4. **準備完了**:
   - ツールバーの拡張機能アイコン（パズルピース）から「PoohMa」をピン留めしてお使いください。

---

## 開発・ビルドコマンド

モノレポルートから実行します。

```bash
# 開発サーバー起動（HMR 付き Chrome 自動起動）
pnpm -F @poohma/extension dev

# プロダクションビルド
pnpm -F @poohma/extension build

# 配布用 zip ファイルの生成
pnpm -F @poohma/extension zip

# バンドル成果物の秘密情報混入検査
pnpm -F @poohma/extension verify:bundle

# 型チェック
pnpm -F @poohma/extension typecheck

# Lint & フォーマットチェック
pnpm -F @poohma/extension check
```

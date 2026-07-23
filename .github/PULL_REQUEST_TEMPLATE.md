## 📋 概要

このPRは Issue #99 を解決します。

iOS（Safari）環境において、PWAをホーム画面に追加後、初回起動時にAPIからのデータフェッチが失敗する問題を修正しました。

## 🔍 変更内容

### 新規作成ファイル

#### `src/utils/pwa.ts`
- iOS PWAの検知関数 `isIosPwa()`
- PWA初回起動フラグの管理関数 `checkAndMarkPwaFirstLaunch()`

#### `src/services/authService.ts`
- トークン自動同期関数 `getValidToken()`
  - iOS PWA初回起動時のみ `forceRefresh: true` でトークンを強制リフレッシュ
  - 2回目以降の起動やブラウザ環境では `forceRefresh: false` でキャッシュを活用

### 修正ファイル

#### `src/hooks/useConvexFirebaseAuth.ts`
- `getValidToken()` を統合し、iOS PWA環境での最適なトークン取得を実現

## 💡 実装のポイント

1. **環境判定:** `window.navigator.standalone` と `display-mode: standalone` で iOS PWA検知
2. **初回起動検出:** `localStorage` に初期化フラグを保存し、初回起動をピンポイント検知
3. **キャッシュ活用:** 不必要な `forceRefresh` を避け、PC・スマホブラウザの既存キャッシュを100%維持
4. **SSR対応:** `typeof window !== 'undefined'` でサーバーサイド実行をガード

## ✅ テスト方法

### iOS Safari環境での確認
1. Safari で本アプリにログイン
2. 共有メニュー → ホーム画面に追加でPWA化
3. ホーム画面から初めてアプリを起動
4. コンソールで `⚠️ iOS PWA初回起動を検知。...` が出力されることを確認
5. データが正常に表示されることを確認

### その他の環境での確認
- PC ブラウザ: 既存動作に変更なし
- Android PWA: `isIosPwa()` が false のため既存ロジック使用
- 2回目以降の iOS PWA 起動: フラグが立っているため `forceRefresh` されない

## 📦 関連 Issue

- Fixes #99

## 🎯 期待される効果

- ✅ ユーザーは iOS PWA インストール直後でも、ログアウトやタスクキルなしでシームレスにデータ閲覧可能
- ✅ PC・スマホブラウザのキャッシュメリットを100%維持
- ✅ 不要な API リクエストを削減

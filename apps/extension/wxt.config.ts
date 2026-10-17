import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "PoohMa - 家族向けアカウント・パスワードヒント管理",
    description:
      "家族アカウントのパスワードヒントを安全に参照・登録・自動入力支援する拡張機能",
    version: "0.1.0",
    permissions: [
      "storage",
      "activeTab",
      "tabs",
      "sidePanel",
      "offscreen",
      "identity",
      "scripting",
    ],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "PoohMa を開く",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
  dev: {
    server: {
      port: 3010,
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});

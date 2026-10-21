import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import rootPackageJson from "../../package.json" with { type: "json" };

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    version: rootPackageJson.version,
    name: "PoohMa - 家族向けアカウント・パスワードヒント管理",
    description:
      "家族アカウントのパスワードヒントを安全に参照・登録・自動入力支援する拡張機能",
    permissions: ["storage", "activeTab", "tabs", "sidePanel", "offscreen"],
    host_permissions: ["<all_urls>"],
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "96": "icon/96.png",
      "128": "icon/128.png",
    },
    action: {
      default_title: "PoohMa を開く",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
      },
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
  },
  zip: {
    artifactTemplate:
      "poohma-extension-{{version}}-{{browser}}{{modeSuffix}}.zip",
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

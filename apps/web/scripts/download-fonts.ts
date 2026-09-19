import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, "../public/fonts");
const FONT_DEST = path.resolve(FONTS_DIR, "NotoSansJP-Regular.ttf");

// Google Fonts 公式リポジトリの Noto Sans JP フォント URL
const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf";

async function downloadFont() {
  console.log("Noto Sans JP フォントのダウンロードを開始します...");
  console.log(`取得元 URL: ${FONT_URL}`);

  if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
  }

  const response = await fetch(FONT_URL);
  if (!response.ok) {
    throw new Error(
      `フォントのダウンロードに失敗しました: ${response.status} ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  fs.writeFileSync(FONT_DEST, buffer);
  console.log(
    `✅ フォントの配置が完了しました: ${FONT_DEST} (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`,
  );
}

downloadFont().catch((err) => {
  console.error("❌ エラーが発生しました:", err);
  process.exit(1);
});

"use node";

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import * as cheerio from "cheerio";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { validateUrlSafety } from "../src/utils/url-safety";

async function fetchSafeBuffer(urlString: string, maxRedirects = 5): Promise<Buffer> {
  let currentUrl = urlString;
  for (let i = 0; i < maxRedirects; i++) {
    const parsed = new URL(currentUrl);
    // 1. 安全性の検証とIPアドレス解決
    const ip = await validateUrlSafety(currentUrl);

    // 2. リクエストの構築
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const result = await new Promise<{ type: "data"; data: Buffer } | { type: "redirect"; url: string }>((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: ip, // 直接IPへ接続
        port: parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": "PoohMa-OGP-Bot/1.0",
          Accept: "text/html,application/xhtml+xml",
          Host: parsed.hostname, // Hostヘッダーには元のドメインを指定
        },
        timeout: 5000,
      };

      if (isHttps) {
        options.servername = parsed.hostname; // SNI 送信用
      }

      const req = lib.request(options, (res) => {
        // リダイレクト判定
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const nextUrl = new URL(res.headers.location, currentUrl).toString();
          resolve({ type: "redirect", url: nextUrl });
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP error status ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ type: "data", data: Buffer.concat(chunks) });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.end();
    });

    if (result.type === "redirect") {
      currentUrl = result.url;
      continue;
    }

    return result.data;
  }
  throw new Error("Too many redirects");
}

export const getOgpInfo = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to getOgpInfo");
    }

    try {
      // 1. 安全に HTML データを Buffer としてフェッチ（DNS Rebinding 対策）
      const buffer = await fetchSafeBuffer(args.url);

      // 2. 文字エンコーディングの検出とデコード（一時的に utf-8 でパースして charset メタタグを探す）
      let html = buffer.toString("utf-8");
      const metaCharsetMatch =
        html.match(/<meta[^>]*charset=["']?([\w-]+)/i) ||
        html.match(/<meta[^>]*http-equiv=["']?content-type["']?[^>]*content=["']?[^"']*charset=([\w-]+)/i);

      if (metaCharsetMatch) {
        const detectedCharset = metaCharsetMatch[1].toLowerCase();
        if (detectedCharset !== "utf-8" && detectedCharset !== "utf8") {
          try {
            html = new TextDecoder(detectedCharset).decode(new Uint8Array(buffer));
          } catch (e) {
            console.warn(`Failed to decode with charset: ${detectedCharset}`, e);
          }
        }
      }

      // 3. cheerio による OGP 情報抽出（ReDoS 対策）
      const $ = cheerio.load(html);

      const title = (
        $('meta[property="og:title"]').attr("content") ||
        $('meta[name="og:title"]').attr("content") ||
        $("title").text() ||
        ""
      ).trim();

      let image = (
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="og:image"]').attr("content") ||
        ""
      ).trim();

      const description = (
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content") ||
        ""
      ).trim();

      // 4. OGP 画像の相対パスを解決
      if (image && !image.startsWith("http://") && !image.startsWith("https://")) {
        try {
          image = new URL(image, args.url).toString();
        } catch (e) {
          console.warn("Failed to resolve absolute image URL", e);
        }
      }

      return {
        title,
        image,
        description,
      };
    } catch (error) {
      console.error("OGP fetch failed:", error);
      return { title: "", image: "", description: "" };
    }
  },
});

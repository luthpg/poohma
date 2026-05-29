import { v } from "convex/values";
import { action } from "./_generated/server";

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export const getOgpInfo = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to getOgpInfo");
    }

    try {
      // Basic URL validation
      const parsedUrl = new URL(args.url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("Invalid URL protocol");
      }
      if (
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname === "127.0.0.1" ||
        parsedUrl.hostname === "::1" ||
        parsedUrl.hostname.startsWith("10.") ||
        parsedUrl.hostname.startsWith("192.168.") ||
        parsedUrl.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
      ) {
        throw new Error("Access to local network is forbidden");
      }

      const response = await fetch(args.url, {
        headers: {
          "User-Agent": "PoohMa-OGP-Bot/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return { title: "", image: "", description: "" };
      }

      // arrayBuffer を取得し、charset に基づいてデコード
      const arrayBuffer = await response.arrayBuffer();
      let html = new TextDecoder("utf-8").decode(arrayBuffer);

      // meta タグから charset を検出

      const metaCharsetMatch =
        html.match(/<meta[^>]*charset=["']?([\w-]+)/i) ||
        html.match(/<meta[^>]*http-equiv=["']?content-type["']?[^>]*content=["']?[^"']*charset=([\w-]+)/i);

      if (metaCharsetMatch) {
        const detectedCharset = metaCharsetMatch[1].toLowerCase();
        if (detectedCharset !== "utf-8" && detectedCharset !== "utf8") {
          try {
            html = new TextDecoder(detectedCharset).decode(arrayBuffer);
          } catch (e) {
            console.warn(`Failed to decode with charset: ${detectedCharset}`, e);
          }
        }
      }

      // 正規表現で OGP / meta 情報抽出 (属性順序の違いも考慮)
      const titleMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:title["']/i
        ) ||
        html.match(/<title>([^<]+)<\/title>/i);

      const imageMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:image["']/i
        );

      const descriptionMatch =
        html.match(
          /<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta\s+content=["']([^"']+)["']\s+(?:property|name)=["']og:description["']/i
        ) ||
        html.match(
          /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
        ) ||
        html.match(
          /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i
        );

      let title = titleMatch ? titleMatch[1].trim() : "";
      let image = imageMatch ? imageMatch[1].trim() : "";
      let description = descriptionMatch ? descriptionMatch[1].trim() : "";

      // HTMLエンティティのデコード
      title = decodeHtmlEntities(title);
      image = decodeHtmlEntities(image);
      description = decodeHtmlEntities(description);

      // OGP画像の相対パスを解決
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

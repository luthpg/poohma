import * as linkifyItModule from "linkify-it";
import type React from "react";

export interface AutolinkTextProps {
  text?: string | null;
  className?: string;
  linkClassName?: string;
}

// CJS / ESM / Vite / Vitest 環境差異を安全に吸収するインスタンス化
// biome-ignore lint/suspicious/noExplicitAny: library CJS/ESM interop
const mod = linkifyItModule as any;
const LinkifyItConstructor =
  mod.LinkifyIt || mod.default?.LinkifyIt || mod.default || mod;

const linkify = new LinkifyItConstructor({
  fuzzyLink: false,
  fuzzyIP: false,
  fuzzyEmail: false,
});

// URL 末尾に含まれるべきではない全角記号・約物・括弧・句読点・空白
const TRAILING_PUNCTUATION_REGEX =
  /[。、！？・…「」『』（）［］【】〔〕〈〉《》\u3000\s]+$/;

/**
 * linkify-it が検出した URL に対して、末尾の全角約物・句読点・全角括弧をトリミングし、
 * クリーンな URL と切り離されたテキスト（suffix）を返す。
 * （パスやクエリパラメータ内の日本語は実用性を優先してそのまま保持）
 */
function cleanJapaneseUrl(raw: string): { url: string; suffix: string } {
  let url = raw;
  let suffix = "";

  const punctMatch = url.match(TRAILING_PUNCTUATION_REGEX);
  if (punctMatch) {
    const len = punctMatch[0].length;
    suffix = url.slice(-len);
    url = url.slice(0, -len);
  }

  return { url, suffix };
}

/**
 * URL が http: または https: で始まる安全なものか検証（CWE-79 XSS 防止）
 */
function isSafeHttpUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

interface ExtractedLink {
  index: number;
  lastIndex: number;
  url: string;
  suffix: string;
}

/**
 * 日本語テキスト混在環境において、linkify-it の高度なカッコバランス解析と
 * 実用的な日本語境界制御（前方直結対応・末尾句読点除外・日本語パス/クエリ許容）を組み合わせた安全なリンク検出。
 */
function findLinks(text: string): ExtractedLink[] {
  const results: ExtractedLink[] = [];
  const schemaRegex = /https?:\/\//gi;
  let schemaMatch: RegExpExecArray | null = schemaRegex.exec(text);

  while (schemaMatch !== null) {
    const startIndex = schemaMatch.index;
    const subText = text.slice(startIndex);

    // subText の先頭から始まる URL を linkify-it で検出
    const matches = linkify.match(subText);
    if (matches && matches.length > 0) {
      const firstMatch = matches[0];
      if (firstMatch && firstMatch.index === 0) {
        const { url, suffix } = cleanJapaneseUrl(firstMatch.raw);
        if (/^https?:\/\//i.test(url) && isSafeHttpUrl(url)) {
          const matchEnd = startIndex + firstMatch.raw.length;
          results.push({
            index: startIndex,
            lastIndex: matchEnd,
            url,
            suffix,
          });
          schemaRegex.lastIndex = matchEnd;
        }
      }
    }
    schemaMatch = schemaRegex.exec(text);
  }

  return results;
}

/**
 * テキスト内の URL を自動検出し、安全な外部リンクとして描画するコンポーネント。
 */
export function AutolinkText({
  text,
  className,
  linkClassName = "text-orange-600 dark:text-orange-400 underline underline-offset-2 hover:opacity-80 break-all transition-opacity",
}: AutolinkTextProps) {
  if (!text) return null;

  const links = findLinks(text);
  if (links.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const item of links) {
    // 前方のプレーンテキスト
    if (item.index > lastIndex) {
      elements.push(text.slice(lastIndex, item.index));
    }

    // リンク
    elements.push(
      <a
        key={`link-${item.index}`}
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={linkClassName}
      >
        {item.url}
      </a>,
    );

    // 日本語トリミングサフィックス（全角句読点や全角括弧など）
    if (item.suffix) {
      elements.push(item.suffix);
    }

    lastIndex = item.lastIndex;
  }

  // 残りの末尾プレーンテキスト
  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return <span className={className}>{elements}</span>;
}

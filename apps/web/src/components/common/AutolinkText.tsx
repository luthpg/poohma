export interface AutolinkTextProps {
  text?: string | null;
  className?: string;
  linkClassName?: string;
}

/**
 * URL の正規表現: http:// または https:// で始まる文字列
 * 末尾の日本語句読点（。、）や括弧（「」、（）、()）を URL に巻き込まないよう配慮
 */
const URL_REGEX =
  /(https?:\/\/[^\s\u3000\u3001\u3002\uff08\uff09()「」『』]+)/g;

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

/**
 * テキスト内の URL を自動検出し、安全な外部リンクとして描画するコンポーネント。
 */
export function AutolinkText({
  text,
  className,
  linkClassName = "text-orange-600 dark:text-orange-400 underline underline-offset-2 hover:opacity-80 break-all transition-opacity",
}: AutolinkTextProps) {
  if (!text) return null;

  // URL を境界としてテキストを分割
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (
          (part.startsWith("http://") || part.startsWith("https://")) &&
          isSafeHttpUrl(part)
        ) {
          return (
            <a
              // biome-ignore lint/suspicious/noArrayIndexKey: parts array from static string split has no stable unique ID
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={linkClassName}
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </span>
  );
}

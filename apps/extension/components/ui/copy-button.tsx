import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label: string;
  className?: string;
  onCopied?: () => void;
}

export function CopyButton({
  text,
  label,
  className = "",
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 内部エラーは握る
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      aria-label={copied ? `${label}をコピーしました` : `${label}をコピー`}
      className={`inline-flex items-center justify-center gap-1 min-h-[32px] px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0 ${className}`}
    >
      {copied ? (
        <>
          <Check
            aria-hidden="true"
            className="h-3 w-3 text-emerald-500 shrink-0"
          />
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
            コピー済
          </span>
        </>
      ) : (
        <>
          <Copy aria-hidden="true" className="h-3 w-3 shrink-0" />
          <span>コピー</span>
        </>
      )}
    </button>
  );
}

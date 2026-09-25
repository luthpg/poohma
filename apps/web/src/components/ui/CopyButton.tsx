import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label}をコピーしました`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      aria-label={copied ? `${label}をコピーしました` : `${label}をコピー`}
      className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] -my-2 px-2 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/80 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {copied ? (
        <>
          <Check
            aria-hidden="true"
            className="h-3.5 w-3.5 text-green-500 shrink-0"
          />
          <span className="text-green-600 dark:text-green-400 font-medium">
            コピー済
          </span>
        </>
      ) : (
        <>
          <Copy aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span>コピー</span>
        </>
      )}
    </button>
  );
}

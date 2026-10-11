import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CopyableBadgeProps {
  value: string;
  label?: string;
  truncateLength?: number;
  className?: string;
}

export function CopyableBadge({
  value,
  label,
  truncateLength = 12,
  className = "",
}: CopyableBadgeProps) {
  const [copied, setCopied] = useState(false);

  const displayValue =
    label ??
    (value.length > truncateLength
      ? `${value.slice(0, truncateLength)}...`
      : value);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("クリップボードにコピーしました");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("コピーに失敗しました");
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`コピー: ${value}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-white hover:border-zinc-700 hover:bg-zinc-800/80 active:scale-95 transition-all cursor-pointer ${className}`}
    >
      <span>{displayValue}</span>
      {copied ? (
        <Check className="w-3 h-3 text-emerald-400" />
      ) : (
        <Copy className="w-3 h-3 text-zinc-500 opacity-60 group-hover:opacity-100" />
      )}
    </button>
  );
}

import type { Doc } from "@poohma/backend/dataModel";

interface StatusBadgeProps {
  status: Doc<"contacts">["status"] | (string & {});
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  let badgeStyle = "bg-zinc-800 text-zinc-300 border-zinc-700";
  let dotStyle = "bg-zinc-400";
  let label = status;

  if (status === "UNREAD") {
    badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/30";
    dotStyle = "bg-amber-400 animate-pulse";
    label = "未対応";
  } else if (status === "READ") {
    badgeStyle = "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
    dotStyle = "bg-cyan-400";
    label = "対応中";
  } else if (status === "RESOLVED") {
    badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    dotStyle = "bg-emerald-400";
    label = "完了";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium tracking-tight ${badgeStyle} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotStyle}`} />
      <span>{label}</span>
    </span>
  );
}

interface LivePulseProps {
  status?: "online" | "connecting" | "offline";
  label?: string;
  showText?: boolean;
}

export function LivePulse({
  status = "online",
  label,
  showText = true,
}: LivePulseProps) {
  const isOnline = status === "online";
  const isConnecting = status === "connecting";

  const colorClass = isOnline
    ? "bg-emerald-500"
    : isConnecting
      ? "bg-amber-500"
      : "bg-zinc-500";

  const pingClass = isOnline
    ? "bg-emerald-400"
    : isConnecting
      ? "bg-amber-400"
      : "bg-zinc-400";

  const defaultText = isOnline
    ? "Live Sync"
    : isConnecting
      ? "Connecting..."
      : "Offline";

  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs font-mono">
      <span className="relative flex h-2 w-2">
        {isOnline && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${pingClass}`}
          />
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${colorClass}`}
        />
      </span>
      {showText && (
        <span className="text-zinc-400 tracking-tight">
          {label ?? defaultText}
        </span>
      )}
    </div>
  );
}

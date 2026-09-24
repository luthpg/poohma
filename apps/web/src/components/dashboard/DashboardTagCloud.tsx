import { api } from "@/../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/hooks/useAccount";
import { usePersistentQuery } from "@/hooks/usePersistentQuery";

// タグクラウド用のスケルトン
export function TagCloudSkeleton() {
  return (
    <div className="mt-4 flex overflow-x-auto py-1.5 gap-2.5 no-scrollbar scroll-smooth items-center">
      <Skeleton className="h-[28px] w-16 rounded-full" />
      <Skeleton className="h-[28px] w-20 rounded-full" />
      <Skeleton className="h-[28px] w-14 rounded-full" />
      <Skeleton className="h-[28px] w-18 rounded-full" />
    </div>
  );
}

/**
 * 利用可能なタグを表示し、選択されたタグを通知するタグクラウド。
 */
export function DashboardTagCloud({
  activeTag,
  onTagClick,
}: {
  activeTag: string | undefined;
  onTagClick: (tag: string) => void;
}) {
  const { activeAccountId } = useAccount();
  const availableTags = usePersistentQuery<string[]>(
    api.records.getAvailableTags,
    { accountId: activeAccountId || undefined },
  );

  if (availableTags === undefined) return <TagCloudSkeleton />;
  const validTags = Array.isArray(availableTags)
    ? availableTags.filter((t): t is string => typeof t === "string")
    : [];
  if (validTags.length === 0) return null;

  return (
    <div className="mt-4 flex overflow-x-auto py-1.5 gap-2.5 no-scrollbar scroll-smooth items-center">
      {validTags.map((t: string) => {
        const isActive = activeTag === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onTagClick(t)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200 ${
              isActive
                ? "bg-orange-500 text-white shadow-md scale-105"
                : "bg-card text-muted-foreground border border-border/40 shadow-sm hover:border-orange-500/50 hover:text-orange-500 hover:bg-orange-500/5"
            }`}
          >
            #{t}
          </button>
        );
      })}
    </div>
  );
}

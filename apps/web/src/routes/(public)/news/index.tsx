import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Newspaper } from "lucide-react";
import { cmsQueries } from "@/utils/cms.queries";

export const Route = createFileRoute("/(public)/news/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(cmsQueries.newsList());
  },
  component: NewsListPage,
});

function NewsListPage() {
  const { data: newsData } = useSuspenseQuery(cmsQueries.newsList());
  const items = newsData?.contents ?? [];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Tokyo",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="container mx-auto my-12 max-w-3xl px-4 sm:px-6">
      {/* Geist風ヘッドライン */}
      <div className="mb-10">
        <h1 className="mb-2 text-[32px] sm:text-[40px] font-semibold tracking-[-2px] sm:tracking-[-2.4px] text-foreground">
          お知らせ
        </h1>
        <p className="text-[15px] sm:text-[16px] text-muted-foreground">
          PoohMa の機能アップデートや重要なお知らせをご案内します。
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-12 text-center text-muted-foreground">
          <Newspaper className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-[15px] font-medium">
            現在、お知らせはありません。
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card overflow-hidden shadow-xs">
          {items.map((item) => {
            const dateDisplay = formatDate(
              item.published_at || item.publishedAt,
            );
            return (
              <Link
                key={item.id}
                to="/news/$id"
                params={{ id: item.id }}
                className="group flex items-center justify-between p-5 transition-colors hover:bg-muted/40"
              >
                <div className="space-y-1.5 pr-4">
                  <time
                    dateTime={item.published_at || item.publishedAt}
                    className="text-[12px] font-medium text-muted-foreground"
                  >
                    {dateDisplay}
                  </time>
                  <h2 className="text-[15px] sm:text-[16px] font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                    {item.title}
                  </h2>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Megaphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { NewsContent } from "@/lib/cms.server";
import { cmsQueries } from "@/utils/cms.queries";

const LAST_READ_STORAGE_KEY = "poohma_last_read_news_time";

interface ResponsiveNewsProps {
  variant?: "responsive" | "bell" | "card";
  className?: string;
}

export function ResponsiveNews({
  variant = "responsive",
  className = "",
}: ResponsiveNewsProps) {
  const { data: newsData } = useQuery(cmsQueries.newsList({ limit: 5 }));
  const recentNews = useMemo(
    () => newsData?.contents.slice(0, 3) ?? [],
    [newsData],
  );

  const [lastReadTime, setLastReadTime] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const stored = localStorage.getItem(LAST_READ_STORAGE_KEY);
      return stored ? parseInt(stored, 10) : 0;
    } catch {
      return 0;
    }
  });

  const latestNewsTime = useMemo(() => {
    if (recentNews.length === 0) return 0;
    const first = recentNews[0];
    const timeStr = first.published_at || first.publishedAt;
    return timeStr ? new Date(timeStr).getTime() : 0;
  }, [recentNews]);

  const hasUnread = latestNewsTime > lastReadTime;

  const handleMarkAsRead = () => {
    const now = Date.now();
    setLastReadTime(now);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(LAST_READ_STORAGE_KEY, now.toString());
      } catch {
        // private browsing / storage quota errors are ignored
      }
    }
  };

  if (recentNews.length === 0) return null;

  if (variant === "bell") {
    return (
      <NewsBell
        items={recentNews}
        hasUnread={hasUnread}
        onOpen={handleMarkAsRead}
        className={className}
      />
    );
  }

  if (variant === "card") {
    return <NewsCard items={recentNews} className={className} />;
  }

  return (
    <div className={className}>
      <div className="md:hidden">
        <NewsBell
          items={recentNews}
          hasUnread={hasUnread}
          onOpen={handleMarkAsRead}
        />
      </div>
      <div className="hidden md:block">
        <NewsCard items={recentNews} />
      </div>
    </div>
  );
}

export function NewsBell({
  items,
  hasUnread,
  onOpen,
  className = "",
}: {
  items: NewsContent[];
  hasUnread: boolean;
  onOpen?: () => void;
  className?: string;
}) {
  return (
    <Popover onOpenChange={(open) => open && onOpen?.()}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="お知らせ"
          className={`relative h-9 w-9 text-muted-foreground hover:text-foreground ${className}`}
        >
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-background animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4 text-xs shadow-lg">
        <div className="font-semibold mb-3 flex justify-between items-center border-b border-border/40 pb-2">
          <span className="text-[13px] text-foreground flex items-center gap-1.5">
            <Megaphone className="h-3.5 w-3.5 text-orange-500" />
            お知らせ
          </span>
          <Link
            to="/news"
            className="text-muted-foreground hover:text-foreground text-[11px] underline"
          >
            一覧を見る
          </Link>
        </div>
        <NewsItemsList items={items} />
      </PopoverContent>
    </Popover>
  );
}

export function NewsCard({
  items,
  className = "",
}: {
  items: NewsContent[];
  className?: string;
}) {
  return (
    <Card className={`border-border/60 bg-muted/20 shadow-xs ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
          <Megaphone className="h-4 w-4 text-orange-500" />
          お知らせ
        </CardTitle>
        <Link
          to="/news"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
        >
          一覧
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <NewsItemsList items={items} />
      </CardContent>
    </Card>
  );
}

function NewsItemsList({ items }: { items: NewsContent[] }) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <Link
          key={item.id}
          to="/news/$id"
          params={{ id: item.id }}
          className="block rounded-md p-2 transition-colors hover:bg-muted/60 group"
        >
          <div className="text-muted-foreground text-[11px] font-medium">
            {formatDate(item.published_at || item.publishedAt)}
          </div>
          <div className="text-[13px] font-medium text-foreground group-hover:text-primary transition-colors truncate">
            {item.title}
          </div>
        </Link>
      ))}
    </div>
  );
}

export default ResponsiveNews;

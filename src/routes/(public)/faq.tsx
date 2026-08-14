import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { FaqAccordion } from "@/components/FaqAccordion";
import { Button } from "@/components/ui/button";
import { filterAndGroupFaqs } from "@/lib/faq";
import { cmsQueries } from "@/utils/cms.queries";

export const Route = createFileRoute("/(public)/faq")({
  // SSR時にサーバー側でmicroCMSからデータを先読み（プリフェッチ）
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(cmsQueries.faqs());
  },
  component: RouteComponent,
});

function RouteComponent() {
  // 先読みされたデータを同期的に取得
  const { data: faqs } = useSuspenseQuery(cmsQueries.faqs());
  const [searchQuery, setSearchQuery] = useState("");

  const isSearching = searchQuery.trim().length > 0;
  const groupedFaqs = useMemo(
    () => filterAndGroupFaqs(faqs, searchQuery),
    [faqs, searchQuery],
  );

  const totalResultsCount = useMemo(
    () => groupedFaqs.reduce((sum, cat) => sum + cat.items.length, 0),
    [groupedFaqs],
  );

  return (
    <div className="container mx-auto my-12 max-w-2xl px-4">
      {/* Geist風のヘッドライン */}
      <div className="mb-8">
        <h1 className="mb-2 text-[32px] sm:text-[40px] font-semibold tracking-[-2px] sm:tracking-[-2.4px] text-foreground">
          よくある質問
        </h1>
        <p className="text-[15px] sm:text-[16px] text-muted-foreground">
          PoohMaの仕組みや暗号化、セキュリティに関するFAQです。
        </p>
      </div>

      {/* 検索バー */}
      <div className="mb-8">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground select-none" />
          <input
            id="faq-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="FAQを検索..."
            aria-label="FAQを検索"
            className="h-11 w-full rounded-lg border border-border bg-background pl-10 pr-10 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:border-foreground/30 focus:outline-hidden focus:ring-2 focus:ring-ring/20 transition-colors shadow-xs"
          />
        </div>
      </div>

      {/* 0件表示 */}
      {isSearching && totalResultsCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-8 text-center">
          <p className="text-[15px] font-medium text-foreground mb-1">
            該当するFAQが見つかりませんでした
          </p>
          <p className="text-[13px] text-muted-foreground mb-4">
            「{searchQuery}
            」に一致する質問は見つかりませんでした。別のキーワードでお試しください。
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearchQuery("")}
            className="text-[13px]"
          >
            検索条件をクリア
          </Button>
        </div>
      ) : (
        <FaqAccordion groupedFaqs={groupedFaqs} isSearching={isSearching} />
      )}
    </div>
  );
}

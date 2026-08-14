import { ChevronDown, ChevronRight } from "lucide-react";
import { CmsRichText } from "@/components/CmsRichText";
import type { GroupedFaqCategory } from "@/lib/faq";

interface FaqAccordionProps {
  groupedFaqs: GroupedFaqCategory[];
  isSearching: boolean;
}

export function FaqAccordion({ groupedFaqs, isSearching }: FaqAccordionProps) {
  return (
    <div className="space-y-4">
      {groupedFaqs.map((category) => (
        <details
          key={`${category.key}-${isSearching ? "search" : "normal"}`}
          open={isSearching ? true : undefined}
          className="group/category overflow-hidden rounded-xl bg-card shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.1)] transition-all"
        >
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-hidden [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/category:rotate-90" />
              <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
                {category.label}
              </h2>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">
              {category.items.length}件
            </span>
          </summary>

          <div className="border-t border-border/40 bg-muted/20 p-3 sm:p-4 space-y-3">
            {category.items.length === 0 ? (
              <p className="py-4 text-center text-[14px] text-muted-foreground">
                このカテゴリには現在FAQが登録されていません。
              </p>
            ) : (
              category.items.map((faq) => (
                <details
                  key={faq.id}
                  className="group/faq overflow-hidden rounded-lg bg-background shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08),0px_2px_2px_rgba(0,0,0,0.04),#fafafa_0px_0px_0px_1px] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.1)]"
                >
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-start justify-between gap-3 p-4 select-none hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-hidden [&::-webkit-details-marker]:hidden">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-[12px] font-medium text-orange-600 dark:bg-orange-950/40 dark:text-orange-400 mt-0.5">
                        Q
                      </span>
                      <span className="text-[15px] font-medium tracking-tight text-foreground leading-snug">
                        {faq.question}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/faq:rotate-180 mt-1" />
                  </summary>

                  <div className="border-t border-border/30 bg-background/50 p-4 pt-3">
                    <div className="flex items-start gap-3 pl-1">
                      <span className="text-[14px] font-bold text-muted-foreground mt-0.5 select-none">
                        A.
                      </span>
                      <div className="flex-1 min-w-0">
                        <CmsRichText htmlContent={faq.answer} />
                      </div>
                    </div>
                  </div>
                </details>
              ))
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

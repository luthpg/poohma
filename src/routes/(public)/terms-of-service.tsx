import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CmsRichText } from "@/components/CmsRichText";
import { Skeleton } from "@/components/ui/skeleton";
import { cmsQueries } from "@/utils/cms.queries";

export const Route = createFileRoute("/(public)/terms-of-service")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(cmsQueries.legal());
  },
  pendingComponent: LegalPendingComponent,
  component: TermsOfServiceComponent,
});

function LegalPendingComponent() {
  return (
    <div className="container mx-auto my-12 max-w-2xl px-4">
      <Skeleton className="mb-8 h-10 w-48 rounded-md" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-[90%] rounded-md" />
        <Skeleton className="h-4 w-[95%] rounded-md" />
        <Skeleton className="mt-8 h-6 w-32 rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    </div>
  );
}

function TermsOfServiceComponent() {
  const { data: legal } = useSuspenseQuery(cmsQueries.legal());

  return (
    <div className="container mx-auto my-12 max-w-2xl px-4">
      {/* 負のレタースペーシングを当てたGeist特有のタイポグラフィ */}
      <h1 className="mb-8 text-[32px] font-semibold tracking-[-1.28px] text-foreground">
        利用規約
      </h1>

      {/* 最終更新日の表示（microCMSのメタデータ活用） */}
      <p className="mb-8 text-[14px] text-muted-foreground font-mono">
        最終更新日: {new Date(legal.updatedAt).toLocaleDateString("ja-JP")}
      </p>

      <div className="rounded-lg bg-card p-6 md:p-8 shadow-border">
        {/* パーサーを通してGeistデザイン化されたHTMLを描画 */}
        <CmsRichText htmlContent={legal.terms} />
      </div>
    </div>
  );
}

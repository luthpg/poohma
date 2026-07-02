import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CmsRichText } from "@/components/CmsRichText";
import { cmsQueries } from "@/utils/cms.queries";

export const Route = createFileRoute("/(public)/faq")({
  // SSR時にサーバー側でmicroCMSからデータを先読み（プリフェッチ）
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(cmsQueries.faqs());
  },
  component: RouteComponent,
});

function RouteComponent() {
  // 先読みされたデータを同期的に取得（Loading状態の条件分岐が不要）
  const { data: faqs } = useSuspenseQuery(cmsQueries.faqs());

  return (
    <div className="container mx-auto my-12 max-w-2xl px-4">
      {/* Geist風の圧縮された特大ヘッドライン */}
      <h1 className="mb-2 text-[40px] font-semibold tracking-[-2.4px] text-foreground">
        よくある質問
      </h1>
      <p className="mb-12 text-[16px] text-muted-foreground">
        PoohMaの仕組みや暗号化、セキュリティに関するFAQです。
      </p>

      <div className="space-y-6">
        {faqs.map((faq) => (
          <div
            key={faq.id}
            // Vercelを象徴する shadow-as-border (伝統的なborderは使わない)
            className="rounded-lg bg-background p-6 shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08),0px_2px_2px_rgba(0,0,0,0.04),#fafafa_0px_0px_0px_1px] dark:shadow-[0px_0px_0px_1px_rgba(255,255,255,0.1)]"
          >
            <div className="mb-3 flex items-start gap-3">
              {/* ステータスバッジ（フルピル型） */}
              <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-[12px] font-medium text-orange-600 dark:bg-orange-950/40 dark:text-orange-400">
                Q
              </span>
              <h2 className="text-[18px] font-medium tracking-tight text-foreground">
                {faq.question}
              </h2>
            </div>

            <div className="flex items-start gap-3 pl-1">
              <span className="text-[14px] font-bold text-muted-foreground mt-0.5 select-none">
                A.
              </span>
              <div className="flex-1">
                {/* microCMSから取得したHTMLにGeistデザインを当てて描画 */}
                <CmsRichText htmlContent={faq.answer} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

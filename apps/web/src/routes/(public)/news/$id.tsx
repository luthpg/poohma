import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { CmsRichText } from "@/components/CmsRichText";
import { Button } from "@/components/ui/button";
import { cmsQueries } from "@/utils/cms.queries";

export const Route = createFileRoute("/(public)/news/$id")({
	loader: async ({ context, params }) => {
		await context.queryClient.ensureQueryData(cmsQueries.newsDetail(params.id));
	},
	component: NewsDetailPage,
});

function NewsDetailPage() {
	const { id } = Route.useParams();
	const { data: newsItem } = useSuspenseQuery(cmsQueries.newsDetail(id));

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

	const dateDisplay = formatDate(newsItem.published_at || newsItem.publishedAt);

	return (
		<div className="container mx-auto my-12 max-w-3xl px-4 sm:px-6">
			{/* 一覧に戻るボタン */}
			<div className="mb-6">
				<Button
					asChild
					variant="ghost"
					size="sm"
					className="text-muted-foreground hover:text-foreground -ml-3 gap-1"
				>
					<Link to="/news">
						<ChevronLeft className="h-4 w-4" />
						お知らせ一覧に戻る
					</Link>
				</Button>
			</div>

			{/* 記事ヘッダー */}
			<header className="mb-8 border-b border-border/60 pb-6">
				<time
					dateTime={newsItem.published_at || newsItem.publishedAt}
					className="text-[13px] font-medium text-muted-foreground block mb-3"
				>
					{dateDisplay}
				</time>
				<h1 className="text-[26px] sm:text-[34px] font-bold tracking-tight text-foreground leading-tight">
					{newsItem.title}
				</h1>
			</header>

			{/* サムネイル（存在する場合） */}
			{newsItem.thumbnail && (
				<div className="mb-8 overflow-hidden rounded-xl border border-border/40 bg-muted/20">
					<img
						src={newsItem.thumbnail.url}
						alt={newsItem.title}
						width={newsItem.thumbnail.width}
						height={newsItem.thumbnail.height}
						className="w-full h-auto object-cover max-h-[400px]"
					/>
				</div>
			)}

			{/* 記事本文 */}
			<article className="prose prose-neutral dark:prose-invert max-w-none">
				<CmsRichText htmlContent={newsItem.content} />
			</article>

			{/* フッターナビゲーション */}
			<div className="mt-12 pt-8 border-t border-border/60">
				<Button asChild variant="outline" size="sm">
					<Link to="/news">
						<ChevronLeft className="h-4 w-4 mr-1" />
						一覧に戻る
					</Link>
				</Button>
			</div>
		</div>
	);
}

export default NewsDetailPage;

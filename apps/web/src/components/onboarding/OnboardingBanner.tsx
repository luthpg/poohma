import { RotateCcw, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

interface OnboardingBannerProps {
	isPurging: boolean;
	onRestartTour: () => void;
	onPurge: () => void;
}

export function OnboardingBanner({
	isPurging,
	onRestartTour,
	onPurge,
}: OnboardingBannerProps) {
	return (
		<div
			data-tour="sample-banner"
			className="mb-6 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all"
		>
			<div className="flex items-start sm:items-center gap-3">
				<span className="flex h-2 w-2 rounded-full bg-orange-500 shrink-0 mt-1.5 sm:mt-0 animate-pulse" />
				<div>
					<p className="text-sm font-semibold text-foreground">
						現在サンプルデータを表示中です
					</p>
					<p className="text-xs text-muted-foreground mt-0.5">
						暗号化ヒントの閲覧体験が完了したら、いつでもここから一括削除できます。
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2 self-end sm:self-center shrink-0">
				<button
					type="button"
					onClick={onRestartTour}
					disabled={isPurging}
					className="rounded-lg border border-border/60 bg-card hover:bg-accent px-3 py-1.5 text-xs font-medium text-foreground flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-sm"
				>
					<RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
					<span>ツアーを再開</span>
				</button>
				<button
					type="button"
					onClick={onPurge}
					disabled={isPurging}
					className="rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
				>
					{isPurging ? (
						<>
							<Spinner className="h-3.5 w-3.5" />
							<span>削除中...</span>
						</>
					) : (
						<>
							<Trash2 className="h-3.5 w-3.5" />
							<span>サンプルを削除</span>
						</>
					)}
				</button>
			</div>
		</div>
	);
}

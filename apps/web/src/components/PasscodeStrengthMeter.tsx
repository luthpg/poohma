import { evaluatePasscodeStrength } from "@/utils/passcode-strength";

const LABELS = ["非常に弱い", "弱い", "普通", "強い", "非常に強い"];
const COLORS = [
	"bg-red-500",
	"bg-orange-500",
	"bg-yellow-500",
	"bg-lime-500",
	"bg-green-500",
];

export function PasscodeStrengthMeter({ passcode }: { passcode: string }) {
	const { score, reasons } = evaluatePasscodeStrength(passcode);
	return (
		<div className="mt-1.5">
			<div className="flex gap-1">
				{Array.from({ length: 5 }, (_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: index is safe here
						key={i}
						className={`h-1 flex-1 rounded-full ${i <= score ? COLORS[score] : "bg-muted"}`}
					/>
				))}
			</div>
			<p className="mt-1 text-[12px] text-muted-foreground">
				強度: {LABELS[score]}
				{reasons.length > 0 && ` — ${reasons[0]}`}
			</p>
		</div>
	);
}

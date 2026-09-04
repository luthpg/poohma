import { Command as CommandPrimitive } from "cmdk";
import { X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { MAX_TAGS_PER_RECORD } from "@/utils/schemas";

interface TagInputProps {
	value: string[];
	onChange: (value: string[]) => void;
	availableTags?: string[];
	placeholder?: string;
	maxTags?: number;
}

export function TagInput({
	value,
	onChange,
	availableTags = [],
	placeholder = "タグを入力 (Enterで確定)...",
	maxTags = MAX_TAGS_PER_RECORD,
}: TagInputProps) {
	const inputRef = React.useRef<HTMLInputElement>(null);
	const [open, setOpen] = React.useState(false);
	const [inputValue, setInputValue] = React.useState("");
	const [expandedTags, setExpandedTags] = React.useState<string[]>([]);

	const handleUnselect = (tag: string) => {
		onChange(value.filter((t) => t !== tag));
	};

	const handleToggleTag = (tag: string) => {
		if (value.includes(tag)) {
			onChange(value.filter((t) => t !== tag));
		} else {
			if (value.length >= maxTags) {
				toast.error(`タグは${maxTags}個まで登録できます`);
				return;
			}
			onChange([...value, tag]);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		// 候補チップなど、テキスト入力欄以外からのキーイベントは処理しない
		if (e.target !== inputRef.current) return;

		// IME入力中のEnterキーは無視する
		if (e.nativeEvent.isComposing) return;

		const input = inputRef.current;
		if (input) {
			if (e.key === "Delete" || e.key === "Backspace") {
				if (input.value === "" && value.length > 0) {
					onChange(value.slice(0, -1));
				}
			}
			if (e.key === "Enter" || e.key === ",") {
				e.preventDefault();
				const newTag = inputValue.trim();
				if (newTag && !value.includes(newTag)) {
					if (value.length >= maxTags) {
						toast.error(`タグは${maxTags}個まで登録できます`);
						return;
					}
					onChange([...value, newTag]);
					setInputValue("");
				}
			}
			if (e.key === "Escape") {
				input.blur();
			}
		}
	};

	// サジェスト可能なタグ（すでに入力済みのものは除外）
	const selectables = availableTags.filter((tag) => !value.includes(tag));
	const showSuggestions = open && selectables.length > 0;

	// 候補タグのうち、選択されているものを前方にソート
	const sortedAvailableTags = React.useMemo(() => {
		return [...availableTags].sort((a, b) => {
			const aSelected = value.includes(a);
			const bSelected = value.includes(b);
			if (aSelected === bSelected) return 0;
			return aSelected ? -1 : 1;
		});
	}, [availableTags, value]);

	return (
		<Command
			label="タグ"
			onKeyDown={handleKeyDown}
			className="overflow-visible bg-transparent"
		>
			<div className="group border border-input px-3 py-2 text-base md:text-sm ring-offset-background rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
				<div className="flex gap-1 flex-wrap">
					{value.map((tag) => {
						const isExpanded = expandedTags.includes(tag);
						return (
							<Badge
								key={tag}
								variant="secondary"
								className="max-w-full cursor-pointer"
								onMouseDown={(e) => {
									e.preventDefault(); // 入力欄のフォーカスを維持
								}}
								onClick={() => {
									setExpandedTags((prev) =>
										prev.includes(tag)
											? prev.filter((t) => t !== tag)
											: [...prev, tag],
									);
								}}
							>
								<span
									className={
										isExpanded
											? "whitespace-normal break-all"
											: "truncate max-w-[150px] sm:max-w-[200px]"
									}
									title={tag}
								>
									{tag}
								</span>
								<button
									type="button"
									className="ml-1 shrink-0 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleUnselect(tag);
										}
									}}
									onMouseDown={(e) => {
										e.preventDefault();
										e.stopPropagation();
									}}
									onClick={(e) => {
										e.stopPropagation();
										handleUnselect(tag);
									}}
								>
									<X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
								</button>
							</Badge>
						);
					})}
					<CommandPrimitive.Input
						ref={inputRef}
						value={inputValue}
						onValueChange={setInputValue}
						onBlur={() => {
							setOpen(false);
							// フォーカスが外れた際に、入力途中の文字があれば自動的にタグとして確定する
							const newTag = inputValue.trim();
							if (newTag && !value.includes(newTag)) {
								if (value.length >= maxTags) {
									toast.error(`タグは${maxTags}個まで登録できます`);
									return;
								}
								onChange([...value, newTag]);
								setInputValue("");
							}
						}}
						onFocus={() => setOpen(true)}
						placeholder={placeholder}
						className="ml-2 bg-transparent outline-none placeholder:text-muted-foreground flex-1 min-w-[120px]"
					/>
				</div>
			</div>

			{/* モバイル・デスクトップ共通：キーボードを開かずに操作可能なインラインサジェストチップ */}
			{sortedAvailableTags.length > 0 && (
				<div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
					<span className="shrink-0 text-muted-foreground mr-0.5 select-none">
						候補:
					</span>
					{sortedAvailableTags.map((tag) => {
						const isSelected = value.includes(tag);
						return (
							<button
								key={tag}
								type="button"
								data-testid={`suggest-tag-${tag}`}
								onMouseDown={(e) => {
									e.preventDefault(); // フォーカス移動による意図しない blur 確定を防ぐ
								}}
								onClick={() => handleToggleTag(tag)}
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors shrink-0 cursor-pointer",
									isSelected
										? "bg-foreground text-background hover:bg-foreground/90"
										: "border border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
								)}
							>
								<span>{tag}</span>
								{isSelected && <X className="h-3 w-3" />}
							</button>
						);
					})}
				</div>
			)}

			<div className="relative mt-2">
				{showSuggestions ? (
					<div className="absolute w-full z-10 top-0 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
						<CommandList>
							<CommandGroup className="h-full overflow-auto max-h-[200px]">
								{selectables.map((tag) => {
									return (
										<CommandItem
											key={tag}
											onMouseDown={(e) => {
												e.preventDefault();
												e.stopPropagation();
											}}
											onSelect={() => {
												if (value.length >= maxTags) {
													toast.error(`タグは${maxTags}個まで登録できます`);
													return;
												}
												setInputValue("");
												onChange([...value, tag]);
											}}
											className={"cursor-pointer"}
										>
											{tag}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</div>
				) : null}
			</div>
		</Command>
	);
}

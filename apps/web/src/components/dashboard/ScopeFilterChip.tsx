import { Check, ChevronDown, Globe, Lock, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ScopeFilterType = "all" | "personal" | "shared";

interface ScopeFilterChipProps {
  currentFilter: ScopeFilterType;
  onFilterChange: (filter: ScopeFilterType) => void;
  counts?: {
    all: number;
    personal: number;
    shared: number;
  };
  className?: string;
}

const SCOPE_CONFIG = {
  all: {
    label: "すべて",
    icon: Globe,
    activeClass:
      "bg-card text-foreground border-border/60 hover:bg-accent shadow-xs",
  },
  personal: {
    label: "自分のみ",
    icon: Lock,
    activeClass:
      "bg-secondary text-foreground border-border/60 hover:bg-accent shadow-xs",
  },
  shared: {
    label: "共有中",
    icon: Users,
    activeClass:
      "bg-blue-100/60 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-100 dark:hover:bg-blue-900/60 shadow-xs",
  },
} as const;

/**
 * 共有種別（すべて / 自分のみ / 共有中）を切り替えるピル型ドロップダウンチップ。
 * shadcn/ui DropdownMenu を経由し、横一列のフィルターバー内でコンパクトに機能します。
 */
export function ScopeFilterChip({
  currentFilter,
  onFilterChange,
  counts,
  className,
}: ScopeFilterChipProps) {
  const currentConfig = SCOPE_CONFIG[currentFilter] || SCOPE_CONFIG.all;
  const CurrentIcon = currentConfig.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="scope-filter-chip"
          aria-label={`共有種別フィルター: 現在は${currentConfig.label}`}
          className={cn(
            "flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium border transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
            currentConfig.activeClass,
            className,
          )}
        >
          <CurrentIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="tracking-tight">{currentConfig.label}</span>
          {counts && (
            <span className="text-[11px] font-normal opacity-70">
              ({counts[currentFilter]})
            </span>
          )}
          <ChevronDown
            className="h-3 w-3 shrink-0 opacity-50 ml-0.5"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44 p-1 rounded-xl shadow-lg border-border/60"
      >
        {(Object.keys(SCOPE_CONFIG) as Array<keyof typeof SCOPE_CONFIG>).map(
          (key) => {
            const config = SCOPE_CONFIG[key];
            const Icon = config.icon;
            const isSelected = currentFilter === key;
            const count = counts?.[key];

            return (
              <DropdownMenuItem
                key={key}
                data-testid={`scope-option-${key}`}
                onClick={() => onFilterChange(key)}
                className={cn(
                  "flex items-center justify-between px-2.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors",
                  isSelected && "bg-accent font-semibold text-foreground",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      key === "shared"
                        ? "text-blue-500"
                        : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span className="truncate">{config.label}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {count !== undefined && (
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {count}
                    </span>
                  )}
                  {isSelected && (
                    <Check
                      className="h-3.5 w-3.5 text-orange-500 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </DropdownMenuItem>
            );
          },
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

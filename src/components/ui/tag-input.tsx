import { Command as CommandPrimitive } from "cmdk";
import { X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  availableTags?: string[];
  placeholder?: string;
}

export function TagInput({
  value,
  onChange,
  availableTags = [],
  placeholder = "タグを入力 (Enterで確定)...",
}: TagInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");
  const [expandedTags, setExpandedTags] = React.useState<string[]>([]);

  const handleUnselect = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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

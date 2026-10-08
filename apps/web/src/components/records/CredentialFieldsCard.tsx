import { ChevronDown, ChevronUp, Lightbulb, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { RecordFormCredential } from "@/hooks/useRecordForm";

export interface CredentialFieldsCardProps {
  index: number;
  credential: RecordFormCredential;
  removable: boolean;
  onChange: (
    index: number,
    field: keyof Omit<RecordFormCredential, "id">,
    value: string,
  ) => void;
  onRemove: (index: number) => void;
  isFieldModified?: (field: string) => boolean;
  isEditMode?: boolean;
}

export function CredentialFieldsCard({
  index,
  credential,
  removable,
  onChange,
  onRemove,
  isFieldModified,
  isEditMode = false,
}: CredentialFieldsCardProps) {
  const [isLabelOpen, setIsLabelOpen] = useState(Boolean(credential.label));
  const isLabelModified = isFieldModified?.(`credential_${index}_label`);
  const isLoginIdModified = isFieldModified?.(`credential_${index}_loginId`);
  const isHintModified = isFieldModified?.(`credential_${index}_passwordHint`);

  const getModifiedClass = (modified?: boolean) => {
    if (!isEditMode) return "";
    return `relative pl-3.5 before:pointer-events-none before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-orange-500 before:rounded-full before:transition-all before:duration-200 ${
      modified
        ? "before:opacity-100 before:scale-y-100"
        : "before:opacity-0 before:scale-y-50"
    }`;
  };

  return (
    <div className="relative w-full rounded-md border border-border/60 bg-muted/50 p-5 shadow-border-light group">
      {removable && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="absolute right-2 top-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-2.5 text-muted-foreground opacity-70 transition-all hover:bg-red-500/10 hover:text-red-500 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:opacity-100 cursor-pointer"
          title="このアカウント情報を削除"
          aria-label="このアカウント情報を削除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}

      <div className={removable ? "pt-2 sm:pt-0" : ""}>
        {/* 主要項目: ログインID & パスワードヒント */}
        <div className="space-y-5 max-w-xl">
          {/* 1. ログインID */}
          <div className={getModifiedClass(isLoginIdModified)}>
            <label
              htmlFor={`login-id-input-${index}`}
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              ログインID
            </label>
            <input
              id={`login-id-input-${index}`}
              type="text"
              value={credential.loginId}
              onChange={(e) => onChange(index, "loginId", e.target.value)}
              className="h-11 w-full rounded-md bg-card px-3 text-base font-mono shadow-border focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
            />
          </div>

          {/* 2. パスワードヒント */}
          <div className={getModifiedClass(isHintModified)}>
            <label
              htmlFor={`pw-hint-input-${index}`}
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              パスワードヒント
            </label>
            <input
              id={`pw-hint-input-${index}`}
              type="text"
              value={credential.passwordHint}
              onChange={(e) => onChange(index, "passwordHint", e.target.value)}
              autoComplete="off"
              aria-describedby={`pw-hint-description-${index}`}
              className="h-11 w-full rounded-md border-2 border-amber-500/40 bg-amber-500/[0.04] px-3 text-base dark:border-amber-400/40 dark:bg-amber-400/[0.04] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
            />
            <p
              id={`pw-hint-description-${index}`}
              className="mt-2 text-[12px] md:text-[13px] text-muted-foreground leading-relaxed"
            >
              パスワードを思い出すための手がかりを書いてください。
            </p>

            {/* ヒントの考え方ガイド (先頭アカウントのみ) */}
            {index === 0 && (
              <Accordion type="single" collapsible className="mt-2.5">
                <AccordionItem value="hint-guide" className="border-b-0">
                  <AccordionTrigger className="min-h-[44px] py-1.5 text-[12px] md:text-[13px] text-foreground hover:no-underline font-normal">
                    <span className="inline-flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <span>ヒントの考え方ガイド</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pt-1 pb-2 text-[12px] md:text-[13px] text-muted-foreground leading-relaxed">
                    <ul className="list-disc space-y-1.5 pl-4 marker:text-muted-foreground/60">
                      <li>
                        パスワードにモチーフや共通項があれば、それを日本語で書いてみましょう
                      </li>
                      <li>
                        このサービスのために普段と変えている要素があれば、その変更点のヒントを付け足しましょう
                      </li>
                      <li>
                        物理的にメモがある場合は、保管場所だけを書いておくのも有効です
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </div>
        </div>

        {/* 3. 補助項目: ラベル（任意設定・デフォルト折りたたみ） */}
        <div className="mt-4 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={() => setIsLabelOpen(!isLabelOpen)}
            aria-expanded={isLabelOpen}
            aria-controls={`label-container-${index}`}
            className="inline-flex items-center gap-1.5 text-[12px] md:text-[13px] text-muted-foreground hover:text-foreground transition cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
          >
            {isLabelOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>ラベルを設定（例：パパ用）</span>
            {!isLabelOpen && credential.label && (
              <span className="ml-1 text-orange-500 font-medium">
                ({credential.label})
              </span>
            )}
          </button>

          {isLabelOpen && (
            <div
              id={`label-container-${index}`}
              className={`mt-2.5 animate-in fade-in duration-150 ${getModifiedClass(isLabelModified)}`}
            >
              <label
                htmlFor={`label-input-${index}`}
                className="mb-1.5 block text-[13px] text-muted-foreground"
              >
                ラベル <span className="text-[12px]">（アカウント識別用）</span>
              </label>
              <input
                id={`label-input-${index}`}
                type="text"
                value={credential.label}
                onChange={(e) => onChange(index, "label", e.target.value)}
                placeholder="例: パパ用、仕事用"
                className="h-10 w-full max-w-[280px] rounded-md bg-card px-3 text-base shadow-border focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

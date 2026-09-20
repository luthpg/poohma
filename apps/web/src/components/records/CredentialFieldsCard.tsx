import { Lightbulb, Trash2 } from "lucide-react";
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
    <div className="rounded-md bg-muted/50 p-5 shadow-border-light relative group">
      {removable && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="absolute right-1 top-1 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md p-2.5 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 opacity-70 hover:opacity-100 focus:opacity-100 cursor-pointer"
          title="このアカウント情報を削除"
          aria-label="このアカウント情報を削除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className={getModifiedClass(isLabelModified)}>
          <label
            htmlFor={`label-input-${index}`}
            className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            ラベル (例: パパ用)
          </label>
          <input
            id={`label-input-${index}`}
            type="text"
            value={credential.label}
            onChange={(e) => onChange(index, "label", e.target.value)}
            className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
        </div>
        <div className={getModifiedClass(isLoginIdModified)}>
          <label
            htmlFor={`login-id-input-${index}`}
            className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            ログインID
          </label>
          <input
            id={`login-id-input-${index}`}
            type="text"
            value={credential.loginId}
            onChange={(e) => onChange(index, "loginId", e.target.value)}
            className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-mono"
          />
        </div>
        <div className={getModifiedClass(isHintModified)}>
          <label
            htmlFor={`pw-hint-input-${index}`}
            className="block text-[12px] font-medium text-muted-foreground uppercase tracking-wider mb-1"
          >
            パスワードヒント
          </label>
          <input
            id={`pw-hint-input-${index}`}
            type="text"
            value={credential.passwordHint}
            onChange={(e) => onChange(index, "passwordHint", e.target.value)}
            autoComplete="off"
            placeholder="思い出すためのヒントを入力"
            className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
            パスワードそのものではなく、思い出すための手がかりメモです。
          </p>
        </div>
      </div>
      {index === 0 && (
        <Accordion
          type="single"
          collapsible
          className="mt-3 border-t border-border/40 pt-1"
        >
          <AccordionItem value="hint-guide" className="border-b-0">
            <AccordionTrigger className="py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:no-underline font-normal">
              <span className="inline-flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span>ヒントの考え方ガイド</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-2 text-[12px] text-muted-foreground leading-relaxed">
              <ul className="space-y-1.5 pl-4 list-disc marker:text-muted-foreground/60">
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
  );
}

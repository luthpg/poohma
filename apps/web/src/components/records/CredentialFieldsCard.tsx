import { Trash2 } from "lucide-react";
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
}

export function CredentialFieldsCard({
  index,
  credential,
  removable,
  onChange,
  onRemove,
}: CredentialFieldsCardProps) {
  return (
    <div className="rounded-md bg-muted/50 p-5 shadow-border-light relative group">
      {removable && (
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="absolute right-2.5 top-2.5 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 opacity-80 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
          title="このアカウント情報を削除"
          aria-label="このアカウント情報を削除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
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
        <div>
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
        <div>
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
            placeholder="例: 愛犬の名前+結婚記念日"
            className="w-full rounded-md bg-card p-2 text-base md:text-[14px] shadow-border focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
        </div>
      </div>
    </div>
  );
}

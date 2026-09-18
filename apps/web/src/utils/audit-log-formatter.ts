import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Clock,
  FileEdit,
  FileKey2,
  Key,
  KeyRound,
  LifeBuoy,
  LogOut,
  MailPlus,
  MailX,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  UserX,
} from "lucide-react";

/**
 * 変更されたフィールド名の英語キーを分かりやすい日本語に変換するマッピング辞書
 */
export const FIELD_NAME_JA: Record<string, string> = {
  title: "タイトル",
  credentials: "アカウント情報",
  tags: "タグ",
  ownerType: "共有設定",
  ownerFamilyId: "共有家族",
  admins: "個別管理者",
  updatedAt: "更新日時",
  name: "グループ名",
  label: "ラベル",
  loginId: "ログインID",
  passwordHint: "パスワードヒント",
  order: "並び順",
};

/**
 * 英語フィールド名を日本語に整形。未知のフィールドはそのまま返却。
 */
export function formatFieldName(field: string): string {
  return FIELD_NAME_JA[field] ?? field;
}

export interface ActionConfigItem {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
  colorClass: string;
}

/**
 * 監査イベントアクションごとの表示設定
 */
export const AUDIT_ACTION_CONFIG: Record<string, ActionConfigItem> = {
  RECORD_CREATE: {
    label: "新規作成",
    icon: PlusCircle,
    badgeClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    colorClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  RECORD_UPDATE: {
    label: "更新",
    icon: FileEdit,
    badgeClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    colorClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  RECORD_DELETE: {
    label: "削除",
    icon: Trash2,
    badgeClass:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    colorClass:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  CREDENTIAL_CREATE: {
    label: "情報追加",
    icon: KeyRound,
    badgeClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    colorClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  CREDENTIAL_UPDATE: {
    label: "情報更新",
    icon: KeyRound,
    badgeClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    colorClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  CREDENTIAL_DELETE: {
    label: "情報削除",
    icon: KeyRound,
    badgeClass:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    colorClass:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
  SHARE_SETTING_CHANGED: {
    label: "共有設定",
    icon: Users,
    badgeClass:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    colorClass:
      "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  ADMIN_CHANGED: {
    label: "管理者変更",
    icon: ShieldAlert,
    badgeClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    colorClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  FAMILY_UPDATE: {
    label: "家族設定",
    icon: FileEdit,
    badgeClass:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
    colorClass:
      "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  },
  MEMBER_JOIN: {
    label: "参加承認",
    icon: UserCheck,
    badgeClass:
      "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    colorClass:
      "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  },
  MEMBER_REMOVE: {
    label: "除名",
    icon: UserMinus,
    badgeClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    colorClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
  MEMBER_LEAVE: {
    label: "退会",
    icon: LogOut,
    badgeClass:
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
    colorClass:
      "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
  MEMBER_ROLE_CHANGED: {
    label: "ロール変更",
    icon: ShieldCheck,
    badgeClass:
      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    colorClass:
      "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  },
  INVITE_CREATE: {
    label: "招待発行",
    icon: MailPlus,
    badgeClass:
      "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
    colorClass:
      "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  },
  INVITE_REVOKE: {
    label: "招待無効",
    icon: MailX,
    badgeClass:
      "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
    colorClass:
      "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  },
  JOIN_REQUEST_REJECTED: {
    label: "参加拒否",
    icon: UserX,
    badgeClass:
      "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    colorClass:
      "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  },
  FAMILY_MIGRATION: {
    label: "家族移行",
    icon: ArrowRightLeft,
    badgeClass:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    colorClass:
      "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  },
  PASSCODE_ROTATED: {
    label: "パスコード変更",
    icon: Key,
    badgeClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    colorClass:
      "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  RECOVERY_KIT_REGISTERED: {
    label: "復元キット発行",
    icon: FileKey2,
    badgeClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    colorClass:
      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  RECOVERY_REDEEMED: {
    label: "アカウント復元",
    icon: LifeBuoy,
    badgeClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    colorClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
  ACCOUNT_DELETE: {
    label: "アカウント削除",
    icon: UserX,
    badgeClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    colorClass:
      "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
};

export const DEFAULT_ACTION_CONFIG: ActionConfigItem = {
  label: "操作",
  icon: Clock,
  badgeClass: "bg-muted text-muted-foreground border-border",
  colorClass: "bg-muted text-muted-foreground border-border",
};

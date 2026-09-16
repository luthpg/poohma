import { signInWithCustomToken } from "firebase/auth";
import type { RecordFormValues } from "@/hooks/useRecordForm";
import {
  decrypt,
  encrypt,
  generateDEK,
  unwrapDEK,
  wrapDEK,
} from "@/lib/crypto";
import { getCustomTokenFromSession } from "@/services/auth.functions";
import { auth } from "@/utils/firebase";

export interface StoredRecordDraftContainer {
  targetRecordId?: string;
  draftId?: string;
  initialRevision?: number | null;
  isEditing?: boolean;
  accountId?: string | null;
  timestamp: number;
  expiresAt: number;
  values: {
    title: string;
    titleReading: string;
    url: string;
    ogpImage: string;
    ogpDescription: string;
    memo: string;
    ownerType: "user" | "family";
    tags: string[];
    credentials: Array<{
      id?: string;
      label: string;
      loginId: string;
      passwordHintEncrypted?: string;
      passwordHintIv?: string;
      passwordHintDekEncrypted?: string;
      passwordHintDekIv?: string;
    }>;
  };
}

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24時間有効

/**
 * Convex や Firebase Auth の認証・セッション切れエラーであるかを判定
 */
export function isAuthSessionError(err: unknown): boolean {
  if (!err) return false;

  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof (err as { message?: unknown }).message === "string"
          ? String((err as { message?: unknown }).message)
          : "";

  const code =
    typeof (err as { code?: unknown }).code === "string"
      ? String((err as { code?: unknown }).code)
      : "";

  // Convex の customBuilders / Auth エラー
  if (
    message.includes("Unauthenticated") ||
    message.includes("Unauthorized") ||
    message.includes("unauthenticated") ||
    message.includes("unauthorized")
  ) {
    return true;
  }

  // Firebase Auth のセッション・トークン失効エラーコード
  const firebaseAuthCodes = [
    "auth/user-token-expired",
    "auth/id-token-expired",
    "auth/user-disabled",
    "auth/user-not-found",
    "auth/invalid-user-token",
    "auth/session-cookie-expired",
    "auth/null-user",
  ];

  if (code && firebaseAuthCodes.includes(code)) {
    return true;
  }

  return false;
}

/**
 * 透過的なトークンリフレッシュ＆サイレント再認証を試行
 */
export async function attemptSilentReauth(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // 1. Firebase Auth の currentUser がある場合、IDトークンを強制リフレッシュ
  if (auth?.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
      return true;
    } catch {
      // リフレッシュ失敗時は Cookie からの復元を試行
    }
  }

  // 2. Session Cookie からカスタムトークンを取得して再ログイン
  if (auth) {
    try {
      const result = await getCustomTokenFromSession();
      if (result?.customToken) {
        await signInWithCustomToken(auth, result.customToken);
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * 保存キーを生成（既存レコードなら recordId、新規なら draftId で隔離）
 */
export function getDraftStorageKey(
  targetRecordId?: string,
  draftId?: string,
): string {
  if (targetRecordId) {
    return `poohma_draft_record_${targetRecordId}`;
  }
  if (draftId) {
    return `poohma_draft_new_${draftId}`;
  }
  return "poohma_draft_new_default";
}

/**
 * 【B案】短命 draftDEK を生成してヒントを AES-GCM 暗号化し、
 * その draftDEK を masterKey で wrap して localStorage に安全保存
 */
export async function saveRecordDraft(params: {
  targetRecordId?: string;
  draftId?: string;
  values: RecordFormValues;
  masterKey: CryptoKey;
  initialRevision?: number | null;
  isEditing?: boolean;
  accountId?: string | null;
}): Promise<void> {
  const {
    targetRecordId,
    draftId,
    values,
    masterKey,
    initialRevision,
    isEditing,
    accountId,
  } = params;

  const now = Date.now();
  const expiresAt = now + DRAFT_TTL_MS;

  const encryptedCredentials = await Promise.all(
    values.credentials.map(async (cred) => {
      if (!cred.passwordHint) {
        return {
          id: cred.id,
          label: cred.label,
          loginId: cred.loginId,
        };
      }

      // 短命 DEK を生成してヒントを暗号化、DEK を masterKey でラップ
      const draftDek = await generateDEK();
      const { encrypted, iv } = await encrypt(cred.passwordHint, draftDek);
      const { encrypted: dekEncrypted, iv: dekIv } = await wrapDEK(
        draftDek,
        masterKey,
      );

      return {
        id: cred.id,
        label: cred.label,
        loginId: cred.loginId,
        passwordHintEncrypted: encrypted,
        passwordHintIv: iv,
        passwordHintDekEncrypted: dekEncrypted,
        passwordHintDekIv: dekIv,
      };
    }),
  );

  const container: StoredRecordDraftContainer = {
    targetRecordId,
    draftId,
    initialRevision,
    isEditing,
    accountId,
    timestamp: now,
    expiresAt,
    values: {
      title: values.title,
      titleReading: values.titleReading,
      url: values.url,
      ogpImage: values.ogpImage,
      ogpDescription: values.ogpDescription,
      memo: values.memo,
      ownerType: values.ownerType,
      tags: values.tags,
      credentials: encryptedCredentials,
    },
  };

  const local = getLocalStorage();
  const storageKey = getDraftStorageKey(targetRecordId, draftId);
  try {
    local?.setItem(storageKey, JSON.stringify(container));
  } catch {
    // ignore
  }
}

/**
 * 退避されているドラフトを復号して復元
 */
export async function loadRecordDraft(params: {
  targetRecordId?: string;
  draftId?: string;
  masterKey: CryptoKey;
  currentAccountId?: string | null;
}): Promise<{
  values: RecordFormValues;
  initialRevision?: number | null;
  isEditing?: boolean;
  accountId?: string | null;
} | null> {
  const { targetRecordId, draftId, masterKey, currentAccountId } = params;
  const local = getLocalStorage();
  const storageKey = getDraftStorageKey(targetRecordId, draftId);
  const raw = local?.getItem(storageKey);
  if (!raw) return null;

  try {
    const container = JSON.parse(raw) as StoredRecordDraftContainer;

    // 有効期限検証
    if (Date.now() > container.expiresAt) {
      clearRecordDraft({ targetRecordId, draftId });
      return null;
    }

    // アカウント境界チェック（両方確定している場合のみ検証）
    if (
      container.accountId &&
      currentAccountId &&
      container.accountId !== currentAccountId
    ) {
      return null;
    }

    // クレデンシャル復号（DEK を unwrap してヒントを復号）
    const decryptedCredentials = await Promise.all(
      container.values.credentials.map(async (cred) => {
        if (
          cred.passwordHintEncrypted &&
          cred.passwordHintIv &&
          cred.passwordHintDekEncrypted &&
          cred.passwordHintDekIv
        ) {
          try {
            const draftDek = await unwrapDEK(
              cred.passwordHintDekEncrypted,
              cred.passwordHintDekIv,
              masterKey,
            );
            const plainHint = await decrypt(
              cred.passwordHintEncrypted,
              cred.passwordHintIv,
              draftDek,
            );
            return {
              id: cred.id,
              label: cred.label,
              loginId: cred.loginId,
              passwordHint: plainHint,
            };
          } catch {
            return {
              id: cred.id,
              label: cred.label,
              loginId: cred.loginId,
              passwordHint: "",
            };
          }
        }
        return {
          id: cred.id,
          label: cred.label,
          loginId: cred.loginId,
          passwordHint: "",
        };
      }),
    );

    return {
      values: {
        ...container.values,
        credentials:
          decryptedCredentials.length > 0
            ? decryptedCredentials
            : [{ label: "", loginId: "", passwordHint: "" }],
      },
      initialRevision: container.initialRevision,
      isEditing: container.isEditing,
      accountId: container.accountId,
    };
  } catch {
    return null;
  }
}

/**
 * ドラフトの存在チェック
 */
export function hasRecordDraft(params: {
  targetRecordId?: string;
  draftId?: string;
}): boolean {
  const local = getLocalStorage();
  const storageKey = getDraftStorageKey(params.targetRecordId, params.draftId);
  const raw = local?.getItem(storageKey);
  if (!raw) return false;

  try {
    const container = JSON.parse(raw) as StoredRecordDraftContainer;
    if (Date.now() > container.expiresAt) {
      clearRecordDraft(params);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * ドラフトの物理削除（保存完了時・明示的キャンセル時）
 */
export function clearRecordDraft(params: {
  targetRecordId?: string;
  draftId?: string;
}): void {
  const local = getLocalStorage();
  const storageKey = getDraftStorageKey(params.targetRecordId, params.draftId);
  try {
    local?.removeItem(storageKey);
  } catch {
    // ignore
  }
}

/**
 * 何らかの有効なドラフトが存在するかを軽量判定（ルートガード等用）
 */
export function hasAnyPendingDraft(): boolean {
  const local = getLocalStorage();
  if (!local) return false;

  try {
    for (let i = 0; i < local.length; i++) {
      const key = local.key(i);
      if (key?.startsWith("poohma_draft_")) {
        const raw = local.getItem(key);
        if (raw) {
          const container = JSON.parse(raw) as StoredRecordDraftContainer;
          if (Date.now() <= container.expiresAt) {
            return true;
          }
          local.removeItem(key);
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 既存コンポーネント互換用: targetRecordId からドラフトの有無を判定
 */
export function hasPendingDraft(targetRecordId?: string): boolean {
  return hasRecordDraft({ targetRecordId });
}

/**
 * フォーム入力内容を手動退避（メモ帳等へのコピー）用に整形したテキストを作成
 */
export function formatDraftAsText(values: RecordFormValues): string {
  const lines: string[] = [];
  lines.push(`【サービス名】 ${values.title || "(未入力)"}`);
  if (values.titleReading) {
    lines.push(`【ふりがな】 ${values.titleReading}`);
  }
  if (values.url) {
    lines.push(`【URL】 ${values.url}`);
  }
  if (values.tags && values.tags.length > 0) {
    lines.push(`【タグ】 ${values.tags.join(", ")}`);
  }
  if (values.memo) {
    lines.push(`【メモ】\n${values.memo}`);
  }

  if (values.credentials && values.credentials.length > 0) {
    lines.push("\n--- アカウント情報 ---");
    values.credentials.forEach((cred, index) => {
      lines.push(`[アカウント ${index + 1}]`);
      if (cred.label) lines.push(`  表示名: ${cred.label}`);
      if (cred.loginId) lines.push(`  ログインID: ${cred.loginId}`);
      if (cred.passwordHint)
        lines.push(`  パスワードヒント: ${cred.passwordHint}`);
    });
  }

  return lines.join("\n");
}

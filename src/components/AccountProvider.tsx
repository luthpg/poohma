import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type React from "react";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useConvexFirebaseAuth } from "@/hooks/useConvexFirebaseAuth";
import { clearQueryCache } from "@/hooks/usePersistentQuery";
import { auth } from "@/utils/firebase";

export interface Account {
  _id: Id<"users">;
  id: Id<"users">;
  userId: string;
  familyId?: Id<"families">;
  displayName?: string;
  name?: string;
  email: string;
  photoURL?: string;
  family?: {
    id: Id<"families">;
    name: string;
    masterKeyEncrypted?: string;
    masterKeyIv?: string;
    masterKeySalt?: string;
  } | null;
  createdAt?: number;
  updatedAt: number;
}

export interface AccountContextValue {
  accounts: Account[];
  activeAccount: Account | null;
  activeAccountId: Id<"users"> | null;
  isLoading: boolean;
  switchAccount: (accountId: Id<"users">) => Promise<void>;
  createAccount: (name: string) => Promise<Id<"users">>;
  deleteAccount: (accountId: Id<"users">) => Promise<void>;
}

export const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: {
    accountId?: Id<"users">;
    familyId?: Id<"families">;
    accounts?: {
      _id: Id<"users">;
      id: Id<"users">;
      userId: string;
      email: string;
      displayName?: string;
      photoURL?: string;
      familyId?: Id<"families">;
    }[];
  } | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexFirebaseAuth();
  const currentUid =
    auth?.currentUser?.uid || initialUser?.accounts?.[0]?.userId;

  const getStorageKey = useCallback((uid?: string) => {
    return uid ? `poohma_active_account_id_${uid}` : "poohma_active_account_id";
  }, []);

  const fetchedAccounts = useQuery(
    api.users.getAccounts,
    isAuthenticated ? {} : "skip",
  );

  const createAccountMutation = useMutation(api.users.createAccount);
  const deleteAccountMutation = useMutation(api.users.deleteAccount);

  const [activeAccountId, setActiveAccountId] = useState<Id<"users"> | null>(
    () => {
      if (typeof window !== "undefined") {
        const key = currentUid
          ? `poohma_active_account_id_${currentUid}`
          : "poohma_active_account_id";
        const stored =
          localStorage.getItem(key) ||
          localStorage.getItem("poohma_active_account_id");
        if (stored) return stored as Id<"users">;
      }
      return initialUser?.accountId || null;
    },
  );

  const accounts: Account[] = useMemo(() => {
    if (fetchedAccounts) {
      return fetchedAccounts.map((a) => ({
        ...a,
        name: a.displayName || "名無しアカウント",
      }));
    }
    if (initialUser?.accounts) {
      return initialUser.accounts.map((a) => ({
        ...a,
        _id: a._id || a.id,
        id: a.id || a._id,
        name: a.displayName || "名無しアカウント",
        updatedAt: Date.now(),
      }));
    }
    return [];
  }, [fetchedAccounts, initialUser]);

  // マウント時およびユーザー切り替え時にlocalStorageからactiveAccountIdを復元
  useEffect(() => {
    if (typeof window !== "undefined" && currentUid) {
      const key = getStorageKey(currentUid);
      const stored =
        localStorage.getItem(key) ||
        localStorage.getItem("poohma_active_account_id");
      if (stored) {
        setActiveAccountId(stored as Id<"users">);
      }
    }
  }, [currentUid, getStorageKey]);

  // アカウントリストが取得できたら、activeAccountIdの有効性をチェックして必要なら初期化
  useEffect(() => {
    if (accounts.length > 0) {
      const exists = accounts.some((a) => a._id === activeAccountId);
      if (!exists || !activeAccountId) {
        // localStorage に有効な ID が保存されているか確認
        let targetId = accounts[0]._id;
        if (typeof window !== "undefined") {
          const key = getStorageKey(currentUid);
          const stored =
            localStorage.getItem(key) ||
            localStorage.getItem("poohma_active_account_id");
          if (stored && accounts.some((a) => a._id === stored)) {
            targetId = stored as Id<"users">;
          } else {
            localStorage.setItem(key, targetId);
          }
        }
        setActiveAccountId(targetId);
      }
    }
  }, [accounts, activeAccountId, currentUid, getStorageKey]);

  const activeAccount = useMemo(() => {
    if (!accounts || accounts.length === 0) return null;
    const found = accounts.find((a) => a._id === activeAccountId);
    return found || accounts[0];
  }, [accounts, activeAccountId]);

  const switchAccount = useCallback(
    async (accountId: Id<"users">) => {
      if (accountId === activeAccountId) return;

      // 1. ローカル暗号化キャッシュ / クエリキャッシュの破棄
      clearQueryCache();
      await queryClient.invalidateQueries();

      // 2. アクティブアカウントの切り替え
      setActiveAccountId(accountId);
      if (typeof window !== "undefined") {
        localStorage.setItem(getStorageKey(currentUid), accountId);
        // レガシーキーも更新
        localStorage.setItem("poohma_active_account_id", accountId);
      }

      toast.success("アカウントを切り替えました");
      await router.invalidate();
    },
    [activeAccountId, currentUid, getStorageKey, queryClient, router],
  );

  const createAccount = useCallback(
    async (name: string) => {
      const newAccountId = await createAccountMutation({ name });
      clearQueryCache();
      await queryClient.invalidateQueries();
      setActiveAccountId(newAccountId);
      if (typeof window !== "undefined") {
        localStorage.setItem(getStorageKey(currentUid), newAccountId);
        localStorage.setItem("poohma_active_account_id", newAccountId);
      }
      toast.success("新しいアカウントを作成しました");
      await router.invalidate();
      return newAccountId;
    },
    [createAccountMutation, currentUid, getStorageKey, queryClient, router],
  );

  const deleteAccount = useCallback(
    async (accountId: Id<"users">) => {
      await deleteAccountMutation({ accountId });
      clearQueryCache();
      await queryClient.invalidateQueries();

      // 削除したアカウントがアクティブだった場合のみ、別のアカウントへ切り替え
      if (accountId === activeAccountId) {
        const remaining = accounts.filter((a) => a._id !== accountId);
        if (remaining.length > 0) {
          const nextId = remaining[0]._id;
          setActiveAccountId(nextId);
          if (typeof window !== "undefined") {
            localStorage.setItem(getStorageKey(currentUid), nextId);
            localStorage.setItem("poohma_active_account_id", nextId);
          }
        } else {
          setActiveAccountId(null);
          if (typeof window !== "undefined") {
            localStorage.removeItem(getStorageKey(currentUid));
            localStorage.removeItem("poohma_active_account_id");
          }
        }
      }

      toast.success("アカウントを削除しました");
      await router.invalidate();
    },
    [
      accounts,
      activeAccountId,
      currentUid,
      deleteAccountMutation,
      getStorageKey,
      queryClient,
      router,
    ],
  );

  const isLoading =
    isAuthLoading ||
    (isAuthenticated && fetchedAccounts === undefined && accounts.length === 0);

  const value = useMemo<AccountContextValue>(
    () => ({
      accounts,
      activeAccount,
      activeAccountId,
      isLoading,
      switchAccount,
      createAccount,
      deleteAccount,
    }),
    [
      accounts,
      activeAccount,
      activeAccountId,
      isLoading,
      switchAccount,
      createAccount,
      deleteAccount,
    ],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

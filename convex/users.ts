import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import {
  authenticatedMutation,
  identityVerifiedMutation,
  identityVerifiedQuery,
} from "./customBuilders";

/**
 * ユーザー同期（ログイン時に呼ばれる）
 * - Firebase UID でユーザーを検索し、存在すればプロフィール更新
 * - 同じメールで別UIDのユーザーが存在する場合、データを移行
 * - 完全に新規の場合はデフォルトアカウントを作成
 */
export const syncUser = identityVerifiedMutation({
  args: {
    displayName: v.optional(v.string()),
    photoURL: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { identity } = ctx;
    const uid = identity.subject;
    const email = identity.email;
    const isEmailVerified = identity.emailVerified;
    if (!email || !isEmailVerified) throw new Error("Email is required");

    const { displayName, photoURL } = args;

    // Firebase UID でアカウントを検索
    const existingAccounts = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", uid))
      .collect();

    if (existingAccounts.length > 0) {
      // 既存のアカウントが存在する場合、先頭アカウント（または全アカウント）のプロフィール情報を更新
      const primaryAccount = existingAccounts[0];
      const patchData: {
        email: string;
        photoURL?: string;
        updatedAt: number;
        displayName?: string;
      } = {
        email,
        photoURL,
        updatedAt: Date.now(),
      };
      if (!primaryAccount.displayName && displayName) {
        patchData.displayName = displayName;
      }
      await ctx.db.patch(primaryAccount._id, patchData);
      return primaryAccount.userId;
    }

    // UIDが一致しない → 同じemailの古いレコードがないか確認
    const existingByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (existingByEmail) {
      // 同じemailで別UIDのレコードが存在
      // → Firebase Auth側でアカウント再作成されたケース
      // 旧ユーザーのServiceRecordを新UIDに移行
      const records = await ctx.db
        .query("serviceRecords")
        .withIndex("by_userId", (q) => q.eq("userId", existingByEmail.userId))
        .collect();

      for (const record of records) {
        await ctx.db.patch(record._id, { userId: uid });
      }

      // 旧ユーザーを更新（UIDとプロフィールを新しいものに差し替え）
      const patchData: {
        userId: string;
        email: string;
        photoURL?: string;
        updatedAt: number;
        displayName?: string;
      } = {
        userId: uid,
        email,
        photoURL,
        updatedAt: Date.now(),
      };
      if (!existingByEmail.displayName && displayName) {
        patchData.displayName = displayName;
      }
      await ctx.db.patch(existingByEmail._id, patchData);

      return uid;
    }

    // 完全に新規のユーザー（デフォルトアカウント作成）
    const now = Date.now();
    await ctx.db.insert("users", {
      userId: uid,
      email,
      displayName,
      photoURL,
      createdAt: now,
      updatedAt: now,
    });

    return uid;
  },
});

/**
 * ログイン中のFirebaseユーザーに紐づくPoohMaアカウント一覧を取得
 */
export const getAccounts = identityVerifiedQuery({
  args: {},
  handler: async (ctx) => {
    const { identity } = ctx;
    const uid = identity.subject;

    const accounts = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", uid))
      .collect();

    const results = await Promise.all(
      accounts.map(async (acc) => {
        let family: {
          id: Id<"families">;
          name: string;
          masterKeyEncrypted?: string;
          masterKeyIv?: string;
          masterKeySalt?: string;
        } | null = null;

        if (acc.familyId) {
          const familyDoc = await ctx.db.get(acc.familyId);
          if (familyDoc) {
            family = {
              id: familyDoc._id,
              name: familyDoc.name,
              masterKeyEncrypted: familyDoc.masterKeyEncrypted,
              masterKeyIv: familyDoc.masterKeyIv,
              masterKeySalt: familyDoc.masterKeySalt,
            };
          }
        }

        return {
          _id: acc._id,
          id: acc._id,
          userId: acc.userId,
          email: acc.email,
          displayName: acc.displayName,
          photoURL: acc.photoURL,
          familyId: acc.familyId,
          family,
          createdAt: acc.createdAt,
          updatedAt: acc.updatedAt,
        };
      }),
    );

    return results;
  },
});

/**
 * 新規PoohMaアカウントを作成
 */
export const createAccount = identityVerifiedMutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity } = ctx;
    const uid = identity.subject;
    const email = identity.email;
    const isEmailVerified = identity.emailVerified;
    if (!email || !isEmailVerified) throw new Error("Email is required");

    const trimmedName = args.name.trim();
    if (!trimmedName) throw new Error("アカウント名を入力してください");

    const now = Date.now();
    const accountId = await ctx.db.insert("users", {
      userId: uid,
      email,
      displayName: trimmedName,
      photoURL: identity.pictureUrl,
      createdAt: now,
      updatedAt: now,
    });

    return accountId;
  },
});

/**
 * プロフィール（アカウント表示名）の更新
 */
export const updateProfile = authenticatedMutation({
  args: {
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    await ctx.db.patch(user._id, {
      displayName: args.displayName.trim(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * アカウントの削除
 */
export const deleteAccount = authenticatedMutation({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;

    // 1. 家族に関する処理
    if (user.familyId) {
      const familyId = user.familyId;
      // 同じ家族のメンバーをカウント
      const familyMembers = await ctx.db
        .query("users")
        .withIndex("by_familyId", (q) => q.eq("familyId", familyId))
        .collect();

      const otherMembers = familyMembers.filter((u) => u._id !== user._id);

      // 他のメンバーがいない場合は家族およびそのレコードも削除
      if (otherMembers.length === 0) {
        const familyRecords = await ctx.db
          .query("serviceRecords")
          .withIndex("by_familyId", (q) => q.eq("familyId", familyId))
          .collect();
        for (const record of familyRecords) {
          await ctx.db.delete(record._id);
        }

        const joinReqs = await ctx.db
          .query("joinRequests")
          .withIndex("by_familyId_userId", (q) => q.eq("familyId", familyId))
          .collect();
        for (const req of joinReqs) {
          await ctx.db.delete(req._id);
        }

        await ctx.db.delete(familyId);
      } else {
        // 他のメンバーがいる場合は、このアカウントが作成した非公開レコードのみ削除
        const privateRecords = await ctx.db
          .query("serviceRecords")
          .withIndex("by_familyId_visibility", (q) =>
            q.eq("familyId", familyId).eq("visibility", "PRIVATE"),
          )
          .collect();
        for (const record of privateRecords.filter(
          (r) => r.userId === user.userId,
        )) {
          await ctx.db.delete(record._id);
        }
      }
    } else {
      // 家族未所属の場合、このユーザーが作成した全レコードを削除
      const records = await ctx.db
        .query("serviceRecords")
        .withIndex("by_userId", (q) => q.eq("userId", user.userId))
        .collect();
      for (const record of records) {
        if (!record.familyId) {
          await ctx.db.delete(record._id);
        }
      }
    }

    // 2. ユーザーアカウント自身の削除
    await ctx.db.delete(user._id);

    return { success: true };
  },
});

export const getUserByFirebaseUid = internalQuery({
  args: {
    userId: v.string(),
    accountId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let user = null;
    if (args.accountId) {
      user = await ctx.db.get(args.accountId);
      if (user && user.userId !== args.userId) {
        user = null;
      }
    }

    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .first();
    }

    if (!user) return null;

    let family = null;
    if (user.familyId) {
      const familyDoc = await ctx.db.get(user.familyId);
      if (familyDoc) {
        family = {
          id: familyDoc._id,
          name: familyDoc.name,
          masterKeyEncrypted: familyDoc.masterKeyEncrypted,
          masterKeyIv: familyDoc.masterKeyIv,
          masterKeySalt: familyDoc.masterKeySalt,
        };
      }
    }

    // 関連する全アカウントも取得
    const allAccounts = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      _id: user._id,
      id: user.userId,
      accountId: user._id,
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      familyId: user.familyId,
      family,
      accounts: allAccounts.map((acc) => ({
        _id: acc._id,
        id: acc._id,
        userId: acc.userId,
        email: acc.email,
        displayName: acc.displayName,
        photoURL: acc.photoURL,
        familyId: acc.familyId,
      })),
    };
  },
});

export const getUserById = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);

    if (!user) return null;

    let family: {
      id: Id<"families">;
      name: string;
      masterKeyEncrypted: string | undefined;
      masterKeyIv: string | undefined;
      masterKeySalt: string | undefined;
    } | null = null;
    if (user.familyId) {
      const familyDoc = await ctx.db.get(user.familyId);
      if (familyDoc) {
        family = {
          id: familyDoc._id,
          name: familyDoc.name,
          masterKeyEncrypted: familyDoc.masterKeyEncrypted,
          masterKeyIv: familyDoc.masterKeyIv,
          masterKeySalt: familyDoc.masterKeySalt,
        };
      }
    }

    return {
      _id: user._id,
      id: user.userId,
      accountId: user._id,
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      familyId: user.familyId,
      family,
    };
  },
});

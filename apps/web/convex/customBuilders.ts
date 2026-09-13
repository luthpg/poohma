import { v } from "convex/values";
import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  mutation as baseMutation,
  query as baseQuery,
} from "./_generated/server";
import { getEffectiveFamilyRole, requireAdminAccess } from "./rls";

/**
 * 認証情報とアカウント所有権の共通解決関数
 */
export async function resolveAccount(
  ctx:
    | { db: QueryCtx["db"]; auth: QueryCtx["auth"] }
    | { db: MutationCtx["db"]; auth: MutationCtx["auth"] },
  accountId?: Id<"users">,
): Promise<{
  identity: NonNullable<
    Awaited<ReturnType<QueryCtx["auth"]["getUserIdentity"]>>
  >;
  user: Doc<"users">;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");

  let user: Doc<"users"> | null = null;
  if (accountId) {
    user = await ctx.db.get(accountId);
    if (!user || user.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }
  } else {
    user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .first();
  }

  if (!user) throw new Error("User not found in DB");

  return { identity, user };
}

/**
 * 認証済みクエリ（identityのみ保証）
 */
export const identityVerifiedQuery = customQuery(baseQuery, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    return { ctx: { ...ctx, identity }, args };
  },
});

/**
 * 認証済みミューテーション（identityのみ保証）
 */
export const identityVerifiedMutation = customMutation(baseMutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    return { ctx: { ...ctx, identity }, args };
  },
});

/**
 * 認証済み・アカウント保証クエリビルダー
 */
export const authenticatedQuery = customQuery(baseQuery, {
  args: {
    accountId: v.optional(v.id("users")),
  },
  input: async (ctx, args) => {
    const { identity, user } = await resolveAccount(ctx, args.accountId);
    return { ctx: { ...ctx, identity, user }, args };
  },
});

/**
 * 認証済み・アカウント保証ミューテーションビルダー
 */
export const authenticatedMutation = customMutation(baseMutation, {
  args: {
    accountId: v.optional(v.id("users")),
  },
  input: async (ctx, args) => {
    const { identity, user } = await resolveAccount(ctx, args.accountId);
    return { ctx: { ...ctx, identity, user }, args };
  },
});

/**
 * 家族に所属していることを保証するビルダー
 */
export const familyBoundQuery = customQuery(baseQuery, {
  args: {
    accountId: v.optional(v.id("users")),
  },
  input: async (ctx, args) => {
    const { identity, user } = await resolveAccount(ctx, args.accountId);
    if (!user.familyId) throw new Error("User does not belong to a family");

    return { ctx: { ...ctx, identity, user, familyId: user.familyId }, args };
  },
});

/**
 * 家族に所属していることを保証するミューテーション
 */
export const familyBoundMutation = customMutation(baseMutation, {
  args: {
    accountId: v.optional(v.id("users")),
  },
  input: async (ctx, args) => {
    const { identity, user } = await resolveAccount(ctx, args.accountId);
    if (!user.familyId) throw new Error("User does not belong to a family");

    return { ctx: { ...ctx, identity, user, familyId: user.familyId }, args };
  },
});

/**
 * 家族のファミリー管理者（familyRole === "admin"）であることを保証するミューテーション
 */
export const familyAdminMutation = customMutation(baseMutation, {
  args: {
    accountId: v.optional(v.id("users")),
  },
  input: async (ctx, args) => {
    const { identity, user } = await resolveAccount(ctx, args.accountId);
    if (!user.familyId) throw new Error("User does not belong to a family");
    if (getEffectiveFamilyRole(user) !== "admin") {
      throw new Error("Access denied: Admin role required");
    }

    return { ctx: { ...ctx, identity, user, familyId: user.familyId }, args };
  },
});

/**
 * レコードの管理者権限を保証し、解決済み record を提供するミューテーション
 */
export const recordAdminMutation = customMutation(baseMutation, {
  args: {
    id: v.id("serviceRecords"),
    accountId: v.optional(v.id("users")),
  },
  input: async (ctx, args) => {
    const { identity, user } = await resolveAccount(ctx, args.accountId);
    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("Record not found");
    }
    requireAdminAccess(user, record);

    return {
      ctx: { ...ctx, identity, user, record, familyId: user.familyId },
      args,
    };
  },
});

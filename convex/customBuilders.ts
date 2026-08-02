import {
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  mutation as baseMutation,
  query as baseQuery,
} from "./_generated/server";

/**
 * 認証済みクエリ
 */
export const identityVerifiedQuery = customQuery(baseQuery, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // DBの存在チェックは行わず、検証済みのidentityのみを後続に渡す
    return { ctx: { ...ctx, identity }, args };
  },
});

/**
 * 認証済みミューテーション
 */
export const identityVerifiedMutation = customMutation(baseMutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    // DBの存在チェックは行わず、検証済みのidentityのみを後続に渡す
    return { ctx: { ...ctx, identity }, args };
  },
});

/**
 * 認証済みユーザーを保証するビルダー
 */
export const authenticatedQuery = customQuery(baseQuery, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found in DB");

    // ctx に user を拡張して後続のハンドラに渡す
    return { ctx: { ...ctx, user }, args };
  },
});

/**
 * 認証済みミューテーション
 */
export const authenticatedMutation = customMutation(baseMutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found in DB");

    return { ctx: { ...ctx, user }, args };
  },
});

/**
 * 家族に所属していることを保証するビルダー
 */
export const familyBoundQuery = customQuery(baseQuery, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found in DB");
    if (!user.familyId) throw new Error("User does not belong to a family");

    return { ctx: { ...ctx, user, familyId: user.familyId }, args };
  },
});

/**
 * 家族に所属していることを保証するミューテーション
 */
export const familyBoundMutation = customMutation(baseMutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found in DB");
    if (!user.familyId) throw new Error("User does not belong to a family");

    return { ctx: { ...ctx, user, familyId: user.familyId }, args };
  },
});

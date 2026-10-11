import { v } from "convex/values";
import { systemAdminQuery } from "../customBuilders";

/**
 * 管理コンソール向けユーザー一覧照会
 * ※E2EE暗号化されたパスワードヒント・平文資材には一切アクセスしない安全設計
 */
export const getUsersList = systemAdminQuery({
  args: {
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const users = await ctx.db
      .query("users")
      .order("desc")
      .take(limit * 2);

    let filtered = users;
    if (args.search && args.search.trim().length > 0) {
      const q = args.search.trim().toLowerCase();
      filtered = filtered.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          u.displayName?.toLowerCase().includes(q),
      );
    }

    const sliced = filtered.slice(0, limit);

    // 所属ファミリー名を並列解決
    const usersWithFamily = await Promise.all(
      sliced.map(async (u) => {
        let familyName: string | null = null;
        if (u.familyId) {
          const family = await ctx.db.get(u.familyId);
          familyName = family?.name ?? null;
        }

        return {
          id: u._id,
          userId: u.userId,
          email: u.email,
          displayName: u.displayName ?? null,
          photoURL: u.photoURL ?? null,
          familyId: u.familyId ?? null,
          familyName,
          familyRole: u.familyRole,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        };
      }),
    );

    return usersWithFamily;
  },
});

/**
 * 管理コンソール向けファミリーグループ一覧照会
 */
export const getFamiliesList = systemAdminQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const families = await ctx.db.query("families").order("desc").take(limit);

    const familiesWithMeta = await Promise.all(
      families.map(async (f) => {
        // 所属メンバー数をカウント
        const members = await ctx.db
          .query("users")
          .withIndex("by_familyId", (q) => q.eq("familyId", f._id))
          .collect();

        return {
          id: f._id,
          name: f.name,
          memberCount: members.length,
          cryptoVersion: f.cryptoVersion,
          hasRecoveryKit: f.recoveryCodeHash != null,
          updatedAt: f.updatedAt,
        };
      }),
    );

    return familiesWithMeta;
  },
});

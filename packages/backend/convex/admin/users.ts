import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
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
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const search = args.search?.trim();

    let sliced: Doc<"users">[];

    if (search && search.length > 0) {
      // メール完全一致の場合は by_email インデックスで高速解決
      if (search.includes("@")) {
        const exactUser = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", search))
          .first();
        if (exactUser) {
          sliced = [exactUser];
        } else {
          // Search Index で全件から検索
          const [emailMatches, displayNameMatches] = await Promise.all([
            ctx.db
              .query("users")
              .withSearchIndex("search_email", (q) => q.search("email", search))
              .take(limit),
            ctx.db
              .query("users")
              .withSearchIndex("search_displayName", (q) =>
                q.search("displayName", search),
              )
              .take(limit),
          ]);
          const seen = new Set<string>();
          const merged: Doc<"users">[] = [];
          for (const u of [...emailMatches, ...displayNameMatches]) {
            if (!seen.has(u._id)) {
              seen.add(u._id);
              merged.push(u);
            }
          }
          sliced = merged.slice(0, limit);
        }
      } else {
        // Search Index で全件から検索
        const [emailMatches, displayNameMatches] = await Promise.all([
          ctx.db
            .query("users")
            .withSearchIndex("search_email", (q) => q.search("email", search))
            .take(limit),
          ctx.db
            .query("users")
            .withSearchIndex("search_displayName", (q) =>
              q.search("displayName", search),
            )
            .take(limit),
        ]);
        const seen = new Set<string>();
        const merged: Doc<"users">[] = [];
        for (const u of [...emailMatches, ...displayNameMatches]) {
          if (!seen.has(u._id)) {
            seen.add(u._id);
            merged.push(u);
          }
        }
        sliced = merged.slice(0, limit);
      }
    } else {
      sliced = await ctx.db.query("users").order("desc").take(limit);
    }

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

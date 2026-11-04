import { ConvexError, v } from "convex/values";
import { systemAdminMutation, systemAdminQuery } from "../customBuilders";

/**
 * 管理者向けお問い合わせ一覧取得
 */
export const getContacts = systemAdminQuery({
  args: {
    status: v.optional(
      v.union(v.literal("UNREAD"), v.literal("READ"), v.literal("RESOLVED")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const status = args.status;
    const q = ctx.db.query("contacts").withIndex("by_createdAt").order("desc");

    return await (status != null
      ? q.filter((f) => f.eq(f.field("status"), status))
      : q
    ).take(limit);
  },
});

/**
 * 管理者向けお問い合わせステータス更新
 */
export const updateContactStatus = systemAdminMutation({
  args: {
    id: v.id("contacts"),
    status: v.union(
      v.literal("UNREAD"),
      v.literal("READ"),
      v.literal("RESOLVED"),
    ),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.id);
    if (!contact) {
      throw new ConvexError("Contact not found");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
    });

    return { success: true };
  },
});

/**
 * 管理者向けお問い合わせ統計情報
 */
export const getContactStats = systemAdminQuery({
  args: {},
  handler: async (ctx) => {
    const [unreadList, readList, resolvedList] = await Promise.all([
      ctx.db
        .query("contacts")
        .withIndex("by_status", (q) => q.eq("status", "UNREAD"))
        .collect(),
      ctx.db
        .query("contacts")
        .withIndex("by_status", (q) => q.eq("status", "READ"))
        .collect(),
      ctx.db
        .query("contacts")
        .withIndex("by_status", (q) => q.eq("status", "RESOLVED"))
        .collect(),
    ]);

    const unreadCount = unreadList.length;
    const readCount = readList.length;
    const resolvedCount = resolvedList.length;

    return {
      total: unreadCount + readCount + resolvedCount,
      unread: unreadCount,
      read: readCount,
      resolved: resolvedCount,
    };
  },
});

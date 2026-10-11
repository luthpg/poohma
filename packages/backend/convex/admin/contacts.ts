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
    const limit = args.limit ?? 50;

    let contacts = await ctx.db
      .query("contacts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit * 2);

    if (args.status != null) {
      contacts = contacts.filter((c) => c.status === args.status);
    }

    return contacts.slice(0, limit);
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
    const allContacts = await ctx.db
      .query("contacts")
      .withIndex("by_createdAt")
      .take(500);

    let unreadCount = 0;
    let readCount = 0;
    let resolvedCount = 0;

    for (const c of allContacts) {
      if (c.status === "UNREAD") unreadCount++;
      else if (c.status === "READ") readCount++;
      else if (c.status === "RESOLVED") resolvedCount++;
    }

    return {
      total: allContacts.length,
      unread: unreadCount,
      read: readCount,
      resolved: resolvedCount,
    };
  },
});

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// === Queries ===

export const getRecords = query({
  args: {
    q: v.optional(v.string()),
    tag: v.optional(v.string()),
    sort: v.optional(v.string()),
    // page: v.optional(v.number()), // TODO: Implement cursor-based pagination with Convex paginated query
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to getRecords");
    }
    const userId = identity.subject; // Firebase UID from subject

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    // 基本クエリ: 自身のレコード、または同じ家族で共有設定のもの
    let recordsQuery = ctx.db.query("serviceRecords");

    // 全件取得してからフィルタ (検索条件が複雑なため)
    let records = await recordsQuery.collect();

    records = records.filter(
      (record) =>
        record.userId === userId ||
        (record.familyId === user.familyId && record.visibility === "SHARED")
    );

    if (args.tag) {
      records = records.filter((r) => r.tags.includes(args.tag!));
    }

    if (args.q) {
      const q = args.q.toLowerCase();
      records = records.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.memo?.toLowerCase().includes(q) ||
          r.credentials.some(
            (c) =>
              c.label?.toLowerCase().includes(q) ||
              c.loginId?.toLowerCase().includes(q)
          )
      );
    }

    // ソート
    records.sort((a, b) => {
      if (args.sort === "name-asc") return a.title.localeCompare(b.title);
      if (args.sort === "name-desc") return b.title.localeCompare(a.title);
      if (args.sort === "url-asc") return (a.url || "").localeCompare(b.url || "");
      if (args.sort === "url-desc") return (b.url || "").localeCompare(a.url || "");
      // default: updatedAt-desc
      return b.updatedAt - a.updatedAt;
    });

    return records;
  },
});

export const getRecordDetail = query({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to getRecordDetail");
    }
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("Record not found");
    }

    const hasAccess =
      record.userId === userId ||
      (user && record.familyId === user.familyId && record.visibility === "SHARED");

    if (!hasAccess) {
      throw new Error("Access denied");
    }

    const recordOwner = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", record.userId))
      .unique();

    return {
      ...record,
      user: recordOwner
        ? {
            displayName: recordOwner.displayName,
            email: recordOwner.email,
          }
        : null,
    };
  },
});

export const getAvailableTags = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    const records = await ctx.db.query("serviceRecords").collect();
    
    const visibleRecords = records.filter(
      (r) =>
        r.userId === userId ||
        (user && r.familyId === user.familyId && r.visibility === "SHARED")
    );

    const tagsSet = new Set<string>();
    for (const r of visibleRecords) {
      for (const t of r.tags) {
        tagsSet.add(t);
      }
    }

    return Array.from(tagsSet).sort();
  },
});

// === Mutations ===

export const createRecord = mutation({
  args: {
    title: v.string(),
    url: v.optional(v.string()),
    ogpImage: v.optional(v.string()),
    ogpDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    visibility: v.union(v.literal("PRIVATE"), v.literal("SHARED")),
    credentials: v.array(
      v.object({
        id: v.string(),
        label: v.optional(v.string()),
        loginId: v.optional(v.string()),
        passwordHint: v.optional(v.string()),
        passwordHintIv: v.optional(v.string()),
      })
    ),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!user) throw new Error("User not found in DB");
    if (!user.familyId) throw new Error("User does not belong to a family");

    const recordId = await ctx.db.insert("serviceRecords", {
      title: args.title,
      url: args.url,
      ogpImage: args.ogpImage,
      ogpDescription: args.ogpDescription,
      memo: args.memo,
      visibility: args.visibility,
      userId,
      familyId: user.familyId,
      credentials: args.credentials,
      tags: args.tags,
      updatedAt: Date.now(),
    });

    return recordId;
  },
});

export const updateRecord = mutation({
  args: {
    id: v.id("serviceRecords"),
    data: v.object({
      title: v.string(),
      url: v.optional(v.string()),
      ogpImage: v.optional(v.string()),
      ogpDescription: v.optional(v.string()),
      memo: v.optional(v.string()),
      visibility: v.union(v.literal("PRIVATE"), v.literal("SHARED")),
      credentials: v.array(
        v.object({
          id: v.string(),
          label: v.optional(v.string()),
          loginId: v.optional(v.string()),
          passwordHint: v.optional(v.string()),
          passwordHintIv: v.optional(v.string()),
        })
      ),
      tags: v.array(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    if (record.userId !== userId) {
      throw new Error("Only the owner can update this record");
    }

    await ctx.db.patch(args.id, {
      ...args.data,
      updatedAt: Date.now(),
    });
  },
});

export const deleteRecord = mutation({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    if (record.userId !== userId) {
      throw new Error("Only the owner can delete this record");
    }

    await ctx.db.delete(args.id);
  },
});

export const importRecords = mutation({
  args: {
    records: v.array(
      v.object({
        title: v.string(),
        url: v.optional(v.string()),
        ogpImage: v.optional(v.string()),
        ogpDescription: v.optional(v.string()),
        memo: v.optional(v.string()),
        visibility: v.union(v.literal("PRIVATE"), v.literal("SHARED")),
        credentials: v.array(
          v.object({
            id: v.string(),
            label: v.optional(v.string()),
            loginId: v.optional(v.string()),
            passwordHint: v.optional(v.string()),
            passwordHintIv: v.optional(v.string()),
          })
        ),
        tags: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!user) throw new Error("User not found in DB");
    if (!user.familyId) throw new Error("家族グループに所属していません。");

    if (args.records.length > 500) {
      throw new Error(
        "一度にインポートできるデータは最大500行までです。ファイルを分割して再度お試しください。",
      );
    }

    const failures: { row: number; reason: string }[] = [];
    let successes = 0;

    for (let i = 0; i < args.records.length; i++) {
      const record = args.records[i];
      try {
        if (!record.title) {
          failures.push({ row: i + 1, reason: "タイトルが空です" });
          continue;
        }
        await ctx.db.insert("serviceRecords", {
          title: record.title,
          url: record.url,
          ogpImage: record.ogpImage,
          ogpDescription: record.ogpDescription,
          memo: record.memo,
          visibility: record.visibility,
          userId,
          familyId: user.familyId,
          credentials: record.credentials,
          tags: record.tags,
          updatedAt: Date.now(),
        });
        successes++;
      } catch (_err) {
        failures.push({
          row: i + 1,
          reason: "データベースへの保存時にエラーが発生しました",
        });
      }
    }

    return { successes, failures };
  },
});


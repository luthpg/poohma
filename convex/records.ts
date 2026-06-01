import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { z } from "zod";
import { RecordInputSchema, CredentialInputSchema } from "../src/utils/schemas";

const ConvexCredentialInputSchema = CredentialInputSchema.extend({
  id: z.string(),
});

const ConvexRecordInputSchema = RecordInputSchema.extend({
  credentials: z.array(ConvexCredentialInputSchema),
});

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

    // 自身のレコードと家族で共有設定のレコードをインデックスを活用して個別に取得
    const ownRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const sharedRecords = user.familyId
      ? await ctx.db
          .query("serviceRecords")
          .withIndex("by_familyId_visibility", (q) =>
            q.eq("familyId", user.familyId).eq("visibility", "SHARED")
          )
          .collect()
      : [];

    const ownIds = new Set(ownRecords.map((r) => r._id));
    let records = [
      ...ownRecords,
      ...sharedRecords.filter((r) => !ownIds.has(r._id)),
    ];

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

    const ownRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const sharedRecords = user?.familyId
      ? await ctx.db
          .query("serviceRecords")
          .withIndex("by_familyId_visibility", (q) =>
            q.eq("familyId", user.familyId).eq("visibility", "SHARED")
          )
          .collect()
      : [];

    const ownIds = new Set(ownRecords.map((r) => r._id));
    const visibleRecords = [
      ...ownRecords,
      ...sharedRecords.filter((r) => !ownIds.has(r._id)),
    ];

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
    const parsed = ConvexRecordInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
      );
    }

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
    const parsed = ConvexRecordInputSchema.safeParse(args.data);
    if (!parsed.success) {
      throw new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`
      );
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!user) throw new Error("User not found");

    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    const isOwner = record.userId === userId;
    const isFamilyShared =
      record.visibility === "SHARED" &&
      record.familyId != null &&
      record.familyId === user.familyId;

    if (!isOwner && !isFamilyShared) {
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

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!user) throw new Error("User not found");

    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    const isOwner = record.userId === userId;
    const isFamilyShared =
      record.visibility === "SHARED" &&
      record.familyId != null &&
      record.familyId === user.familyId;

    if (!isOwner && !isFamilyShared) {
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
        const parsed = ConvexRecordInputSchema.safeParse(record);
        if (!parsed.success) {
          failures.push({
            row: i + 1,
            reason: parsed.error.issues.map((issue) => issue.message).join(", "),
          });
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

export const getOwnedRecords = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    return await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

import { v } from "convex/values";
import { z } from "zod";
import { CredentialInputSchema, RecordInputSchema } from "../src/utils/schemas";
import { authenticatedQuery, familyBoundMutation } from "./customBuilders";
import { requireRecordAccess } from "./rls";

const ConvexCredentialInputSchema = CredentialInputSchema.extend({
  id: z.string(),
});

const ConvexRecordInputSchema = RecordInputSchema.extend({
  credentials: z.array(ConvexCredentialInputSchema),
});

// === Queries ===

export const getRecords = authenticatedQuery({
  args: {
    q: v.optional(v.string()),
    tag: v.optional(v.string()),
    sort: v.optional(v.string()),
    // page: v.optional(v.number()), // TODO: Implement cursor-based pagination with Convex paginated query
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    // 自身のレコードと家族で共有設定のレコードをインデックスを活用して個別に取得
    const ownRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .collect();

    const sharedRecords = user.familyId
      ? await ctx.db
          .query("serviceRecords")
          .withIndex("by_familyId_visibility", (q) =>
            q.eq("familyId", user.familyId).eq("visibility", "SHARED"),
          )
          .collect()
      : [];

    const ownIds = new Set(ownRecords.map((r) => r._id));
    let records = [
      ...ownRecords,
      ...sharedRecords.filter((r) => !ownIds.has(r._id)),
    ];

    if (args.tag) {
      records = records.filter((r) => r.tags.includes(args.tag as string));
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
              c.loginId?.toLowerCase().includes(q),
          ),
      );
    }

    // ソート
    records.sort((a, b) => {
      if (args.sort === "name-asc") return a.title.localeCompare(b.title);
      if (args.sort === "name-desc") return b.title.localeCompare(a.title);
      if (args.sort === "url-asc")
        return (a.url || "").localeCompare(b.url || "");
      if (args.sort === "url-desc")
        return (b.url || "").localeCompare(a.url || "");
      // default: updatedAt-desc
      return b.updatedAt - a.updatedAt;
    });

    return records;
  },
});

export const getRecordDetail = authenticatedQuery({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("Record not found");
    }

    // アクセス権のチェック（IDOR対策の確実な実行）
    requireRecordAccess(ctx.user, record);

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

export const getAvailableTags = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;

    const ownRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .collect();

    const sharedRecords = user.familyId
      ? await ctx.db
          .query("serviceRecords")
          .withIndex("by_familyId_visibility", (q) =>
            q.eq("familyId", user.familyId).eq("visibility", "SHARED"),
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

export const getOwnedRecords = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;

    return await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .collect();
  },
});

// === Mutations ===

export const createRecord = familyBoundMutation({
  args: {
    title: v.string(),
    titleReading: v.optional(v.string()),
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
        passwordHintDekEncrypted: v.optional(v.string()),
        passwordHintDekIv: v.optional(v.string()),
      }),
    ),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const parsed = ConvexRecordInputSchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const { user } = ctx;

    const recordId = await ctx.db.insert("serviceRecords", {
      title: args.title,
      titleReading: args.titleReading,
      url: args.url,
      ogpImage: args.ogpImage,
      ogpDescription: args.ogpDescription,
      memo: args.memo,
      visibility: args.visibility,
      userId: user.userId,
      familyId: user.familyId,
      credentials: args.credentials,
      tags: args.tags,
      updatedAt: Date.now(),
    });

    return recordId;
  },
});

export const updateRecord = familyBoundMutation({
  args: {
    id: v.id("serviceRecords"),
    data: v.object({
      title: v.string(),
      titleReading: v.optional(v.string()),
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
          passwordHintDekEncrypted: v.optional(v.string()),
          passwordHintDekIv: v.optional(v.string()),
        }),
      ),
      tags: v.array(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const parsed = ConvexRecordInputSchema.safeParse(args.data);
    if (!parsed.success) {
      throw new Error(
        `Validation failed: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
      );
    }

    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    // アクセス権のチェック（IDOR対策の確実な実行）
    requireRecordAccess(ctx.user, record);

    await ctx.db.patch(args.id, {
      ...args.data,
      updatedAt: Date.now(),
    });
  },
});

export const deleteRecord = familyBoundMutation({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    // アクセス権のチェック（IDOR対策の確実な実行）
    requireRecordAccess(ctx.user, record);

    await ctx.db.delete(args.id);
  },
});

export const deleteRecords = familyBoundMutation({
  args: { ids: v.array(v.id("serviceRecords")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (!record) continue;

      // アクセス権のチェック（IDOR対策の確実な実行）
      requireRecordAccess(ctx.user, record);

      await ctx.db.delete(id);
    }
  },
});

export const importRecords = familyBoundMutation({
  args: {
    records: v.array(
      v.object({
        title: v.string(),
        titleReading: v.optional(v.string()),
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
            passwordHintDekEncrypted: v.optional(v.string()),
            passwordHintDekIv: v.optional(v.string()),
          }),
        ),
        tags: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

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
            reason: parsed.error.issues
              .map((issue) => issue.message)
              .join(", "),
          });
          continue;
        }
        await ctx.db.insert("serviceRecords", {
          title: record.title,
          titleReading: record.titleReading,
          url: record.url,
          ogpImage: record.ogpImage,
          ogpDescription: record.ogpDescription,
          memo: record.memo,
          visibility: record.visibility,
          userId: user.userId,
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

export const bulkUpdateRecords = familyBoundMutation({
  args: {
    ids: v.array(v.id("serviceRecords")),
    data: v.object({
      visibility: v.optional(
        v.union(v.literal("PRIVATE"), v.literal("SHARED")),
      ),
      tags: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (!record) continue;

      // アクセス権のチェック（IDOR対策の確実な実行）
      requireRecordAccess(ctx.user, record);

      const patchData: {
        visibility?: "PRIVATE" | "SHARED";
        tags?: string[];
        updatedAt?: number;
      } = {};

      if (args.data.visibility !== undefined) {
        patchData.visibility = args.data.visibility;
      }

      if (args.data.tags !== undefined) {
        const mergedTags = Array.from(
          new Set([...record.tags, ...args.data.tags]),
        );
        patchData.tags = mergedTags;
      }

      if (Object.keys(patchData).length > 0) {
        patchData.updatedAt = Date.now();
        await ctx.db.patch(id, patchData);
      }
    }
  },
});

import { v } from "convex/values";
import { z } from "zod";
import { CredentialInputSchema, RecordInputSchema } from "../src/utils/schemas";
import type { Doc } from "./_generated/dataModel";
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
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    let records: Doc<"serviceRecords">[] = [];
    if (user.familyId) {
      // 家族所属時：その家族内の自分自身のレコード（PRIVATE含む）と家族共有(SHARED)のレコードを取得
      records = await ctx.db
        .query("serviceRecords")
        .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
        .filter((q) =>
          q.or(
            q.eq(q.field("accountId"), user._id),
            q.eq(q.field("visibility"), "SHARED"),
          ),
        )
        .collect();
    } else {
      // 家族未所属時：自身が作成した家族未所属のレコードのみ
      records = await ctx.db
        .query("serviceRecords")
        .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
        .filter((q) => q.eq(q.field("familyId"), undefined))
        .collect();
    }

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
      if (args.sort === "name-asc")
        return (a.titleReading || a.title).localeCompare(
          b.titleReading || b.title,
        );
      if (args.sort === "name-desc")
        return (b.titleReading || b.title).localeCompare(
          a.titleReading || a.title,
        );
      if (args.sort === "url-asc")
        return (a.url || "").localeCompare(b.url || "");
      if (args.sort === "url-desc")
        return (b.url || "").localeCompare(a.url || "");
      if (args.sort === "date-asc" || args.sort === "updatedAt-asc")
        return a.updatedAt - b.updatedAt;
      if (args.sort === "date-desc" || args.sort === "updatedAt-desc")
        return b.updatedAt - a.updatedAt;
      // default: name-asc
      return a.title.localeCompare(b.title);
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

    // TODO: `const recordOwner = await ctx.db.get(record.accountId);` へマイグレ後に戻す
    const recordOwner = record.accountId
      ? await ctx.db.get(record.accountId)
      : await ctx.db
          .query("users")
          .withIndex("by_userId", (q) => q.eq("userId", record.userId))
          .first();

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

    let visibleRecords: Doc<"serviceRecords">[] = [];
    if (user.familyId) {
      visibleRecords = await ctx.db
        .query("serviceRecords")
        .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
        .filter((q) =>
          q.or(
            q.eq(q.field("accountId"), user._id),
            q.eq(q.field("visibility"), "SHARED"),
          ),
        )
        .collect();
    } else {
      visibleRecords = await ctx.db
        .query("serviceRecords")
        .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
        .filter((q) => q.eq(q.field("familyId"), undefined))
        .collect();
    }

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

    if (user.familyId) {
      return await ctx.db
        .query("serviceRecords")
        .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
        .filter((q) => q.eq(q.field("accountId"), user._id))
        .collect();
    }

    return await ctx.db
      .query("serviceRecords")
      .withIndex("by_accountId", (q) => q.eq("accountId", user._id))
      .filter((q) => q.eq(q.field("familyId"), undefined))
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
      accountId: user._id,
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
      titleReading: args.data.titleReading ?? record.titleReading,
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
          accountId: user._id,
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

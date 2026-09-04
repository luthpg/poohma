import { v } from "convex/values";
import { z } from "zod";
import { computeSortKey } from "../src/utils/index-group";
import {
  CredentialInputSchema,
  MAX_CREDENTIALS_PER_RECORD,
  MAX_TAGS_PER_RECORD,
  RecordInputSchema,
} from "../src/utils/schemas";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  authenticatedMutation,
  authenticatedQuery,
  familyBoundMutation,
} from "./customBuilders";
import {
  getEffectiveAdmins,
  getEffectiveOwnerFamilyId,
  getEffectiveOwnerType,
  requireAdminAccess,
  requireContentAccess,
} from "./rls";

const ConvexCredentialInputSchema = CredentialInputSchema.extend({
  id: z.string().optional(),
});

const ConvexRecordInputSchema = RecordInputSchema.extend({
  credentials: z
    .array(ConvexCredentialInputSchema)
    .max(
      MAX_CREDENTIALS_PER_RECORD,
      `アカウント情報は${MAX_CREDENTIALS_PER_RECORD}件まで登録できます`,
    ),
});

/**
 * レコードに紐づくクレデンシャル一覧を取得するヘルパー
 */
export async function getCredentialsForRecord(
  ctx: { db: QueryCtx["db"] | MutationCtx["db"] },
  recordId: Id<"serviceRecords">,
): Promise<Doc<"credentials">[]> {
  const creds = await ctx.db
    .query("credentials")
    .withIndex("by_recordId", (i) => i.eq("recordId", recordId))
    .collect();
  return creds.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * レコードに紐づく全クレデンシャルをカスケード削除するヘルパー
 */
export async function deleteCredentialsForRecord(
  ctx: { db: MutationCtx["db"] },
  recordId: Id<"serviceRecords">,
) {
  const creds = await ctx.db
    .query("credentials")
    .withIndex("by_recordId", (i) => i.eq("recordId", recordId))
    .collect();
  for (const c of creds) {
    await ctx.db.delete(c._id);
  }
}

/**
 * ユーザーがアクセス可能な可視レコード（または所有レコード）を取得するヘルパー
 * by_family_sortKey インデックスにより他家族のデータをスキャンせず高速取得
 */
async function collectVisibleRecords(
  ctx: { db: QueryCtx["db"] },
  user: Doc<"users">,
  ownedOnly = false,
): Promise<Doc<"serviceRecords">[]> {
  if (user.familyId) {
    const familyRecords = await ctx.db
      .query("serviceRecords")
      .withIndex("by_family_sortKey", (i) => i.eq("familyId", user.familyId))
      .collect();

    if (ownedOnly) {
      return familyRecords.filter((r) => {
        const ownerType = getEffectiveOwnerType(r);
        const ownerFamilyId = getEffectiveOwnerFamilyId(r);
        const admins = getEffectiveAdmins(r);
        return (
          (ownerType === "user" && r.accountId === user._id) ||
          (ownerType === "family" &&
            ownerFamilyId === user.familyId &&
            admins.includes(user._id))
        );
      });
    }
    return familyRecords.filter((r) => {
      const ownerType = getEffectiveOwnerType(r);
      const ownerFamilyId = getEffectiveOwnerFamilyId(r);
      return (
        (ownerType === "family" && ownerFamilyId === user.familyId) ||
        (ownerType === "user" && r.accountId === user._id)
      );
    });
  }

  // 家族未所属の場合
  const personalRecords = await ctx.db
    .query("serviceRecords")
    .withIndex("by_accountId", (i) => i.eq("accountId", user._id))
    .collect();

  return personalRecords.filter((r) => getEffectiveOwnerType(r) === "user");
}

// === Queries ===

export const getRecords = authenticatedQuery({
  args: {
    q: v.optional(v.string()),
    tag: v.optional(v.string()),
    sort: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    let records = await collectVisibleRecords(ctx, user);

    if (args.tag) {
      records = records.filter((r) => r.tags.includes(args.tag as string));
    }

    // 各レコードに紐づく credentials を一括取得
    const recordsWithCredentials = await Promise.all(
      records.map(async (record) => {
        const creds = await getCredentialsForRecord(ctx, record._id);
        const mappedCreds = creds.map((c) => ({
          _id: c._id,
          id: c._id,
          label: c.label,
          loginId: c.loginId,
          passwordHint: c.passwordHint,
          passwordHintIv: c.passwordHintIv,
          passwordHintDekEncrypted: c.passwordHintDekEncrypted,
          passwordHintDekIv: c.passwordHintDekIv,
        }));
        return {
          ...record,
          credentials: mappedCreds,
        };
      }),
    );

    let filtered = recordsWithCredentials;

    if (args.q) {
      const q = args.q.toLowerCase();
      filtered = filtered.filter(
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

    // ソート（args.sort 未指定時も sortKey による既定ソートを適用）
    filtered.sort((a, b) => {
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
      return (a.sortKey || a.title).localeCompare(b.sortKey || b.title);
    });

    return filtered;
  },
});

export const getRecordDetail = authenticatedQuery({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) {
      throw new Error("Record not found");
    }

    // アクセス権のチェック（IDOR対策）
    requireContentAccess(ctx.user, record);

    const recordOwner = await ctx.db.get(record.accountId);

    // 管理者ユーザー一覧の情報を取得
    const adminDocs = await Promise.all(
      (record.admins ?? []).map((adminId) => ctx.db.get(adminId)),
    );
    const admins = adminDocs
      .filter((u): u is Doc<"users"> => u != null)
      .map((u) => ({
        _id: u._id,
        displayName: u.displayName,
        email: u.email,
      }));

    // credentialsテーブルからクレデンシャル一覧を取得
    const creds = await getCredentialsForRecord(ctx, record._id);
    const mappedCredentials = creds.map((c) => ({
      _id: c._id,
      id: c._id,
      label: c.label,
      loginId: c.loginId,
      passwordHint: c.passwordHint,
      passwordHintIv: c.passwordHintIv,
      passwordHintDekEncrypted: c.passwordHintDekEncrypted,
      passwordHintDekIv: c.passwordHintDekIv,
    }));

    return {
      ...record,
      credentials: mappedCredentials,
      user: recordOwner
        ? {
            displayName: recordOwner.displayName,
            email: recordOwner.email,
          }
        : null,
      adminUsers: admins,
    };
  },
});

export const getAvailableTags = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;

    const visibleRecords = await collectVisibleRecords(ctx, user);

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
    const records = await collectVisibleRecords(ctx, user, true);

    const members = user.familyId
      ? await ctx.db
          .query("users")
          .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
          .collect()
      : [user];
    const emailById = new Map(members.map((m) => [m._id, m.email]));

    // 各レコードの管理者メールアドレスとクレデンシャルを付与
    return Promise.all(
      records.map(async (r) => {
        const admins = getEffectiveAdmins(r);
        const creds = await getCredentialsForRecord(ctx, r._id);
        return {
          ...r,
          credentials: creds.map((c) => ({
            _id: c._id,
            id: c._id,
            label: c.label,
            loginId: c.loginId,
            passwordHint: c.passwordHint,
            passwordHintIv: c.passwordHintIv,
            passwordHintDekEncrypted: c.passwordHintDekEncrypted,
            passwordHintDekIv: c.passwordHintDekIv,
          })),
          adminEmails: admins
            .map((id) => emailById.get(id))
            .filter((email): email is string => !!email),
        };
      }),
    );
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
    ownerType: v.optional(v.union(v.literal("user"), v.literal("family"))),
    credentials: v.array(
      v.object({
        id: v.optional(v.string()),
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
    const isFamily = args.ownerType === "family";
    const sortKey = computeSortKey({
      titleReading: args.titleReading,
      title: args.title,
    });
    const now = Date.now();

    const recordId = await ctx.db.insert("serviceRecords", {
      title: args.title,
      titleReading: args.titleReading,
      url: args.url,
      ogpImage: args.ogpImage,
      ogpDescription: args.ogpDescription,
      memo: args.memo,
      userId: user.userId,
      accountId: user._id,
      familyId: user.familyId,
      sortKey,
      ownerType: isFamily ? "family" : "user",
      ownerFamilyId: isFamily ? user.familyId : undefined,
      admins: isFamily ? [user._id] : [],
      tags: args.tags,
      updatedAt: now,
    });

    // credentials テーブルへ挿入
    for (let i = 0; i < args.credentials.length; i++) {
      const c = args.credentials[i];
      await ctx.db.insert("credentials", {
        recordId,
        label: c.label,
        loginId: c.loginId,
        passwordHint: c.passwordHint,
        passwordHintIv: c.passwordHintIv,
        passwordHintDekEncrypted: c.passwordHintDekEncrypted,
        passwordHintDekIv: c.passwordHintDekIv,
        order: i,
        updatedAt: now,
      });
    }

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
      ownerType: v.optional(v.union(v.literal("user"), v.literal("family"))),
      credentials: v.array(
        v.object({
          id: v.optional(v.string()),
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

    // コンテンツ編集権限の確認
    requireContentAccess(ctx.user, record);

    const now = Date.now();
    const patchData: Partial<Doc<"serviceRecords">> = {
      title: args.data.title,
      titleReading:
        args.data.titleReading !== undefined
          ? args.data.titleReading
          : record.titleReading,
      url: args.data.url,
      ogpImage: args.data.ogpImage,
      ogpDescription: args.data.ogpDescription,
      memo: args.data.memo,
      tags: args.data.tags,
      updatedAt: now,
    };

    // ソートキーの更新
    patchData.sortKey = computeSortKey({
      titleReading: patchData.titleReading,
      title: patchData.title ?? record.title,
    });

    // ownerType の変更制御
    const currentOwnerType = getEffectiveOwnerType(record);
    if (
      args.data.ownerType !== undefined &&
      args.data.ownerType !== currentOwnerType
    ) {
      if (currentOwnerType === "user" && args.data.ownerType === "family") {
        if (record.accountId !== ctx.user._id) {
          throw new Error("Forbidden: Only the owner can share this record");
        }
        patchData.ownerType = "family";
        patchData.ownerFamilyId = ctx.user.familyId;
        patchData.admins = [ctx.user._id];
      } else if (
        currentOwnerType === "family" &&
        args.data.ownerType === "user"
      ) {
        requireAdminAccess(ctx.user, record);
        patchData.ownerType = "user";
        patchData.userId = ctx.user.userId;
        patchData.accountId = ctx.user._id;
        patchData.ownerFamilyId = undefined;
        patchData.admins = [];
      }
    }

    await ctx.db.patch(args.id, patchData);

    // credentials の同期
    const existingCreds = await ctx.db
      .query("credentials")
      .withIndex("by_recordId", (i) => i.eq("recordId", args.id))
      .collect();

    const existingMap = new Map(existingCreds.map((c) => [c._id as string, c]));
    const retainedIds = new Set<string>();

    for (let i = 0; i < args.data.credentials.length; i++) {
      const c = args.data.credentials[i];
      const normalizedId = c.id
        ? ctx.db.normalizeId("credentials", c.id)
        : null;

      if (normalizedId && existingMap.has(normalizedId)) {
        // 既存クレデンシャルの更新
        retainedIds.add(normalizedId);
        await ctx.db.patch(normalizedId, {
          label: c.label,
          loginId: c.loginId,
          passwordHint: c.passwordHint,
          passwordHintIv: c.passwordHintIv,
          passwordHintDekEncrypted: c.passwordHintDekEncrypted,
          passwordHintDekIv: c.passwordHintDekIv,
          order: i,
          updatedAt: now,
        });
      } else {
        // 新規クレデンシャルの作成
        const newId = await ctx.db.insert("credentials", {
          recordId: args.id,
          label: c.label,
          loginId: c.loginId,
          passwordHint: c.passwordHint,
          passwordHintIv: c.passwordHintIv,
          passwordHintDekEncrypted: c.passwordHintDekEncrypted,
          passwordHintDekIv: c.passwordHintDekIv,
          order: i,
          updatedAt: now,
        });
        retainedIds.add(newId);
      }
    }

    // 削除されたクレデンシャルを物理削除
    for (const cred of existingCreds) {
      if (!retainedIds.has(cred._id)) {
        await ctx.db.delete(cred._id);
      }
    }
  },
});

// === クレデンシャル単位の個別CRUD ===

export const createCredential = familyBoundMutation({
  args: {
    recordId: v.id("serviceRecords"),
    label: v.optional(v.string()),
    loginId: v.optional(v.string()),
    passwordHint: v.optional(v.string()),
    passwordHintIv: v.optional(v.string()),
    passwordHintDekEncrypted: v.optional(v.string()),
    passwordHintDekIv: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Record not found");
    requireContentAccess(ctx.user, record);

    const existingCreds = await ctx.db
      .query("credentials")
      .withIndex("by_recordId", (i) => i.eq("recordId", args.recordId))
      .collect();

    if (existingCreds.length >= MAX_CREDENTIALS_PER_RECORD) {
      throw new Error(
        `アカウント情報は${MAX_CREDENTIALS_PER_RECORD}件まで登録できます`,
      );
    }

    const now = Date.now();
    const defaultOrder =
      existingCreds.length > 0
        ? Math.max(...existingCreds.map((c) => c.order ?? 0)) + 1
        : 0;

    const credId = await ctx.db.insert("credentials", {
      recordId: args.recordId,
      label: args.label,
      loginId: args.loginId,
      passwordHint: args.passwordHint,
      passwordHintIv: args.passwordHintIv,
      passwordHintDekEncrypted: args.passwordHintDekEncrypted,
      passwordHintDekIv: args.passwordHintDekIv,
      order: args.order ?? defaultOrder,
      updatedAt: now,
    });

    await ctx.db.patch(args.recordId, { updatedAt: now });
    return credId;
  },
});

export const updateCredential = familyBoundMutation({
  args: {
    id: v.id("credentials"),
    label: v.optional(v.string()),
    loginId: v.optional(v.string()),
    passwordHint: v.optional(v.string()),
    passwordHintIv: v.optional(v.string()),
    passwordHintDekEncrypted: v.optional(v.string()),
    passwordHintDekIv: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cred = await ctx.db.get(args.id);
    if (!cred) throw new Error("Credential not found");

    const record = await ctx.db.get(cred.recordId);
    if (!record) throw new Error("Record not found");
    requireContentAccess(ctx.user, record);

    const now = Date.now();
    await ctx.db.patch(args.id, {
      label: args.label,
      loginId: args.loginId,
      passwordHint: args.passwordHint,
      passwordHintIv: args.passwordHintIv,
      passwordHintDekEncrypted: args.passwordHintDekEncrypted,
      passwordHintDekIv: args.passwordHintDekIv,
      order: args.order !== undefined ? args.order : cred.order,
      updatedAt: now,
    });

    await ctx.db.patch(record._id, { updatedAt: now });
  },
});

export const deleteCredential = familyBoundMutation({
  args: { id: v.id("credentials") },
  handler: async (ctx, args) => {
    const cred = await ctx.db.get(args.id);
    if (!cred) throw new Error("Credential not found");

    const record = await ctx.db.get(cred.recordId);
    if (!record) throw new Error("Record not found");
    requireContentAccess(ctx.user, record);

    await ctx.db.delete(args.id);
    await ctx.db.patch(record._id, { updatedAt: Date.now() });
  },
});

export const deleteRecord = familyBoundMutation({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    // 個人所有者または家族管理者のみ削除可能
    requireAdminAccess(ctx.user, record);

    // カスケード削除
    await deleteCredentialsForRecord(ctx, args.id);
    await ctx.db.delete(args.id);
  },
});

export const deleteRecords = familyBoundMutation({
  args: { ids: v.array(v.id("serviceRecords")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (!record) continue;

      requireAdminAccess(ctx.user, record);
      await deleteCredentialsForRecord(ctx, id);
      await ctx.db.delete(id);
    }
  },
});

/**
 * 個人レコードをワンタップで家族共有へ移行
 */
export const shareRecord = familyBoundMutation({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    if (record.ownerType !== "user" || record.accountId !== ctx.user._id) {
      throw new Error(
        "Forbidden: Only the personal owner can share this record",
      );
    }

    await ctx.db.patch(args.id, {
      ownerType: "family",
      ownerFamilyId: ctx.user.familyId,
      admins: [ctx.user._id],
      updatedAt: Date.now(),
    });

    const family = await ctx.db.get(ctx.familyId);
    const familyName = family?.name ?? "家族";
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";

    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: ctx.user.email,
        payload: {
          template: "shareSettingChanged",
          props: {
            displayName: ctx.user.displayName || "メンバー",
            familyName,
            changedByDisplayName: ctx.user.displayName || "メンバー",
            changedAt: Date.now(),
            changeSummary: `「${record.title}」が家族共有に設定されました`,
            ctaUrl: `${appUrl}/records`,
          },
        },
      },
    );
  },
});

/**
 * 共有レコードをワンタップで共有解除（実行者が新個人所有者）
 */
export const unshareRecord = familyBoundMutation({
  args: { id: v.id("serviceRecords") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    requireAdminAccess(ctx.user, record);

    await ctx.db.patch(args.id, {
      ownerType: "user",
      userId: ctx.user.userId,
      accountId: ctx.user._id,
      ownerFamilyId: undefined,
      admins: [],
      updatedAt: Date.now(),
    });

    const family = await ctx.db.get(ctx.familyId);
    const familyName = family?.name ?? "家族";
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";

    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: ctx.user.email,
        payload: {
          template: "shareSettingChanged",
          props: {
            displayName: ctx.user.displayName || "メンバー",
            familyName,
            changedByDisplayName: ctx.user.displayName || "メンバー",
            changedAt: Date.now(),
            changeSummary: `「${record.title}」の共有が解除され、個人所有に変更されました`,
            ctaUrl: `${appUrl}/records`,
          },
        },
      },
    );
  },
});

/**
 * 共有レコードの管理者を同一家族内メンバーから追加
 */
export const addRecordAdmin = familyBoundMutation({
  args: {
    id: v.id("serviceRecords"),
    targetAccountId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    requireAdminAccess(ctx.user, record);

    const targetUser = await ctx.db.get(args.targetAccountId);
    if (!targetUser || targetUser.familyId !== ctx.user.familyId) {
      throw new Error("Target user is not a member of this family");
    }

    const admins = record.admins ?? [];
    if (!admins.includes(args.targetAccountId)) {
      const newAdmins = [...admins, args.targetAccountId];
      await ctx.db.patch(args.id, {
        admins: newAdmins,
        updatedAt: Date.now(),
      });

      const family = await ctx.db.get(ctx.familyId);
      const familyName = family?.name ?? "家族";
      const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
      const now = Date.now();

      // 新管理者一覧の全メンバーに通知
      for (const adminId of newAdmins) {
        const adminDoc = await ctx.db.get(adminId);
        if (adminDoc) {
          await ctx.scheduler.runAfter(
            0,
            internal.actions.sendTemplatedEmailInternal,
            {
              email: adminDoc.email,
              payload: {
                template: "recordAdminChanged",
                props: {
                  displayName: adminDoc.displayName || "メンバー",
                  familyName,
                  accountName: record.title,
                  event: "added",
                  changedAccountDisplayName:
                    targetUser.displayName || "メンバー",
                  changedByDisplayName: ctx.user.displayName || "メンバー",
                  changedAt: now,
                  ctaUrl: `${appUrl}/records`,
                },
              },
            },
          );
        }
      }
    }
  },
});

/**
 * 共有レコードの管理者を降格（最後の1人の削除は拒否）
 */
export const removeRecordAdmin = familyBoundMutation({
  args: {
    id: v.id("serviceRecords"),
    targetAccountId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.id);
    if (!record) throw new Error("Record not found");

    requireAdminAccess(ctx.user, record);

    const targetUser = await ctx.db.get(args.targetAccountId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    const admins = record.admins ?? [];
    if (!admins.includes(args.targetAccountId)) {
      throw new Error("Target user is not an administrator of this record");
    }
    if (admins.length <= 1) {
      throw new Error("管理者が0人になるため削除できません");
    }

    const newAdmins = admins.filter((id) => id !== args.targetAccountId);
    await ctx.db.patch(args.id, {
      admins: newAdmins,
      updatedAt: Date.now(),
    });

    const family = await ctx.db.get(ctx.familyId);
    const familyName = family?.name ?? "家族";
    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";
    const now = Date.now();

    // 削除された本人を含む関係者に通知
    const notifyUserIds = Array.from(
      new Set([...newAdmins, args.targetAccountId]),
    );
    for (const userId of notifyUserIds) {
      const userDoc = await ctx.db.get(userId);
      if (userDoc) {
        await ctx.scheduler.runAfter(
          0,
          internal.actions.sendTemplatedEmailInternal,
          {
            email: userDoc.email,
            payload: {
              template: "recordAdminChanged",
              props: {
                displayName: userDoc.displayName || "メンバー",
                familyName,
                accountName: record.title,
                event: "removed",
                changedAccountDisplayName: targetUser.displayName || "メンバー",
                changedByDisplayName: ctx.user.displayName || "メンバー",
                changedAt: now,
                ctaUrl: `${appUrl}/records`,
              },
            },
          },
        );
      }
    }
  },
});

/**
 * 個人所有レコードを一括共有
 */
export const bulkShareRecords = familyBoundMutation({
  args: { ids: v.array(v.id("serviceRecords")) },
  handler: async (ctx, args) => {
    let count = 0;
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (
        record &&
        record.ownerType === "user" &&
        record.accountId === ctx.user._id
      ) {
        await ctx.db.patch(id, {
          ownerType: "family",
          ownerFamilyId: ctx.user.familyId,
          admins: [ctx.user._id],
          updatedAt: Date.now(),
        });
        count++;
      }
    }

    if (count > 0) {
      const family = await ctx.db.get(ctx.familyId);
      const familyName = family?.name ?? "家族";
      const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";

      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: ctx.user.email,
          payload: {
            template: "shareSettingChanged",
            props: {
              displayName: ctx.user.displayName || "メンバー",
              familyName,
              changedByDisplayName: ctx.user.displayName || "メンバー",
              changedAt: Date.now(),
              changeSummary: `${count}件のアカウント情報が家族共有に設定されました`,
              ctaUrl: `${appUrl}/records`,
            },
          },
        },
      );
    }

    return { success: true, count, sharedCount: count };
  },
});

/**
 * 共有レコードを一括共有解除
 */
export const bulkUnshareRecords = familyBoundMutation({
  args: { ids: v.array(v.id("serviceRecords")) },
  handler: async (ctx, args) => {
    let count = 0;
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (
        record &&
        record.ownerType === "family" &&
        (record.admins ?? []).includes(ctx.user._id)
      ) {
        await ctx.db.patch(id, {
          ownerType: "user",
          userId: ctx.user.userId,
          accountId: ctx.user._id,
          ownerFamilyId: undefined,
          admins: [],
          updatedAt: Date.now(),
        });
        count++;
      }
    }

    if (count > 0) {
      const family = await ctx.db.get(ctx.familyId);
      const familyName = family?.name ?? "家族";
      const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";

      await ctx.scheduler.runAfter(
        0,
        internal.actions.sendTemplatedEmailInternal,
        {
          email: ctx.user.email,
          payload: {
            template: "shareSettingChanged",
            props: {
              displayName: ctx.user.displayName || "メンバー",
              familyName,
              changedByDisplayName: ctx.user.displayName || "メンバー",
              changedAt: Date.now(),
              changeSummary: `${count}件のアカウント情報の家族共有が解除されました`,
              ctaUrl: `${appUrl}/records`,
            },
          },
        },
      );
    }

    return { success: true, count, unsharedCount: count };
  },
});

/**
 * CSVエクスポート用レコード取得（サーバー側で取得と同時に通知をスケジュール・スキップ防止）
 */
export const fetchRecordsForExport = authenticatedMutation({
  args: {
    deviceName: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const records = await collectVisibleRecords(ctx, user, true);

    const members = user.familyId
      ? await ctx.db
          .query("users")
          .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
          .collect()
      : [user];
    const emailById = new Map(members.map((m) => [m._id, m.email]));

    const appUrl = process.env.APP_URL || "https://poohma.ciderlabs.link";

    // エクスポート実行通知メールをスケジュール（サーバー側確実発火）
    await ctx.scheduler.runAfter(
      0,
      internal.actions.sendTemplatedEmailInternal,
      {
        email: user.email,
        payload: {
          template: "csvExported",
          props: {
            displayName: user.displayName || "メンバー",
            exportedAt: Date.now(),
            recordCount: records.length,
            deviceName: args.deviceName,
            browser: args.browser,
            os: args.os,
            ipAddress: args.ipAddress,
            location: args.location,
            ctaUrl: `${appUrl}/settings`,
          },
        },
      },
    );

    return Promise.all(
      records.map(async (r) => {
        const admins = getEffectiveAdmins(r);
        const creds = await getCredentialsForRecord(ctx, r._id);
        return {
          ...r,
          credentials: creds.map((c) => ({
            _id: c._id,
            id: c._id,
            label: c.label,
            loginId: c.loginId,
            passwordHint: c.passwordHint,
            passwordHintIv: c.passwordHintIv,
            passwordHintDekEncrypted: c.passwordHintDekEncrypted,
            passwordHintDekIv: c.passwordHintDekIv,
          })),
          adminEmails: (admins ?? [])
            .map((id) => emailById.get(id))
            .filter((email): email is string => !!email),
        };
      }),
    );
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
        ownerType: v.optional(v.union(v.literal("user"), v.literal("family"))),
        admins: v.optional(v.array(v.string())),
        adminEmails: v.optional(v.array(v.string())),
        credentials: v.array(
          v.object({
            id: v.optional(v.string()),
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

    // 家族内メンバーを事前に取得してメールアドレスからPoohMa IDを逆引き可能にする
    const familyMembers = user.familyId
      ? await ctx.db
          .query("users")
          .withIndex("by_familyId", (q) => q.eq("familyId", user.familyId))
          .collect()
      : [];

    const emailToAccountMap = new Map<string, Id<"users">[]>();
    for (const m of familyMembers) {
      if (m.email) {
        const lower = m.email.toLowerCase();
        const existing = emailToAccountMap.get(lower) || [];
        existing.push(m._id);
        emailToAccountMap.set(lower, existing);
      }
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

        const isFamily = record.ownerType === "family";
        const sortKey = computeSortKey({
          titleReading: record.titleReading,
          title: record.title,
        });

        let resolvedAdmins: Id<"users">[] = [];
        if (isFamily) {
          const resolvedSet = new Set<Id<"users">>();
          // インポート実行者を必ず含める
          resolvedSet.add(user._id);

          const candidateEmails = record.adminEmails ?? record.admins ?? [];
          if (candidateEmails.length > 0) {
            for (const email of candidateEmails) {
              const matched = emailToAccountMap.get(email.toLowerCase());
              if (matched) {
                for (const accId of matched) {
                  resolvedSet.add(accId);
                }
              }
            }
          }
          resolvedAdmins = Array.from(resolvedSet);
        }

        const now = Date.now();
        const recordId = await ctx.db.insert("serviceRecords", {
          title: record.title,
          titleReading: record.titleReading,
          url: record.url,
          ogpImage: record.ogpImage,
          ogpDescription: record.ogpDescription,
          memo: record.memo,
          userId: user.userId,
          accountId: user._id,
          familyId: user.familyId,
          sortKey,
          ownerType: isFamily ? "family" : "user",
          ownerFamilyId: isFamily ? user.familyId : undefined,
          admins: resolvedAdmins,
          tags: record.tags,
          updatedAt: now,
        });

        for (let j = 0; j < record.credentials.length; j++) {
          const cred = record.credentials[j];
          await ctx.db.insert("credentials", {
            recordId,
            label: cred.label,
            loginId: cred.loginId,
            passwordHint: cred.passwordHint,
            passwordHintIv: cred.passwordHintIv,
            passwordHintDekEncrypted: cred.passwordHintDekEncrypted,
            passwordHintDekIv: cred.passwordHintDekIv,
            order: j,
            updatedAt: now,
          });
        }

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
      tags: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const record = await ctx.db.get(id);
      if (!record) continue;

      requireContentAccess(ctx.user, record);

      if (args.data.tags !== undefined) {
        const newTags = Array.from(
          new Set([...record.tags, ...args.data.tags]),
        );
        if (newTags.length > MAX_TAGS_PER_RECORD) {
          throw new Error(
            `タグは${MAX_TAGS_PER_RECORD}個まで登録できます (レコード「${record.title}」で超過)`,
          );
        }
        await ctx.db.patch(id, {
          tags: newTags,
          updatedAt: Date.now(),
        });
      }
    }
  },
});


import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";

export const getFamilyMembersByFamilyId = async (
  ctx: QueryCtx,
  familyId: Id<"families">,
) => {
  const family = await ctx.db.get(familyId);
  if (!family) return null;

  const usersInFamily = await ctx.db
    .query("users")
    .filter((q) => q.eq(q.field("familyId"), family._id))
    .collect();

  return {
    ...family,
    users: usersInFamily.map((u) => ({
      id: u.userId,
      email: u.email,
      displayName: u.displayName,
    })),
    id: family._id,
  };
};

export const getFamilyMembersById = async (ctx: QueryCtx, userId: string) => {
  const user = await ctx.db
    .query("users")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  if (!user?.familyId) return null;

  return await getFamilyMembersByFamilyId(ctx, user.familyId);
};

export const getFamilyMembersInternal = internalQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, { familyId }) => {
    return await getFamilyMembersByFamilyId(ctx, familyId);
  },
});

export const getFamilyMembers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!user?.familyId) return null;

    return await getFamilyMembersById(ctx, userId);
  },
});

export const createFamily = mutation({
  args: {
    name: v.string(),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!user) throw new Error("User not found");
    if (user.familyId) throw new Error("Already in a family");

    const familyId = await ctx.db.insert("families", {
      name: args.name,
      masterKeyEncrypted: args.masterKeyEncrypted,
      masterKeyIv: args.masterKeyIv,
      masterKeySalt: args.masterKeySalt,
      updatedAt: Date.now(),
    });

    await ctx.db.patch(user._id, { familyId });

    await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
      email: user.email,
      subject: "PoohMaへようこそ",
      body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${user.displayName} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族名「${args.name}」へ参加が完了しました。\n\n※なんらかの誤りであると考えられる場合はお手数ですが運営にご連絡ください。\n\n[PoohMa]\nhttps://poohma.vercel.app/`,
    });

    return familyId;
  },
});

export const joinFamily = mutation({
  args: {
    inviteCode: v.id("families"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const user = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!user) throw new Error("User not found");
    if (user.familyId) throw new Error("Already in a family");

    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    await ctx.db.patch(user._id, { familyId: family._id });

    await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
      email: user.email,
      subject: "PoohMaへようこそ",
      body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${user.displayName} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族名「${family.name}」へ参加が完了しました。\n\n※なんらかの誤りであると考えられる場合はお手数ですが運営にご連絡ください。\n\n[PoohMa]\nhttps://poohma.vercel.app/`,
    });

    const familyMembers = await ctx.runQuery(
      internal.families.getFamilyMembersInternal,
      {
        familyId: family._id,
      },
    );
    if (!familyMembers) throw new Error("Family members not found");
    await Promise.all(
      familyMembers.users.map((member) => {
        if (member.email === user.email) return null;
        return ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
          email: member.email,
          subject: `[PoohMa] ${family.name} に新しいメンバーが参加しました！`,
          body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${member.displayName} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族名「${family.name}」へ新しいメンバーが参加しました。\n\n※なんらかの誤りであると考えられる場合はお手数ですが運営にご連絡ください。\n\n[PoohMa]\nhttps://poohma.vercel.app/`,
        });
      }),
    );

    return family._id;
  },
});

export const getFamilyInfoByInviteCode = query({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    return {
      id: family._id,
      name: family.name,
      masterKeyEncrypted: family.masterKeyEncrypted,
      masterKeyIv: family.masterKeyIv,
      masterKeySalt: family.masterKeySalt,
    };
  },
});

export const getRecordsForReEncryption = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return records
      .map((record) => ({
        _id: record._id,
        id: record._id,
        credentials: record.credentials
          .filter((c) => c.passwordHint && c.passwordHintIv)
          .map((c) => ({
            id: c.id,
            passwordHint: c.passwordHint,
            passwordHintIv: c.passwordHintIv,
          })),
      }))
      .filter((record) => record.credentials.length > 0);
  },
});

export const changeFamily = mutation({
  args: {
    action: v.union(v.literal("create"), v.literal("join")),
    name: v.optional(v.string()),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    inviteCode: v.optional(v.string()), // string as it comes from form, we'll validate
    credentials: v.array(
      v.object({
        id: v.string(),
        passwordHint: v.string(),
        passwordHintIv: v.string(),
      }),
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

    if (!user) throw new Error("User not found");

    let parsedTargetFamilyId: Id<"families">;

    if (args.action === "create") {
      if (
        !args.name ||
        !args.masterKeyEncrypted ||
        !args.masterKeyIv ||
        !args.masterKeySalt
      ) {
        throw new Error("Missing fields for create");
      }
      parsedTargetFamilyId = await ctx.db.insert("families", {
        name: args.name,
        masterKeyEncrypted: args.masterKeyEncrypted,
        masterKeyIv: args.masterKeyIv,
        masterKeySalt: args.masterKeySalt,
        updatedAt: Date.now(),
      });
    } else {
      if (!args.inviteCode) throw new Error("Missing invite code");
      const family = await ctx.db.get(args.inviteCode as Id<"families">);
      if (!family) throw new Error("Invalid invite code");
      parsedTargetFamilyId = family._id;
    }

    // Update user familyId
    await ctx.db.patch(user._id, { familyId: parsedTargetFamilyId });

    // Update familyId for all records owned by user
    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const credUpdates = new Map(args.credentials.map((c) => [c.id, c]));

    for (const record of records) {
      let needsUpdate = false;
      const newCredentials = record.credentials.map((cred) => {
        const update = credUpdates.get(cred.id);
        if (update) {
          needsUpdate = true;
          return {
            ...cred,
            passwordHint: update.passwordHint,
            passwordHintIv: update.passwordHintIv,
          };
        }
        return cred;
      });

      if (record.familyId !== parsedTargetFamilyId || needsUpdate) {
        await ctx.db.patch(record._id, {
          familyId: parsedTargetFamilyId,
          credentials: newCredentials,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
      email: user.email,
      subject: "PoohMaからのお知らせ（家族変更完了）",
      body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${user.displayName} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族名「${args.name}」へ変更が完了しました。\n\n※なんらかの誤りであると考えられる場合はお手数ですが運営にご連絡ください。\n\n[PoohMa]\nhttps://poohma.vercel.app/`,
    });

    return { success: true, familyId: parsedTargetFamilyId };
  },
});

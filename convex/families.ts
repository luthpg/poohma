import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import {
  authenticatedMutation,
  authenticatedQuery,
  familyBoundMutation,
  familyBoundQuery,
} from "./customBuilders";

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

export const getFamilyMembers = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    return await getFamilyMembersById(ctx, user.userId);
  },
});

export const createFamily = authenticatedMutation({
  args: {
    name: v.string(),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

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

export const joinFamily = authenticatedMutation({
  args: {
    inviteCode: v.id("families"),
  },
  handler: async (ctx, args) => {
    const { user } = ctx;

    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    // Verify approved request
    const approvedRequest = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_userId", (q) =>
        q.eq("familyId", family._id).eq("userId", user.userId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .unique();

    if (!approvedRequest) {
      throw new Error(
        "Access denied: You must be approved to join this family",
      );
    }

    await ctx.db.patch(user._id, { familyId: family._id });

    // Delete approved request
    await ctx.db.delete(approvedRequest._id);

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
    if (familyMembers) {
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
    }

    return family._id;
  },
});

export const getFamilyInfoByInviteCode = authenticatedQuery({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    const isMember = user.familyId === family._id;
    const approvedRequest = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_userId", (q) =>
        q.eq("familyId", family._id).eq("userId", user.userId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .unique();

    if (!isMember && !approvedRequest) {
      throw new Error(
        "Access denied: You must be approved to access family keys",
      );
    }

    return {
      id: family._id,
      name: family.name,
      masterKeyEncrypted: family.masterKeyEncrypted,
      masterKeyIv: family.masterKeyIv,
      masterKeySalt: family.masterKeySalt,
    };
  },
});

export const getRecordsForReEncryption = familyBoundQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;

    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
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

export const changeFamily = familyBoundMutation({
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
    const { user } = ctx;
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

      // Verify approved join request
      const approvedRequest = await ctx.db
        .query("joinRequests")
        .withIndex("by_familyId_userId", (q) =>
          q.eq("familyId", family._id).eq("userId", user.userId),
        )
        .filter((q) => q.eq(q.field("status"), "approved"))
        .unique();

      if (!approvedRequest) {
        throw new Error(
          "Access denied: You must be approved to join this family",
        );
      }

      parsedTargetFamilyId = family._id;

      // Delete approved request
      await ctx.db.delete(approvedRequest._id);
    }

    // Update user familyId
    await ctx.db.patch(user._id, { familyId: parsedTargetFamilyId });

    // Update familyId for all records owned by user
    const records = await ctx.db
      .query("serviceRecords")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
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

export const getFamilyPublicInfo = authenticatedQuery({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    return {
      id: family._id,
      name: family.name,
    };
  },
});

export const createJoinRequest = authenticatedMutation({
  args: { inviteCode: v.id("families") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const family = await ctx.db.get(args.inviteCode);
    if (!family) throw new Error("Invalid invite code");

    if (user.familyId === family._id) {
      throw new Error("You are already a member of this family");
    }

    // Check if there is any pending request by this user for ANY family
    const anyPendingRequest = await ctx.db
      .query("joinRequests")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user.userId).eq("status", "pending"),
      )
      .first();

    if (anyPendingRequest) {
      throw new Error(
        "You already have a pending join request for another family. Please cancel it first.",
      );
    }

    // Check if there is already an active (approved) request for this family
    const existingApproved = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_userId", (q) =>
        q.eq("familyId", family._id).eq("userId", user.userId),
      )
      .filter((q) => q.eq(q.field("status"), "approved"))
      .unique();

    if (existingApproved) {
      return existingApproved._id;
    }

    // Delete any rejected requests for this family first
    const rejectedRequest = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_userId", (q) =>
        q.eq("familyId", family._id).eq("userId", user.userId),
      )
      .filter((q) => q.eq(q.field("status"), "rejected"))
      .unique();

    if (rejectedRequest) {
      await ctx.db.delete(rejectedRequest._id);
    }

    const requestId = await ctx.db.insert("joinRequests", {
      familyId: family._id,
      userId: user.userId,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Send email to all existing family members
    const familyMembers = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("familyId"), family._id))
      .collect();

    for (const member of familyMembers) {
      await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
        email: member.email,
        subject: `[PoohMa] 家族「${family.name}」への参加申請が届きました`,
        body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${member.displayName || "メンバー"} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族「${family.name}」に新しい参加申請が届きました。\n\n【申請者】\n表示名: ${user.displayName || "名無し"}\nメールアドレス: ${user.email}\n\n以下のリンクから承認または却下を行ってください。\n\n[PoohMa 家族管理]\nhttps://poohma.vercel.app/family`,
      });
    }

    return requestId;
  },
});

export const cancelJoinRequest = authenticatedMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");

    if (request.userId !== user.userId) {
      throw new Error("Unauthorized: This is not your request");
    }

    if (request.status !== "pending") {
      throw new Error("Only pending requests can be cancelled");
    }

    await ctx.db.delete(request._id);
    return { success: true };
  },
});

export const getMyJoinRequest = authenticatedQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
    const request = await ctx.db
      .query("joinRequests")
      .withIndex("by_userId_status", (q) => q.eq("userId", user.userId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "pending"),
          q.eq(q.field("status"), "approved"),
        ),
      )
      .first();

    if (!request) {
      const rejected = await ctx.db
        .query("joinRequests")
        .withIndex("by_userId_status", (q) =>
          q.eq("userId", user.userId).eq("status", "rejected"),
        )
        .first();
      if (rejected) {
        const family = await ctx.db.get(rejected.familyId);
        return {
          id: rejected._id,
          familyId: rejected.familyId,
          familyName: family?.name || "未知の家族",
          status: "rejected" as const,
        };
      }
      return null;
    }

    const family = await ctx.db.get(request.familyId);
    return {
      id: request._id,
      familyId: request.familyId,
      familyName: family?.name || "未知の家族",
      status: request.status,
    };
  },
});

export const dismissRejectedRequest = authenticatedMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { user } = ctx;
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.userId !== user.userId) throw new Error("Unauthorized");
    if (request.status !== "rejected") {
      throw new Error("Only rejected requests can be dismissed");
    }

    await ctx.db.delete(request._id);
    return { success: true };
  },
});

export const getPendingRequests = familyBoundQuery({
  args: {},
  handler: async (ctx) => {
    const { familyId } = ctx;

    const pendingRequests = await ctx.db
      .query("joinRequests")
      .withIndex("by_familyId_status", (q) =>
        q.eq("familyId", familyId).eq("status", "pending"),
      )
      .collect();

    const results = [];
    for (const req of pendingRequests) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_userId", (q) => q.eq("userId", req.userId))
        .unique();
      results.push({
        id: req._id,
        userId: req.userId,
        status: req.status,
        createdAt: req.createdAt,
        displayName: user?.displayName || "名無し",
        email: user?.email || "",
      });
    }

    return results;
  },
});

export const approveJoinRequest = familyBoundMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { familyId } = ctx;

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.familyId !== familyId) {
      throw new Error("Unauthorized: Request does not belong to your family");
    }
    if (request.status !== "pending") {
      throw new Error("Only pending requests can be approved");
    }

    const applicant = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", request.userId))
      .unique();
    if (!applicant) throw new Error("Applicant not found");

    if (!applicant.familyId) {
      await ctx.db.patch(applicant._id, { familyId });
      await ctx.db.patch(request._id, {
        status: "approved",
        updatedAt: Date.now(),
      });

      const family = await ctx.db.get(familyId);
      await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
        email: applicant.email,
        subject: `[PoohMa] 家族「${family?.name}」への参加申請が承認されました！`,
        body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${applicant.displayName || "メンバー"} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族「${family?.name}」への参加申請が承認されました。\n\nログインして家族の暗号キーをセットアップしてください。\n\n[PoohMa]\nhttps://poohma.vercel.app/family`,
      });
    } else {
      await ctx.db.patch(request._id, {
        status: "approved",
        updatedAt: Date.now(),
      });

      const family = await ctx.db.get(familyId);
      await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
        email: applicant.email,
        subject: `[PoohMa] 家族「${family?.name}」への移行申請が承認されました！`,
        body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${applicant.displayName || "メンバー"} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族「${family?.name}」への移行申請が承認されました。\n\n移行処理を完了するために、アプリにアクセスして新しい家族のパスコードを入力してください。\n\n[PoohMa]\nhttps://poohma.vercel.app/family`,
      });
    }

    return { success: true };
  },
});

export const rejectJoinRequest = familyBoundMutation({
  args: { requestId: v.id("joinRequests") },
  handler: async (ctx, args) => {
    const { familyId } = ctx;

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    if (request.familyId !== familyId) throw new Error("Unauthorized");
    if (request.status !== "pending") {
      throw new Error("Only pending requests can be rejected");
    }

    await ctx.db.patch(request._id, {
      status: "rejected",
      updatedAt: Date.now(),
    });

    const applicant = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", request.userId))
      .unique();

    if (applicant) {
      const family = await ctx.db.get(familyId);
      await ctx.scheduler.runAfter(0, internal.actions.sendEmailInternal, {
        email: applicant.email,
        subject: `[PoohMa] 家族「${family?.name}」への参加申請が見送られました`,
        body: `-=-=-=-=-=-=-=-=-=-\n※本メールは送信専用アドレスから送信しています。\n-=-=-=-=-=-=-=-=-=-\n\n${applicant.displayName || "メンバー"} さん\n\nこんにちは！家族間アカウント管理アプリ「PoohMa」からお知らせです。\n\n家族「${family?.name}」への参加申請は、承認されませんでした。\n詳細については家族メンバーへ直接ご確認ください。\n\n[PoohMa]\nhttps://poohma.vercel.app/`,
      });
    }

    return { success: true };
  },
});

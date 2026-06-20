import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  families: defineTable({
    name: v.string(),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    updatedAt: v.number(),
  }),

  users: defineTable({
    userId: v.string(), // Firebase UID
    email: v.string(),
    displayName: v.optional(v.string()),
    photoURL: v.optional(v.string()),
    familyId: v.optional(v.id("families")),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  joinRequests: defineTable({
    familyId: v.id("families"),
    userId: v.string(), // 申請者の Firebase UID
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_familyId_status", ["familyId", "status"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_familyId_userId", ["familyId", "userId"]),

  serviceRecords: defineTable({
    title: v.string(),
    url: v.optional(v.string()),
    ogpImage: v.optional(v.string()),
    ogpDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    visibility: v.union(v.literal("PRIVATE"), v.literal("SHARED")),
    userId: v.string(), // 作成者の Firebase UID
    familyId: v.optional(v.id("families")),

    // 子エンティティ（アカウント情報）をドキュメント内に埋め込み
    credentials: v.array(
      v.object({
        id: v.string(), // Reactのkey用や更新時の識別用
        label: v.optional(v.string()),
        loginId: v.optional(v.string()),
        passwordHint: v.optional(v.string()),
        passwordHintIv: v.optional(v.string()),
      }),
    ),

    // タグを配列として埋め込み
    tags: v.array(v.string()),

    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_familyId_visibility", ["familyId", "visibility"])
    .index("by_updatedAt", ["updatedAt"]),
});

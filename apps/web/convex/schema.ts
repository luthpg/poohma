import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  families: defineTable({
    name: v.string(),
    masterKeyEncrypted: v.optional(v.string()),
    masterKeyIv: v.optional(v.string()),
    masterKeySalt: v.optional(v.string()),
    kdfIterations: v.optional(v.number()),
    cryptoVersion: v.optional(v.number()),
    updatedAt: v.number(),
  }),

  loginEvents: defineTable({
    accountId: v.id("users"),
    userId: v.string(),
    deviceId: v.string(),
    deviceName: v.optional(v.string()),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    location: v.optional(v.string()),
    isNewDevice: v.boolean(),
    loginAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_accountId_deviceId", ["accountId", "deviceId"])
    .index("by_loginAt", ["loginAt"]),

  users: defineTable({
    userId: v.string(), // Firebase UID
    email: v.string(),
    displayName: v.optional(v.string()),
    photoURL: v.optional(v.string()),
    familyId: v.optional(v.id("families")),
    createdAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_familyId", ["familyId"]),

  familyMigrations: defineTable({
    userId: v.string(), // Firebase UID
    accountId: v.optional(v.id("users")), // 作成元 PoohMa アカウント ID
    sourceFamilyId: v.optional(v.id("families")),
    targetFamilyId: v.id("families"),
    serviceRecordIds: v.array(v.id("serviceRecords")),
    status: v.union(
      v.literal("PREPARED"),
      v.literal("COMPLETED"),
      v.literal("EXPIRED"),
      v.literal("ABORTED"),
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_accountId", ["accountId"])
    .index("by_status", ["status"]),

  familyInvites: defineTable({
    familyId: v.id("families"),
    code: v.string(), // crypto.randomUUID() 等の高エントロピー文字列
    createdBy: v.string(), // 発行者の Firebase UID
    createdAt: v.number(),
    expiresAt: v.number(), // 発行時に選択した TTL に基づき算出
    revokedAt: v.optional(v.number()), // セットされていれば即無効
    useCount: v.number(), // この招待経由で作成された参加申請数（監査用）
  })
    .index("by_code", ["code"])
    .index("by_familyId", ["familyId"]),

  joinRequests: defineTable({
    familyId: v.id("families"),
    userId: v.string(), // 申請者の Firebase UID
    accountId: v.optional(v.id("users")), // 申請元 PoohMa Account ID
    invitedByCode: v.optional(v.id("familyInvites")),
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
    .index("by_familyId_userId", ["familyId", "userId"])
    .index("by_accountId_status", ["accountId", "status"])
    .index("by_familyId_accountId", ["familyId", "accountId"])
    .index("by_invitedByCode", ["invitedByCode"]),

  serviceRecords: defineTable({
    title: v.string(),
    titleReading: v.optional(v.string()),
    url: v.optional(v.string()),
    ogpImage: v.optional(v.string()),
    ogpDescription: v.optional(v.string()),
    memo: v.optional(v.string()),
    userId: v.string(), // 作成者の Firebase UID (監査・表示用)
    accountId: v.id("users"), // 作成元 / 個人オーナーの PoohMa アカウント ID (主識別子)
    familyId: v.optional(v.id("families")), // 暗号化スコープ / 所属家族 ID

    // 移行互換用（旧データ読み取りおよび backfill 完了までの安全策）
    visibility: v.optional(v.union(v.literal("PRIVATE"), v.literal("SHARED"))),

    sortKey: v.optional(v.string()), // 五十音・アルファベット順位プレフィックス付きソートキー
    ownerType: v.optional(v.union(v.literal("user"), v.literal("family"))),
    ownerFamilyId: v.optional(v.id("families")), // ownerType === "family" のとき
    admins: v.optional(v.array(v.id("users"))), // ownerType === "family" のときの管理者 PoohMa アカウント ID 配列

    // 子エンティティ（アカウント情報）をドキュメント内に埋め込み
    credentials: v.array(
      v.object({
        id: v.string(), // Reactのkey用や更新時の識別用
        label: v.optional(v.string()),
        loginId: v.optional(v.string()),
        passwordHint: v.optional(v.string()),
        passwordHintIv: v.optional(v.string()),
        passwordHintDekEncrypted: v.optional(v.string()),
        passwordHintDekIv: v.optional(v.string()),
      }),
    ),

    // タグを配列として埋め込み
    tags: v.array(v.string()),

    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_accountId", ["accountId"])
    .index("by_family_sortKey", ["familyId", "sortKey"])
    .index("by_ownerType_accountId", ["ownerType", "accountId"])
    .index("by_ownerType_ownerFamilyId", ["ownerType", "ownerFamilyId"]),
});

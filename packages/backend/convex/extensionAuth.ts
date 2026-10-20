import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import { authenticatedMutation } from "./customBuilders";

export const SYNC_CODE_TTL_MS = 30 * 1000; // 30秒

/**
 * 拡張機能連携用の短命同期コード（Sync Code）を発行する
 * Web 側（ログイン済みユーザー）から呼び出される
 */
export const issueSyncToken = authenticatedMutation({
  args: {
    nonce: v.string(),
    customToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rawNonce = args.nonce.trim();
    if (!rawNonce) {
      throw new Error("Nonce is required");
    }

    // 既存の期限切れコードを小バッチでクリーンアップ
    const existing = await ctx.db
      .query("extensionSyncCodes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(10);
    for (const record of existing) {
      await ctx.db.delete(record._id);
    }

    // 暗号学的ランダムコード（UUID）を生成
    const code = crypto.randomUUID();
    const expiresAt = Date.now() + SYNC_CODE_TTL_MS;

    await ctx.db.insert("extensionSyncCodes", {
      accountId: ctx.user._id,
      nonce: rawNonce,
      code,
      customToken: args.customToken,
      expiresAt,
    });

    return {
      success: true,
      code,
      expiresAt,
    };
  },
});

/**
 * 拡張機能側から短命同期コードを検証・消費して認証情報を取得する
 * 1回限りの利用（Single-Use）とし、検証成功時に即座に物理削除する
 */
export const redeemSyncToken = mutation({
  args: {
    nonce: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const rawNonce = args.nonce.trim();
    const rawCode = args.code.trim();
    if (!rawNonce || !rawCode) {
      throw new Error("Invalid request");
    }

    const record = await ctx.db
      .query("extensionSyncCodes")
      .withIndex("by_code_nonce", (q) =>
        q.eq("code", rawCode).eq("nonce", rawNonce),
      )
      .first();

    if (!record) {
      throw new Error("Invalid or expired sync code");
    }

    // 即時物理削除（再送攻撃・横取りの完全遮断）
    await ctx.db.delete(record._id);

    // 有効期限チェック
    if (record.expiresAt < Date.now()) {
      throw new Error("Sync code has expired");
    }

    const user = await ctx.db.get(record.accountId);
    if (!user) {
      throw new Error("User account not found");
    }

    // 家族暗号メタデータ取得用キャッシュヘルパー
    type FamilyInfo = {
      _id: Id<"families">;
      name: string;
      masterKeyEncrypted: string;
      masterKeyIv: string;
      masterKeySalt: string;
      kdfIterations: number;
      cryptoVersion: number;
    } | null;

    const familyCache = new Map<string, FamilyInfo>();

    async function getFamilyInfo(
      familyId?: Id<"families">,
    ): Promise<FamilyInfo> {
      if (!familyId) return null;
      const cached = familyCache.get(familyId);
      if (cached !== undefined) return cached;
      const familyDoc = await ctx.db.get(familyId);
      const info: FamilyInfo = familyDoc
        ? {
            _id: familyDoc._id,
            name: familyDoc.name,
            masterKeyEncrypted: familyDoc.masterKeyEncrypted,
            masterKeyIv: familyDoc.masterKeyIv,
            masterKeySalt: familyDoc.masterKeySalt,
            kdfIterations: familyDoc.kdfIterations,
            cryptoVersion: familyDoc.cryptoVersion,
          }
        : null;
      familyCache.set(familyId, info);
      return info;
    }

    const family = await getFamilyInfo(user.familyId);

    // 同一 Firebase UID に属する全サブアカウント一覧を取得
    const userDocs = await ctx.db
      .query("users")
      .withIndex("by_userId", (q) => q.eq("userId", user.userId))
      .collect();

    const accounts = await Promise.all(
      userDocs.map(async (u) => ({
        _id: u._id,
        userId: u.userId,
        displayName: u.displayName,
        email: u.email,
        photoURL: u.photoURL,
        familyId: u.familyId,
        familyRole: u.familyRole,
        family: await getFamilyInfo(u.familyId),
      })),
    );

    return {
      success: true,
      customToken: record.customToken ?? null,
      user: {
        _id: user._id,
        userId: user.userId, // Firebase UID
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        familyId: user.familyId,
        familyRole: user.familyRole,
        family,
      },
      accounts,
      family,
    };
  },
});

/**
 * 期限切れコードの定期クリーンアップ用 internal mutation
 */
export const cleanupExpiredSyncCodes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("extensionSyncCodes")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
      .take(100);

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }
    return { cleanedCount: expired.length };
  },
});

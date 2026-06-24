"use node";

import {
  decrypt,
  deriveKeyFromPasscode,
  encrypt,
  generateDEK,
  unwrapMasterKey,
  wrapDEK,
} from "../src/lib/crypto";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

export const migrateEnvelopeEncryption = action({
  args: {},
  handler: async (ctx) => {
    const familyIdStr = process.env.MIGRATION_FAMILY_ID;
    const passcode = process.env.MIGRATION_FAMILY_PASSCODE;

    if (!familyIdStr || !passcode) {
      throw new Error(
        "Missing MIGRATION_FAMILY_ID or MIGRATION_FAMILY_PASSCODE in environment variables.",
      );
    }

    const familyId = familyIdStr as Id<"families">;

    const { family, records } = await ctx.runQuery(
      internal.migrations.getFamilyAndRecords,
      { familyId },
    );

    if (
      !family.masterKeyEncrypted ||
      !family.masterKeyIv ||
      !family.masterKeySalt
    ) {
      throw new Error("Family does not have master key set up");
    }

    // 古いマスターキーを導出
    const wrappingKey = await deriveKeyFromPasscode(
      passcode,
      family.masterKeySalt,
    );
    const masterKey = await unwrapMasterKey(
      family.masterKeyEncrypted,
      family.masterKeyIv,
      wrappingKey,
    );

    let totalMigrated = 0;

    for (const record of records) {
      const migratedCredentials = [];
      let needsMigration = false;

      for (const cred of record.credentials) {
        // passwordHintが存在し、まだDEKフィールドがない場合のみマイグレーション対象
        if (
          cred.passwordHint &&
          cred.passwordHintIv &&
          !cred.passwordHintDekEncrypted
        ) {
          needsMigration = true;

          // 1. マスターキーで直接復号する（既存の方式）
          const plainHint = await decrypt(
            cred.passwordHint,
            cred.passwordHintIv,
            masterKey,
          );

          // 2. 新しいDEKを生成
          const dek = await generateDEK();

          // 3. DEKでHintを暗号化
          const { encrypted: newHintEncrypted, iv: newHintIv } = await encrypt(
            plainHint,
            dek,
          );

          // 4. DEKをマスターキーでラップ
          const { encrypted: dekEncrypted, iv: dekIv } = await wrapDEK(
            dek,
            masterKey,
          );

          migratedCredentials.push({
            id: cred.id,
            passwordHint: newHintEncrypted,
            passwordHintIv: newHintIv,
            passwordHintDekEncrypted: dekEncrypted,
            passwordHintDekIv: dekIv,
          });
        }
      }

      if (needsMigration) {
        await ctx.runMutation(internal.migrations.updateRecordCredentials, {
          recordId: record._id,
          credentials: migratedCredentials,
        });
        totalMigrated++;
      }
    }

    return { success: true, recordsMigrated: totalMigrated };
  },
});

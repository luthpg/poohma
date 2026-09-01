import { internalMutation } from "./_generated/server";

/**
 * サービスレコードの埋め込み credentials 配列を独立した credentials テーブルへ移行するワンショットマイグレーション
 * Convex CLI (npx convex run migrations:migrateCredentialsToTable) または内部スクリプトからワンショットで実行可能
 */
export const migrateCredentialsToTable = internalMutation({
  args: {},
  handler: async (ctx) => {
    const records = await ctx.db.query("serviceRecords").collect();
    let migratedRecordsCount = 0;
    let migratedCredentialsCount = 0;

    for (const record of records) {
      const recordAny = record as Record<string, unknown>;
      const embeddedCredentials = recordAny.credentials;

      if (
        Array.isArray(embeddedCredentials) &&
        embeddedCredentials.length > 0
      ) {
        // 既に credentials テーブルにデータが存在するか確認
        const existingCredentials = await ctx.db
          .query("credentials")
          .withIndex("by_recordId", (q) => q.eq("recordId", record._id))
          .collect();

        if (existingCredentials.length === 0) {
          for (let i = 0; i < embeddedCredentials.length; i++) {
            const c = embeddedCredentials[i];
            await ctx.db.insert("credentials", {
              recordId: record._id,
              label: c.label || undefined,
              loginId: c.loginId || undefined,
              passwordHint: c.passwordHint || undefined,
              passwordHintIv: c.passwordHintIv || undefined,
              passwordHintDekEncrypted: c.passwordHintDekEncrypted || undefined,
              passwordHintDekIv: c.passwordHintDekIv || undefined,
              order: i,
              updatedAt: record.updatedAt || Date.now(),
            });
            migratedCredentialsCount++;
          }
        }
      }

      // serviceRecords から旧 credentials フィールドを物理削除
      if (recordAny.credentials !== undefined) {
        await ctx.db.patch(record._id, {
          credentials: undefined,
        } as Record<string, unknown>);
        migratedRecordsCount++;
      }
    }

    return {
      totalRecords: records.length,
      migratedRecords: migratedRecordsCount,
      migratedCredentials: migratedCredentialsCount,
    };
  },
});

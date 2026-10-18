import { systemAdminQuery } from "../customBuilders";

/**
 * 管理コンソール向けサービス全体統計
 */
export const getSystemStats = systemAdminQuery({
  args: {},
  handler: async (ctx) => {
    // 全件集計
    const users = await ctx.db.query("users").collect();
    const families = await ctx.db.query("families").collect();
    const records = await ctx.db.query("serviceRecords").collect();
    const contacts = await ctx.db.query("contacts").collect();

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * oneDayMs;

    // 1. ユーザー: 直近7日間の日別新規登録数（最古〜今日までの7要素）
    const userRegistrationDaily: number[] = [0, 0, 0, 0, 0, 0, 0];
    let newUsersLast7Days = 0;
    for (const u of users) {
      if (u.createdAt >= sevenDaysAgo) {
        newUsersLast7Days++;
        const dayDiff = Math.floor((u.createdAt - sevenDaysAgo) / oneDayMs);
        const index = Math.min(Math.max(dayDiff, 0), 6);
        userRegistrationDaily[index] = (userRegistrationDaily[index] ?? 0) + 1;
      }
    }

    // 2. ファミリー: ファミリー所属ユーザー数 vs 未所属（ソロ）ユーザー数
    const usersInFamily = users.filter((u) => u.familyId != null).length;
    const soloUsers = users.length - usersInFamily;
    const familyMemberRatio =
      users.length > 0 ? Math.round((usersInFamily / users.length) * 100) : 0;

    // 3. レコード: 家族共有 (family) vs 個人 (user) レコード数
    const familyRecords = records.filter(
      (r) => r.ownerType === "family",
    ).length;
    const personalRecords = records.length - familyRecords;
    const sharedRecordRatio =
      records.length > 0
        ? Math.round((familyRecords / records.length) * 100)
        : 0;

    // 4. お問い合わせ: 未読、対応中、完了の内訳
    const unreadContacts = contacts.filter((c) => c.status === "UNREAD").length;
    const readContacts = contacts.filter((c) => c.status === "READ").length;
    const resolvedContacts = contacts.filter(
      (c) => c.status === "RESOLVED",
    ).length;

    return {
      totalUsers: users.length,
      totalFamilies: families.length,
      totalRecords: records.length,
      unreadContacts,
      newUsersLast7Days,
      // 実ビジュアル用データ
      userRegistrationDaily,
      familyStats: {
        usersInFamily,
        soloUsers,
        ratio: familyMemberRatio,
      },
      recordStats: {
        familyRecords,
        personalRecords,
        ratio: sharedRecordRatio,
      },
      contactStats: {
        unread: unreadContacts,
        read: readContacts,
        resolved: resolvedContacts,
        total: contacts.length,
      },
      timestamp: now,
    };
  },
});

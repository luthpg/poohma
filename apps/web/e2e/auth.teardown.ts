import { test as teardown } from "@playwright/test";
import { purgeAllTestData } from "./support/cleanup";

teardown("cleanup all test data from convex", async () => {
  try {
    const deletedCount = await purgeAllTestData();
    console.log(
      `[Teardown] Successfully purged ${deletedCount} test accounts and associated families/records from Convex.`,
    );
  } catch (error) {
    console.error("[Teardown Error] Failed to purge test data:", error);
    // teardown の失敗で全体のCIを落とさないよう警告にとどめる
  }
});

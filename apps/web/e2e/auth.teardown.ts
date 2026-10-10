import { test as teardown } from "@playwright/test";
import { purgeAllTestData } from "./support/cleanup";

teardown("cleanup all test data from convex", async () => {
  const deletedCount = await purgeAllTestData();
  console.log(
    `[Teardown] Successfully purged ${deletedCount} test accounts and associated families/records from Convex.`,
  );
});

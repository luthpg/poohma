import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as setup } from "@playwright/test";
import { getWorkerIdentity } from "./support/ensure-test-user";
import { authenticateIdentityInPage } from "./support/test-fixtures";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(dirname, ".auth");

setup("authenticate as e2e test user", async ({ page, context, baseURL }) => {
  setup.setTimeout(60_000);

  if (fs.existsSync(AUTH_DIR)) {
    for (const file of fs.readdirSync(AUTH_DIR)) {
      if (file.startsWith("worker-") || file.startsWith("logout-")) {
        fs.rmSync(path.join(AUTH_DIR, file), { force: true });
      }
    }
  } else {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("[Browser Console Error]", msg.text());
    }
  });

  const worker0Identity = getWorkerIdentity(0, "worker");
  await authenticateIdentityInPage(page, context, baseURL, worker0Identity);
});

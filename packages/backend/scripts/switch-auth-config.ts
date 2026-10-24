import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const authConfigFile = path.resolve(dirname, "../convex/auth.config.ts");

const targetEnv = process.argv[2];

if (!targetEnv || (targetEnv !== "production" && targetEnv !== "staging")) {
  console.error(
    "Usage: tsx scripts/switch-auth-config.ts <production|staging>",
  );
  process.exit(1);
}

const projectId = targetEnv === "production" ? "poohma" : "poohma-staging";

const content = `// 自動生成ファイル (CI デプロイ時に switch-auth-config.ts で切り替え)
// 環境: ${targetEnv} (Firebase Project: ${projectId})
export default {
  providers: [
    {
      domain: "https://securetoken.google.com/${projectId}",
      applicationID: "${projectId}",
    },
  ],
};
`;

fs.writeFileSync(authConfigFile, content, "utf-8");
console.log(
  `[switch-auth-config] Successfully switched auth.config.ts to ${targetEnv} (${projectId})`,
);

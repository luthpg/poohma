import fs from "node:fs";
import path from "node:path";

export function findRepoRoot(startDir = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (
      fs.existsSync(path.join(curr, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(curr, ".git"))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }

  throw new Error(
    `Repository root not found. Could not find 'pnpm-workspace.yaml' or '.git' in any parent directory of ${path.resolve(startDir)}`,
  );
}

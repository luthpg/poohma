import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.resolve(dirname, "../.auth");
const ACTIVE_UIDS_DIR = path.join(AUTH_DIR, "uids");

const E2E_TEST_UID = process.env.E2E_TEST_UID ?? "e2e-test-user";
const E2E_TEST_EMAIL =
  process.env.E2E_TEST_EMAIL ?? "e2e-tests@poohma-staging.internal";

let app: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (app) return app;

  // 1. 環境変数からの直接 JSON（CI / Vercel用）
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.E2E_FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(
        /\\n/g,
        "\n",
      );
    }
    app = admin.initializeApp(
      { credential: admin.credential.cert(serviceAccount) },
      "e2e-admin",
    );
    return app;
  }

  // 2. クレデンシャルファイルパスからの読み込み（ローカル開発用）
  const credentialsPath = process.env.FIREBASE_ADMINSDK_CREDENTIALS;
  if (credentialsPath) {
    const fullPath = path.resolve(credentialsPath);
    if (fs.existsSync(fullPath)) {
      const fileContent = fs.readFileSync(fullPath, "utf-8");
      const serviceAccount = JSON.parse(fileContent);
      app = admin.initializeApp(
        { credential: admin.credential.cert(serviceAccount) },
        "e2e-admin",
      );
      return app;
    }
  }

  throw new Error(
    "Firebase Admin credentials not found. To run E2E tests locally, set FIREBASE_SERVICE_ACCOUNT (JSON string) or FIREBASE_ADMINSDK_CREDENTIALS (file path) in your .env or .env.local file.",
  );
}

/**
 * 実行単位のスコープ識別子を取得（CI実行間・Shard間の衝突防止）
 */
export function getE2ERunScope(): string {
  if (process.env.E2E_RUN_SCOPE) {
    return process.env.E2E_RUN_SCOPE.replace(/[^a-zA-Z0-9_-]/g, "-");
  }
  if (process.env.GITHUB_RUN_ID) {
    const attempt = process.env.GITHUB_RUN_ATTEMPT ?? "1";
    return `ci-${process.env.GITHUB_RUN_ID}-${attempt}`;
  }
  return "local";
}

export interface WorkerIdentity {
  uid: string;
  email: string;
  displayName: string;
  storageStatePath: string;
}

/**
 * Worker または Logout 専用ユーザーの識別情報と storageState 保存先を解決
 */
export function getWorkerIdentity(
  parallelIndex: number,
  role: "worker" | "logout" = "worker",
): WorkerIdentity {
  const scope = getE2ERunScope();

  if (role === "logout") {
    const uid = `e2e-${scope}-logout`;
    return {
      uid,
      email: `${uid}@poohma-staging.internal`,
      displayName: `E2E Logout User (${scope})`,
      storageStatePath: path.join(AUTH_DIR, `logout-${scope}.json`),
    };
  }

  // Worker 0 は既存の e2e-user.json を共有（preview:auth 互換・初回setup再利用）
  if (parallelIndex === 0) {
    const uid = scope === "local" ? E2E_TEST_UID : `e2e-${scope}-w0`;
    const email =
      scope === "local" ? E2E_TEST_EMAIL : `${uid}@poohma-staging.internal`;
    return {
      uid,
      email,
      displayName: "E2E Test User (W0)",
      storageStatePath: path.join(AUTH_DIR, "e2e-user.json"),
    };
  }

  const uid = `e2e-${scope}-w${parallelIndex}`;
  return {
    uid,
    email: `${uid}@poohma-staging.internal`,
    displayName: `E2E Test User (W${parallelIndex})`,
    storageStatePath: path.join(
      AUTH_DIR,
      `worker-${scope}-${parallelIndex}.json`,
    ),
  };
}

function recordActiveUid(uid: string): void {
  try {
    fs.mkdirSync(ACTIVE_UIDS_DIR, { recursive: true });
    const safeName = uid.replace(/[^a-zA-Z0-9_-]/g, "_");
    fs.writeFileSync(
      path.join(ACTIVE_UIDS_DIR, `${safeName}.uid`),
      uid,
      "utf-8",
    );
  } catch {
    // ignore
  }
}

export function getRecordedActiveUids(): string[] {
  const uids = new Set<string>([
    E2E_TEST_UID,
    getWorkerIdentity(0, "worker").uid,
  ]);
  try {
    if (fs.existsSync(ACTIVE_UIDS_DIR)) {
      for (const file of fs.readdirSync(ACTIVE_UIDS_DIR)) {
        if (file.endsWith(".uid")) {
          const content = fs
            .readFileSync(path.join(ACTIVE_UIDS_DIR, file), "utf-8")
            .trim();
          if (content) uids.add(content);
        }
      }
    }
  } catch {
    // ignore
  }
  return [...uids];
}

export function clearRecordedActiveUids(): void {
  try {
    if (fs.existsSync(ACTIVE_UIDS_DIR)) {
      fs.rmSync(ACTIVE_UIDS_DIR, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
}

/**
 * 中断された過去実行の残留 E2E テストユーザー（@poohma-staging.internal）を列挙
 */
export async function listStaleE2ETestUids(
  maxAgeMs = 2 * 60 * 60 * 1000,
): Promise<string[]> {
  try {
    const auth = getAdminApp().auth();
    const listResult = await auth.listUsers(1000);
    const now = Date.now();
    const staleUids: string[] = [];

    for (const userRecord of listResult.users) {
      const email = userRecord.email ?? "";
      const uid = userRecord.uid;
      if (
        uid === E2E_TEST_UID ||
        !uid.startsWith("e2e-") ||
        !email.endsWith("@poohma-staging.internal")
      ) {
        continue;
      }

      // ローカル実行の動的ワーカーUID（e2e-local-*）または作成から maxAgeMs 経過した CI UID を回収対象とする
      if (uid.startsWith("e2e-local-")) {
        staleUids.push(uid);
        continue;
      }

      const createdAt = userRecord.metadata.creationTime
        ? new Date(userRecord.metadata.creationTime).getTime()
        : 0;
      if (createdAt > 0 && now - createdAt > maxAgeMs) {
        staleUids.push(uid);
      }
    }
    return staleUids;
  } catch {
    return [];
  }
}

export async function deleteE2EFirebaseUserIfDynamic(
  uid: string,
): Promise<void> {
  if (!uid || uid === E2E_TEST_UID || !uid.startsWith("e2e-")) {
    return;
  }
  try {
    await getAdminApp().auth().deleteUser(uid);
  } catch {
    // 既に削除済みの場合は無視
  }
}

export async function ensureTestUserCustomToken(options?: {
  uid?: string;
  email?: string;
  displayName?: string;
}): Promise<string> {
  const uid = options?.uid ?? E2E_TEST_UID;
  const email =
    options?.email ??
    (uid === E2E_TEST_UID ? E2E_TEST_EMAIL : `${uid}@poohma-staging.internal`);
  const displayName = options?.displayName ?? "E2E Test User";

  const auth = getAdminApp().auth();
  try {
    await auth.getUser(uid);
  } catch {
    try {
      await auth.createUser({
        uid,
        email,
        emailVerified: true,
        displayName,
      });
    } catch {
      // 並列初期化等で既に作成された場合は無視
    }
  }
  recordActiveUid(uid);
  return auth.createCustomToken(uid);
}

export { E2E_TEST_EMAIL, E2E_TEST_UID };

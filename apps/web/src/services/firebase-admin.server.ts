import fs from "node:fs";
import path from "node:path";
import {
  type App,
  cert,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "@/env/client";

/**
 * Firebase Admin SDK の初期化
 * HMR(Hot Module Replacement)による二重初期化を防止する
 */
export function initializeFirebaseAdmin(): App {
  const apps = getApps();
  if (apps.length > 0) {
    return getApp();
  }

  const storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET;
  const projectId = env.VITE_FIREBASE_PROJECT_ID;

  // 1. 環境変数から直接 JSON 文字列を取得（Vercel用）
  const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountVar) {
    try {
      const serviceAccount = JSON.parse(serviceAccountVar);
      // Private key の改行コードを正しく処理する
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(
          /\\n/g,
          "\n",
        );
      }
      return initializeApp({
        credential: cert(serviceAccount),
        storageBucket,
        projectId,
      });
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT env var", e);
    }
  }

  // 2. 従来のファイルパス指定（ローカル開発用）
  const credentialsPath = process.env.FIREBASE_ADMINSDK_CREDENTIALS;
  if (credentialsPath) {
    try {
      const fullPath = path.resolve(credentialsPath);
      const fileContent = fs.readFileSync(fullPath, "utf-8");
      return initializeApp({
        credential: cert(JSON.parse(fileContent)),
        storageBucket,
        projectId,
      });
    } catch (e) {
      console.error("Failed to load Firebase credentials from file", e);
    }
  }

  // 3. デフォルト（おそらくADCや環境変数）
  return initializeApp({
    storageBucket,
    projectId,
  });
}

export const adminAuth = () => getAuth(initializeFirebaseAdmin());

export const getSessionCookie = async (idToken: string, expiresIn: number) => {
  return adminAuth().createSessionCookie(idToken, { expiresIn });
};

export const verifySessionCookie = async (
  sessionCookie: string,
  checkRevoked = false,
) => {
  return adminAuth().verifySessionCookie(sessionCookie, checkRevoked);
};

export const revokeRefreshTokens = async (uid: string) => {
  return adminAuth().revokeRefreshTokens(uid);
};

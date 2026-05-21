import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Auth, GoogleAuthProvider, getAuth } from "firebase/auth";
import { env } from "@/env";

const isBrowser = typeof window !== "undefined";

const getHostnameFromAuthDomain = (authDomain?: string) => {
  if (!authDomain) return null;

  try {
    // authDomain がホスト名のみの場合にも対応する
    const normalized =
      authDomain.includes("://") ? authDomain : `https://${authDomain}`;
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isFirebaseAppDomain = (hostname: string | null) =>
  hostname === "firebaseapp.com" || hostname?.endsWith(".firebaseapp.com");

const authDomainHostname = getHostnameFromAuthDomain(
  env.VITE_FIREBASE_AUTH_DOMAIN,
);
const isFirebaseAppAuthDomain = isFirebaseAppDomain(authDomainHostname);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  // 開発環境かつブラウザの場合は、Viteのプロキシ経由で認証を行うために現在のオリジンを使用する
  authDomain:
    isBrowser &&
    isFirebaseAppAuthDomain &&
    window.location.hostname === "localhost"
      ? window.location.host
      : env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isBrowser) {
  app = getApps()?.length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
}

export { auth, googleProvider };

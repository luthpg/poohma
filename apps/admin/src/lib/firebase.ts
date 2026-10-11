import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import {
  type Auth,
  browserLocalPersistence,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  getAuth,
  setPersistence,
  signInWithPopup,
} from "firebase/auth";
import { env } from "../env";

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
};

const existingApp = getApps()[0];
export const app: FirebaseApp = existingApp ?? initializeApp(firebaseConfig);

export const auth: Auth = getAuth(app);

// 永続性をブラウザローカルストレージに設定
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  return await signInWithPopup(auth, googleProvider);
}

export async function signOut() {
  return await firebaseSignOut(auth);
}

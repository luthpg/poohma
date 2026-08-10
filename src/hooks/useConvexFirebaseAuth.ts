import { onIdTokenChanged, signInWithCustomToken } from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCustomTokenFromSession } from "@/services/auth.functions";
import { auth } from "@/utils/firebase";
import { isPwaFirstLaunch, markPwaAsInitialized } from "@/utils/pwa";

export function useConvexFirebaseAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const recoveryAttempted = useRef(false);
  const recoverySnapshot = useRef<{ user: any; timestamp: number } | null>(null);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const firebaseAuth = auth;
    let isCleanedUp = false;

    const unsubscribe = onIdTokenChanged(firebaseAuth, async (user) => {
      // Invalidate any ongoing recovery when auth state changes
      recoverySnapshot.current = null;

      if (!user && !recoveryAttempted.current) {
        recoveryAttempted.current = true;
        // Capture auth state snapshot before starting async recovery
        const snapshot = { user: firebaseAuth.currentUser, timestamp: Date.now() };
        recoverySnapshot.current = snapshot;

        try {
          const result = await getCustomTokenFromSession();

          // Only apply recovery if snapshot is still valid and effect not cleaned up
          if (
            !isCleanedUp &&
            recoverySnapshot.current === snapshot &&
            firebaseAuth.currentUser === snapshot.user &&
            result?.customToken
          ) {
            await signInWithCustomToken(firebaseAuth, result.customToken);
            return;
          }
        } catch (error) {
          console.error("Silent re-auth failed:", error);
        }
      }
      setIsAuthenticated(!!user);
      setIsLoading(false);
    });

    return () => {
      isCleanedUp = true;
      recoverySnapshot.current = null;
      unsubscribe();
    };
  }, []);

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated,
      fetchAccessToken: async ({
        forceRefreshToken,
      }: {
        forceRefreshToken: boolean;
      }) => {
        if (!auth?.currentUser) {
          return null;
        }
        try {
          const isFirstPwaLaunch = isPwaFirstLaunch();
          const token = await auth.currentUser.getIdToken(
            isFirstPwaLaunch || forceRefreshToken,
          );
          // トークン取得成功後にのみPWA初回起動フラグを保存
          if (isFirstPwaLaunch) {
            markPwaAsInitialized();
          }
          return token;
        } catch (error) {
          console.error("Failed to fetch access token:", error);
          return null;
        }
      },
    }),
    [isLoading, isAuthenticated],
  );
}

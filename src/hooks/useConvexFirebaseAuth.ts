import { onIdTokenChanged } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import { auth } from "@/utils/firebase";

export function useConvexFirebaseAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!auth) {
      setIsLoading(false);
      return;
    }
    const unsubscribe = onIdTokenChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setIsLoading(false);
    });
    return unsubscribe;
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
          return await auth.currentUser.getIdToken(forceRefreshToken);
        } catch (error) {
          console.error("Failed to fetch access token:", error);
          return null;
        }
      },
    }),
    [isLoading, isAuthenticated],
  );
}

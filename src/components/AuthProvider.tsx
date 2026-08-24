import { createContext, type PropsWithChildren, useContext } from "react";
import { useConvexFirebaseAuth } from "@/hooks/useConvexFirebaseAuth";

type AuthState = ReturnType<typeof useConvexFirebaseAuth>;

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const auth = useConvexFirebaseAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return auth;
}

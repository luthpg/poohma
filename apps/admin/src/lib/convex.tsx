import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { env } from "../env";
import { useAuth } from "./auth";

const convexUrl =
  env.VITE_CONVEX_URL || "https://dummy-convex-url.convex.cloud";

export const convexClient = new ConvexReactClient(convexUrl);

export function ConvexAuthBridge({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  return (
    <ConvexProviderWithAuth client={convexClient} useAuth={() => auth}>
      {children}
    </ConvexProviderWithAuth>
  );
}

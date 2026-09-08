import { useConvexAuth, useQuery } from "convex/react";
import { useEffect } from "react";

// Simple memory cache for Convex query results to prevent loading flashes and preserve scroll positions
// Map keeps insertion order, so we can use it as a simple LRU by deleting the first item when it gets too large
const MAX_CACHE_SIZE = 1000;
let queryCache = new Map<string, unknown>();

function setCache(key: string, value: unknown) {
  if (queryCache.size >= MAX_CACHE_SIZE && !queryCache.has(key)) {
    // Delete the oldest entry (first inserted)
    const firstKey = queryCache.keys().next().value;
    if (firstKey) queryCache.delete(firstKey);
  }
  // Re-insert to make it the newest
  queryCache.delete(key);
  queryCache.set(key, value);
}

/**
 * A wrapper hook around Convex's useQuery that caches the last successful result in memory.
 * If the query is in a loading/undefined state, it returns the cached result if available.
 * This prevents UI flashes (skeletons) during page transitions and allows the browser to restore scroll position.
 */
export function usePersistentQuery<T>(
  query: Parameters<typeof useQuery>[0],
  args?: Parameters<typeof useQuery>[1],
): T | undefined {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      clearQueryCache();
    }
  }, [isAuthenticated]);

  const result = useQuery(
    query,
    isAuthenticated ? (args === undefined ? {} : args) : "skip",
  );
  // Create a unique key based on the query function and its arguments
  let queryKey = "";
  if (query && typeof query === "object") {
    queryKey =
      "_path" in query
        ? String((query as Record<string, unknown>)._path)
        : JSON.stringify(query);
  } else {
    queryKey = String(query);
  }
  const cacheKey = JSON.stringify({ query: queryKey, args });

  useEffect(() => {
    if (result !== undefined) {
      setCache(cacheKey, result);
    }
  }, [result, cacheKey]);

  if (result === undefined) {
    return queryCache.get(cacheKey) as T | undefined;
  }

  return result as T;
}

/**
 * Clears the query cache (e.g. upon user logout)
 */
export function clearQueryCache() {
  queryCache = new Map<string, unknown>();
}

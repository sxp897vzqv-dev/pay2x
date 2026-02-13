/**
 * Simple in-memory cache with TTL
 * 
 * Works across requests within the same Edge Function instance.
 * Resets on cold starts (which is fine - we just re-fetch).
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

// TTL constants
export const TTL = {
  BANK_CIRCUITS: 30_000,     // 30 seconds
  PEAK_STATUS: 60_000,       // 1 minute
  MERCHANT_AFFINITY: 120_000, // 2 minutes
};

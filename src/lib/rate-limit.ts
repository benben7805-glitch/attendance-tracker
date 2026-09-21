/**
 * In-memory sliding-window rate limiter.
 * Protects login and sensitive operations against brute-force attacks and abuse.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store.entries()) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

/**
 * Checks if an identifier exceeds the allowed number of actions within a time window.
 *
 * @param key Unique identifier (e.g. IP address, action + user)
 * @param limit Maximum allowed attempts within the window
 * @param windowMs Duration of the window in milliseconds (default: 60,000ms = 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number = 10,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetMs: number } {
  cleanup(windowMs);

  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Filter timestamps within the sliding window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const resetMs = Math.max(0, windowMs - (now - oldest));
    return { allowed: false, remaining: 0, resetMs };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetMs: windowMs,
  };
}

// Minimal fixed-window IP rate limiter for public endpoints. In-memory per isolate;
// good enough for a public form (bots get 429s), not a distributed control.

export interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_KEYS = 10_000;

export interface RateDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRate(
  key: string,
  nowMs: number,
  limit: number,
  windowMs: number,
  store: Map<string, Window> = windows,
): RateDecision {
  const w = store.get(key);
  if (!w || nowMs >= w.resetAt) {
    store.set(key, { count: 1, resetAt: nowMs + windowMs });
    if (store.size > MAX_KEYS) store.clear(); // crude but effective against map flooding
    return { allowed: true, retryAfterSeconds: 0 };
  }
  w.count += 1;
  return {
    allowed: w.count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((w.resetAt - nowMs) / 1000)),
  };
}

export function clientKey(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : request.headers.get("x-real-ip") ?? "unknown";
  return ip;
}

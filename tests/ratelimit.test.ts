import { describe, it, expect } from "vitest";
import { checkRate, type Window } from "@/lib/ratelimit";

describe("checkRate", () => {
  it("allows up to the limit then blocks until the window resets", () => {
    const store = new Map<string, Window>();
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(checkRate("ip1", t0 + i, 5, 60_000, store).allowed).toBe(true);
    }
    const blocked = checkRate("ip1", t0 + 6, 5, 60_000, store);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // after the window passes, allowed again
    expect(checkRate("ip1", t0 + 60_001, 5, 60_000, store).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const store = new Map<string, Window>();
    const t = 5_000_000;
    checkRate("a", t, 1, 60_000, store);
    expect(checkRate("a", t + 1, 1, 60_000, store).allowed).toBe(false);
    expect(checkRate("b", t + 1, 1, 60_000, store).allowed).toBe(true);
  });
});

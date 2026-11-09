import { describe, it, expect } from "vitest";
import { isOptOut } from "@/lib/channels/optout";

describe("isOptOut", () => {
  it("catches common opt-out phrasings", () => {
    for (const t of ["STOP", "Please stop texting me", "unsubscribe", "remove me from this list", "opt out", "cancel", "quit"]) {
      expect(isOptOut(t), t).toBe(true);
    }
  });
  it("ignores clearly normal replies", () => {
    for (const t of ["yes I'm interested", "call me tomorrow", "what are the rates?", "sounds good, thanks"]) {
      expect(isOptOut(t), t).toBe(false);
    }
  });
  it("over-matches on purpose: any 'stop' phrasing opts out (TCPA safe side)", () => {
    // "stop by my office" is a false positive, but honoring it only silences one lead —
    // the cost of missing a real opt-out is a TCPA violation. Asymmetry favors matching.
    expect(isOptOut("stop by my office anytime")).toBe(true);
  });
});

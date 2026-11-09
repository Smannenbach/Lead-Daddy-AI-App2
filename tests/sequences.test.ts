import { describe, it, expect } from "vitest";
import { buildSteps, nextDueStep, skipReason, emptySequenceState, type SequenceState } from "@/lib/campaigns/sequences";

const bodies = { email: "e", sms: "s", call: "c" };

describe("buildSteps", () => {
  it("maps channel sequence to steps with default daily offsets", () => {
    const steps = buildSteps({ channelSeq: ["email", "sms", "call"], bodies });
    expect(steps.map((s) => s.channel)).toEqual(["email", "sms", "call"]);
    expect(steps[1].offsetMinutes).toBe(1440);
  });
  it("honors custom offsets and subjects", () => {
    const steps = buildSteps({
      channelSeq: ["email", "sms"],
      offsetsMinutes: [0, 30],
      bodies,
      subjects: { email: "Hi" },
    });
    expect(steps[1].offsetMinutes).toBe(30);
    expect(steps[0].subject).toBe("Hi");
  });
});

describe("nextDueStep", () => {
  const base: SequenceState = {
    steps: buildSteps({ channelSeq: ["email", "sms"], offsetsMinutes: [0, 60], bodies }),
    launchedAt: "2026-11-08T10:00:00.000Z",
    runs: [],
  };
  it("returns the first step at launch time", () => {
    expect(nextDueStep(base, new Date("2026-11-08T10:00:00Z"))).toBe(0);
  });
  it("waits for the offset", () => {
    // step 0 (offset 0) is still pending at T+30m, so it remains the due step
    expect(nextDueStep(base, new Date("2026-11-08T10:30:00Z"))).toBe(0);
    const step0done = {
      ...base,
      runs: [{ leadId: "a", stepIndex: 0, status: "sent" as const, at: "2026-11-08T10:00:01Z" }],
    };
    expect(nextDueStep(step0done, new Date("2026-11-08T10:30:00Z"))).toBeNull();
    expect(nextDueStep(step0done, new Date("2026-11-08T11:00:00Z"))).toBe(1);
  });
  it("skips executed steps and finishes", () => {
    const done = { ...base, runs: [
      { leadId: "a", stepIndex: 0, status: "sent" as const, at: "2026-11-08T10:00:01Z" },
      { leadId: "a", stepIndex: 1, status: "sent" as const, at: "2026-11-08T11:00:01Z" },
    ] };
    expect(nextDueStep(done, new Date("2026-11-08T12:00:00Z"))).toBeNull();
  });
  it("returns null before launch", () => {
    expect(nextDueStep(emptySequenceState(), new Date())).toBeNull();
  });
});

describe("skipReason", () => {
  it("email needs valid email only", () => {
    expect(skipReason({ channel: "email", tcpaConsent: false, emailStatus: "valid", phoneStatus: "unverified" })).toBeNull();
    expect(skipReason({ channel: "email", tcpaConsent: true, emailStatus: "risky", phoneStatus: "valid" })).toBe("skipped_unverified");
  });
  it("sms/call need tcpa consent AND valid phone", () => {
    expect(skipReason({ channel: "sms", tcpaConsent: false, emailStatus: "valid", phoneStatus: "valid" })).toBe("skipped_no_consent");
    expect(skipReason({ channel: "call", tcpaConsent: true, emailStatus: "valid", phoneStatus: "invalid" })).toBe("skipped_unverified");
    expect(skipReason({ channel: "sms", tcpaConsent: true, emailStatus: null, phoneStatus: "valid" })).toBeNull();
  });
});

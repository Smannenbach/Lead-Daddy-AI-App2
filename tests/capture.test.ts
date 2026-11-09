import { describe, it, expect } from "vitest";
import { validateCapture, captureIdempotencyKey } from "@/lib/capture/validate";

describe("validateCapture", () => {
  it("accepts email-only with consent", () => {
    const r = validateCapture({ name: "Jane Doe", email: "Jane@X.com", consent: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("jane@x.com");
      expect(r.value.consent).toBe(true);
    }
  });
  it("requires at least email or phone", () => {
    expect(validateCapture({ name: "X" })).toEqual({ ok: false, error: "missing_contact" });
  });
  it("rejects bad email and bad phone shapes", () => {
    expect(validateCapture({ email: "nope" }).ok).toBe(false);
    expect(validateCapture({ phone: "abc" }).ok).toBe(false);
  });
  it("honeypot must be empty", () => {
    expect(validateCapture({ email: "a@b.co", website: "http://spam" })).toEqual({ ok: false, error: "honeypot" });
  });
  it("defaults name from email local part", () => {
    const r = validateCapture({ email: "bob@x.com" });
    expect(r.ok && r.value.name).toBe("bob");
  });
});

describe("captureIdempotencyKey", () => {
  it("is stable per email and distinct across emails", () => {
    const a1 = captureIdempotencyKey("a@x.com", null);
    const a2 = captureIdempotencyKey("A@x.com", null);
    const b = captureIdempotencyKey("b@x.com", null);
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
});

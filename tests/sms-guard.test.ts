import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  canonicalPhone,
  phoneVariants,
  phoneDigitsRegex,
  smsDailyCap,
  guardedSendSms,
  recordOptOut,
  type SmsGuardStore,
} from "@/lib/channels/sms-guard";

type Contact = { id: string; phone: string; custom_fields: Record<string, unknown> };

function memoryStore(contacts: Contact[], opts: { failReads?: boolean; failReserve?: boolean; sentToday?: number; sharedOptOuts?: string[] } = {}) {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  let outbound = opts.sentToday ?? 0;
  let reservations = 0;
  let released = 0;
  const sharedOptOuts = new Set<string>(opts.sharedOptOuts ?? []);
  const store: SmsGuardStore = {
    async contactsByPhone(phone) {
      if (opts.failReads) throw new Error("db down");
      // Mirror the production regex so tests exercise the same matching rule.
      const re = phoneDigitsRegex(phone);
      return contacts.filter((c) => (re ? new RegExp(re).test(c.phone) : c.phone === phone));
    },
    async hasOptOutEvent(canonical) {
      if (opts.failReads) throw new Error("db down");
      return sharedOptOuts.has(canonical) || events.some((e) => e.type === "sms_optout" && e.data.phone === canonical);
    },
    async recordNumberOptOut(canonical) {
      sharedOptOuts.add(canonical);
    },
    async countOutboundSince() {
      if (opts.failReads) throw new Error("db down");
      return outbound;
    },
    async updateContactFields(id, fields) {
      const c = contacts.find((x) => x.id === id);
      if (c) c.custom_fields = fields;
    },
    async logEvent(type, _detail, data) {
      events.push({ type, data });
      if (type === "sms_outbound") outbound += 1;
    },
    async reserveOutbound() {
      if (opts.failReserve) throw new Error("insert failed");
      outbound += 1;
      reservations += 1;
      return `r${reservations}`;
    },
    async releaseOutbound() {
      outbound -= 1;
      released += 1;
    },
  };
  return { store, events, contacts, sharedOptOuts, counts: () => ({ outbound, reservations, released }) };
}

function recorder() {
  const sent: { to: string; body: string }[] = [];
  return { sent, send: async (to: string, body: string) => { sent.push({ to, body }); return {}; } };
}

describe("phone normalisation", () => {
  it("canonicalises US numbers to E.164", () => {
    expect(canonicalPhone("(480) 690-2666")).toBe("+14806902666");
    expect(canonicalPhone("14806902666")).toBe("+14806902666");
    expect(canonicalPhone("+1 480 690 2666")).toBe("+14806902666");
  });
  it("produces the stored formats a contact row might use", () => {
    const v = phoneVariants("+14806902666");
    for (const f of ["+14806902666", "4806902666", "14806902666", "(480) 690-2666", "480-690-2666"]) {
      expect(v).toContain(f);
    }
  });
});

describe("smsDailyCap", () => {
  const prev = process.env.SMS_DAILY_CAP;
  afterEach(() => { process.env.SMS_DAILY_CAP = prev; });
  it("defaults to 100 and honours a valid override", () => {
    delete process.env.SMS_DAILY_CAP;
    expect(smsDailyCap()).toBe(100);
    process.env.SMS_DAILY_CAP = "25";
    expect(smsDailyCap()).toBe(25);
  });
  it("falls back to the default on garbage instead of uncapping", () => {
    process.env.SMS_DAILY_CAP = "lots";
    expect(smsDailyCap()).toBe(100);
  });
});

describe("guardedSendSms", () => {
  beforeEach(() => { delete process.env.SMS_DAILY_CAP; });

  it("sends marketing SMS when consent is granted and logs it", async () => {
    const { store, events, counts } = memoryStore([{ id: "a", phone: "+14805550100", custom_fields: { tcpa_consent: "granted" } }]);
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: true });
    expect(r.sent).toHaveLength(1);
    expect(events).toHaveLength(0); // marketing sends are counted by their reservation row
    expect(counts()).toMatchObject({ outbound: 1, reservations: 1, released: 0 });
  });

  it("refuses marketing SMS without consent", async () => {
    const { store } = memoryStore([]);
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: false }, r.send);
    expect(res).toEqual({ sent: false, reason: "no_consent" });
    expect(r.sent).toHaveLength(0);
  });

  it("refuses when ANY contact sharing the number revoked consent (a refusal belongs to the number)", async () => {
    const { store } = memoryStore([
      { id: "a", phone: "+14805550100", custom_fields: { tcpa_consent: "granted" } },
      { id: "b", phone: "(480) 555-0100", custom_fields: { tcpa_consent: "revoked" } },
    ]);
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "opted_out" });
    expect(r.sent).toHaveLength(0);
  });

  it("refuses AI replies to an opted-out number too", async () => {
    const { store } = memoryStore([{ id: "a", phone: "+14805550100", custom_fields: { tcpa_consent: "revoked" } }]);
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "reply", { purpose: "reply" }, r.send);
    expect(res).toEqual({ sent: false, reason: "opted_out" });
  });

  it("fails closed when the opt-out state cannot be read", async () => {
    const { store } = memoryStore([], { failReads: true });
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "guard_unavailable" });
    expect(r.sent).toHaveLength(0);
  });

  it("stops marketing SMS at the daily cap", async () => {
    process.env.SMS_DAILY_CAP = "3";
    const { store } = memoryStore([], { sentToday: 3 });
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "daily_cap" });
    expect(r.sent).toHaveLength(0);
  });

  it("always sends the one opt-out confirmation, even at the cap", async () => {
    process.env.SMS_DAILY_CAP = "0";
    const { store } = memoryStore([{ id: "a", phone: "+14805550100", custom_fields: { tcpa_consent: "revoked" } }]);
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "You have been opted out.", { purpose: "optout_confirmation" }, r.send);
    expect(res).toEqual({ sent: true });
  });
});

describe("recordOptOut", () => {
  it("revokes every contact sharing the number, in any stored format", async () => {
    const { store, contacts } = memoryStore([
      { id: "a", phone: "+14805550100", custom_fields: { tcpa_consent: "granted", note: "keep" } },
      { id: "b", phone: "480-555-0100", custom_fields: {} },
      { id: "c", phone: "+14805559999", custom_fields: { tcpa_consent: "granted" } },
    ]);
    await recordOptOut(store, "+14805550100", "2026-11-09T00:00:00Z");
    expect(contacts[0].custom_fields).toMatchObject({ tcpa_consent: "revoked", note: "keep" });
    expect(contacts[1].custom_fields).toMatchObject({ tcpa_consent: "revoked" });
    expect(contacts[2].custom_fields.tcpa_consent).toBe("granted");
  });

  it("records a STOP from a number with no contact, so later sends are still blocked", async () => {
    const { store } = memoryStore([]);
    await recordOptOut(store, "(480) 555-0100", "2026-11-09T00:00:00Z");
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "opted_out" });
  });
});

describe("shared opt-out table", () => {
  it("blocks a number the main app recorded in sms_opt_outs", async () => {
    const { store } = memoryStore([], { sharedOptOuts: ["+14805550100"] });
    const r = recorder();
    const res = await guardedSendSms(store, "480-555-0100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "opted_out" });
  });
  it("writes STOPs to the shared table so the main app honours them too", async () => {
    const { store, sharedOptOuts } = memoryStore([]);
    await recordOptOut(store, "(480) 555-0100", "2026-11-09T00:00:00Z");
    expect(sharedOptOuts.has("+14805550100")).toBe(true);
  });
});

describe("daily cap reservation", () => {
  beforeEach(() => { delete process.env.SMS_DAILY_CAP; });

  it("does not send when the reservation row cannot be written (so no send goes uncounted)", async () => {
    const { store } = memoryStore([], { failReserve: true });
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "guard_unavailable" });
    expect(r.sent).toHaveLength(0);
  });

  it("never lets concurrent sends at the edge exceed the cap", async () => {
    process.env.SMS_DAILY_CAP = "5";
    const { store, counts } = memoryStore([], { sentToday: 4 });
    const r = recorder();
    const results = await Promise.all(
      [1, 2, 3].map(() => guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send)),
    );
    expect(r.sent.length).toBeLessThanOrEqual(1);
    expect(results.filter((x) => x.sent).length).toBe(r.sent.length);
    expect(counts().outbound).toBeLessThanOrEqual(5);
  });

  it("releases the reservation when Twilio fails", async () => {
    const { store, counts } = memoryStore([]);
    const failing = async () => { throw new Error("twilio 500"); };
    await expect(
      guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, failing),
    ).rejects.toThrow("twilio 500");
    expect(counts()).toMatchObject({ outbound: 0, released: 1 });
  });
});

describe("phoneDigitsRegex", () => {
  it("matches the number however it was typed", () => {
    const re = new RegExp(phoneDigitsRegex("+14805550100")!);
    for (const f of ["+14805550100", "480 555 0100", "1 (480) 555-0100", "480.555.0100", "+1-480-555-0100", "4805550100"]) {
      expect(re.test(f), f).toBe(true);
    }
  });
  it("does not match a different number or a longer string containing it", () => {
    const re = new RegExp(phoneDigitsRegex("4805550100")!);
    expect(re.test("4805550101")).toBe(false);
    expect(re.test("94805550100")).toBe(false);
    expect(re.test("48055501001")).toBe(false);
  });
  it("treats a space-separated revoked duplicate as the same number", async () => {
    const { store } = memoryStore([
      { id: "a", phone: "+14805550100", custom_fields: { tcpa_consent: "granted" } },
      { id: "b", phone: "480 555 0100", custom_fields: { tcpa_consent: "revoked" } },
    ]);
    const r = recorder();
    const res = await guardedSendSms(store, "+14805550100", "hi", { purpose: "marketing", consentGranted: true }, r.send);
    expect(res).toEqual({ sent: false, reason: "opted_out" });
  });
});

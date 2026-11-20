import { afterEach, describe, expect, it, vi } from "vitest";
import { SendsDisabledError, sendsDisabledReason } from "@/lib/channels/send-guard";

describe("preview safe mode", () => {
  it.each([
    [{ VERCEL_ENV: "production" }, null],
    [{}, null],
    [{ VERCEL_ENV: "development" }, null],
    [{ VERCEL_ENV: "preview" }, "Vercel preview deployment"],
    [{ VERCEL_ENV: "preview", LEAD_DADDY_ALLOW_PREVIEW_SENDS: "true" }, null],
    [{ VERCEL_ENV: "production", LEAD_DADDY_DISABLE_SENDS: "true" }, "LEAD_DADDY_DISABLE_SENDS=true"],
  ])("%j -> %s", (env, reason) => {
    expect(sendsDisabledReason(env)).toBe(reason);
  });
});

describe("real senders refuse on a preview, before any network call", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("texts, calls and emails throw SendsDisabledError and never call fetch", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+16025550100");
    vi.stubEnv("SENDGRID_API_KEY", "test");
    vi.stubEnv("APP_BASE_URL", "https://example.com");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { sendSms, startCall } = await import("@/lib/channels/twilio");
    const { sendEmail } = await import("@/lib/channels/email");
    await expect(sendSms("+16025550101", "hi")).rejects.toBeInstanceOf(SendsDisabledError);
    await expect(startCall("+16025550101")).rejects.toBeInstanceOf(SendsDisabledError);
    await expect(sendEmail({ to: "a@example.com", subject: "s", html: "h" })).rejects.toBeInstanceOf(SendsDisabledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("production still sends", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SENDGRID_API_KEY", "test");
    const fetchSpy = vi.fn(async () => new Response("", { status: 202, headers: { "x-message-id": "m1" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const { sendEmail } = await import("@/lib/channels/email");
    await expect(sendEmail({ to: "a@example.com", subject: "s", html: "h" })).resolves.toMatchObject({ provider: "sendgrid" });
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

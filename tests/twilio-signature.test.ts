import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { validateTwilioSignature } from "@/lib/twilio-signature";

// Fixture computed with the documented algorithm: base64(HMAC-SHA1(token, url+sortedParams))
function hmacSha1(token: string, data: string): string {
  return createHmac("sha1", token).update(data).digest("base64");
}

describe("validateTwilioSignature", () => {
  const token = "test-auth-token";
  const url = "https://app.example.com/api/channels/sms";
  const params = { From: "+14805551234", Body: "hello", MessageSid: "SM123" };
  const data = url + ["Body", "From", "MessageSid"].map((k) => `${k}${params[k as keyof typeof params]}`).join("");
  const goodSig = hmacSha1(token, data);

  it("accepts a valid signature", async () => {
    expect(await validateTwilioSignature({ authToken: token, url, params, signatureHeader: goodSig })).toBe(true);
  });
  it("rejects a bad signature, missing header, wrong token, tampered param, wrong url", async () => {
    expect(await validateTwilioSignature({ authToken: token, url, params, signatureHeader: "aGVsbG8=" })).toBe(false);
    expect(await validateTwilioSignature({ authToken: token, url, params, signatureHeader: null })).toBe(false);
    expect(await validateTwilioSignature({ authToken: "other", url, params, signatureHeader: goodSig })).toBe(false);
    expect(await validateTwilioSignature({ authToken: token, url, params: { ...params, Body: "evil" }, signatureHeader: goodSig })).toBe(false);
    expect(await validateTwilioSignature({ authToken: token, url: url + "?x=1", params, signatureHeader: goodSig })).toBe(false);
  });
});

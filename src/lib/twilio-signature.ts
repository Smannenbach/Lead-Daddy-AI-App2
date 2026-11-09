// Twilio request signature validation (X-Twilio-Signature).
// Twilio signs webhook POSTs with HMAC-SHA1 of the full URL + sorted POST params,
// keyed on the account's auth token. Without this, anyone can POST to our
// voice/SMS webhooks and spend money on AI replies and outbound texts.

import { timingSafeEqual } from "@/lib/crypto";

export async function validateTwilioSignature(opts: {
  authToken: string;
  url: string; // the exact URL Twilio called (protocol + host + path + query)
  params: Record<string, string>; // urlencoded POST body as key/value
  signatureHeader: string | null;
}): Promise<boolean> {
  if (!opts.signatureHeader) return false;
  const sorted = Object.keys(opts.params)
    .sort()
    .map((k) => `${k}${opts.params[k]}`)
    .join("");
  const data = opts.url + sorted;
  const key = opts.authToken;
  // HMAC-SHA1 via Web Crypto
  return hmacSha1Equals(key, data, opts.signatureHeader);
}

async function hmacSha1Equals(key: string, data: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  const computed = base64(new Uint8Array(mac));
  return timingSafeEqual(computed, expected);
}

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

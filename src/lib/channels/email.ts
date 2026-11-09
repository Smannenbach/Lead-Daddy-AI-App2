// Email sending with automatic provider selection: SendGrid when configured
// (domain-authenticated loandaddy.ai), Resend as fallback. Callers just use sendEmail.

import { sendEmail as sendViaResend } from "./resend";

interface EmailOpts {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

async function sendViaSendGrid(opts: EmailOpts): Promise<{ id: string }> {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error("SENDGRID_API_KEY not configured");
  const from = opts.from ?? process.env.EMAIL_FROM ?? "LeadDaddy.ai <steve@loandaddy.ai>";
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: { email: from.replace(/^[^<]*<|>$/g, "").trim(), name: from.includes("<") ? from.split("<")[0].trim() : undefined },
      subject: opts.subject,
      content: [{ type: "text/html", value: opts.html }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return { id: res.headers.get("x-message-id") ?? "sent" };
}

export async function sendEmail(opts: EmailOpts): Promise<{ id: string; provider: "sendgrid" | "resend" }> {
  if (process.env.SENDGRID_API_KEY) {
    const r = await sendViaSendGrid(opts);
    return { ...r, provider: "sendgrid" };
  }
  const r = await sendViaResend(opts);
  return { ...r, provider: "resend" };
}

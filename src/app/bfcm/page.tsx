"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function CaptureForm() {
  const params = useSearchParams();
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].map((k) => [k, params.get(k) ?? ""]),
  );
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "", consent: false, website: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    const res = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        company: form.company || undefined,
        message: form.message || undefined,
        consent: form.consent,
        website: form.website, // honeypot
        page_url: window.location.href,
        utm,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setConsentGiven(d.consent?.given === true);
      setState("done");
    } else {
      setError(typeof d.error === "string" ? d.error : "Something went wrong. Try again.");
      setState("error");
    }
  }

  const field = (key: keyof typeof form, label: string, type = "text", required = false, maxLength = 200, autoComplete?: string) => (
    <label className="block text-left text-sm">
      <span className="mb-1 block text-slate-400">{label}{required ? " *" : ""}</span>
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 outline-none focus:border-slate-500"
      />
    </label>
  );

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
        <h2 className="text-xl font-semibold text-emerald-400">You&apos;re on the list.</h2>
        <p className="mt-2 text-sm text-slate-300" role="status">
          {consentGiven
            ? "We got your request and will reach out about the Black Friday offer."
            : "We got your request. You didn't check the consent box, so we won't call or text you."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {field("name", "Name", "text", true, 200, "name")}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("email", "Email", "email", true, 254, "email")}
        {field("phone", "Phone", "tel", true, 20, "tel")}
      </div>
      {field("company", "Company / LLC", "text", false, 200, "organization")}
      <label className="block text-left text-sm">
        <span className="mb-1 block text-slate-400">What are you looking to finance?</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="e.g. 750k SFR rental in Phoenix, LLC borrower, ~25% down"
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 outline-none focus:border-slate-500"
        />
      </label>
      <label className="flex items-start gap-2 text-left text-xs text-slate-400">
        {/* Optional and separate from submitting. Wording is versioned in src/lib/consent.ts. */}
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          className="mt-0.5 accent-slate-100"
        />
        I agree to be contacted by phone, SMS, and email about this offer (TCPA consent). Message &amp; data rates may apply; opt out anytime.
      </label>
      {/* honeypot: hidden from humans, bots fill it */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={form.website}
        onChange={(e) => setForm({ ...form, website: e.target.value })}
        className="hidden"
        aria-hidden="true"
      />
      {state === "error" && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-md bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
      >
        {state === "sending" ? "Submitting…" : "Claim the Black Friday deal"}
      </button>
      <p className="text-[11px] text-slate-400">
        Business-purpose investment property loans only.{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link> · <Link href="/terms" className="underline">Terms</Link>
      </p>
      {/* TODO(legal, Steve): replace with the lender's legal name, NMLS ID and any required disclosures. */}
      <p className="rounded border border-dashed border-slate-700 px-3 py-2 text-[11px] text-slate-400">
        [LENDER LEGAL NAME] · NMLS ID [NUMBER] · [REQUIRED DISCLOSURES: Steve to add]
      </p>
    </form>
  );
}

// TODO(legal, owner decision): this page needs wording only you and counsel can supply.
// Nothing below was written or changed by the QA backend fixes:
//   * Privacy Policy and Terms links (none on the page today)
//   * lender name and NMLS ID
//   * consent text (the checkbox wording) and whether it covers AI voice calls
//   * the confirmation shown when consent is NOT given (the API now returns
//     consent.given so the page can show a different message)
// If the consent text changes, add a new version in src/lib/consent.ts; don't edit the old one.
export default function BfcmPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-eyebrow font-semibold uppercase text-indigo-400">
          Black Friday · Cyber Monday 2026
        </p>
        <h1 className="text-4xl font-extrabold leading-[1.1] sm:text-hero">
          Lock Your DSCR Loan With <span className="text-indigo-400">Waived Processing Fees</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-400">
          For investment-property investors only: purchase, rate-term, or cash-out. Apply between Nov 27–30
          and the $1,995 processing fee is on us. AI-powered qualification — answers in minutes, not days.
        </p>

        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <Suspense>
            <CaptureForm />
          </Suspense>
        </div>

        <div className="mt-12 grid gap-4 text-left text-sm sm:grid-cols-3">
          {[
            ["Investor-first", "Qualify on the property's cash flow (DSCR), not your personal income."],
            ["Fast & AI-powered", "AI loan officer triages your scenario 24/7 and routes it to a human specialist."],
            ["Business-purpose only", "No owner-occupied or second-home programs — investment properties only."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <h3 className="font-medium text-slate-100">{h}</h3>
              <p className="mt-1 text-slate-400">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function CaptureForm() {
  const params = useSearchParams();
  const utm = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"].map((k) => [k, params.get(k) ?? ""]),
  );
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "", consent: false, website: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

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
    if (res.ok) setState("done");
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error === "missing_contact" ? "Please provide an email or phone number." : "Something went wrong — try again.");
      setState("error");
    }
  }

  const field = (key: keyof typeof form, label: string, type = "text", required = false) => (
    <label className="block text-left text-sm">
      <span className="mb-1 block text-neutral-400">{label}{required ? " *" : ""}</span>
      <input
        type={type}
        required={required}
        value={form[key] as string}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 outline-none focus:border-neutral-500"
      />
    </label>
  );

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-emerald-900 bg-emerald-950/40 p-8">
        <h2 className="text-xl font-semibold text-emerald-300">You&apos;re on the list.</h2>
        <p className="mt-2 text-sm text-neutral-300">
          We&apos;ll reach out about the Black Friday offer. Prefer to talk now? Call us and mention the BFCM deal.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {field("name", "Name", "text", true)}
      <div className="grid gap-4 sm:grid-cols-2">
        {field("email", "Email", "email")}
        {field("phone", "Phone")}
      </div>
      {field("company", "Company / LLC")}
      <label className="block text-left text-sm">
        <span className="mb-1 block text-neutral-400">What are you looking to finance?</span>
        <textarea
          rows={3}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="e.g. 750k SFR rental in Phoenix, LLC borrower, ~25% down"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 outline-none focus:border-neutral-500"
        />
      </label>
      <label className="flex items-start gap-2 text-left text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          className="mt-0.5 accent-neutral-100"
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
        className="w-full rounded-xl bg-white px-6 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
      >
        {state === "sending" ? "Submitting…" : "Claim the Black Friday deal"}
      </button>
      <p className="text-[11px] text-neutral-500">
        Business-purpose investment property loans only. We never share your information.
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
    <main className="min-h-screen bg-neutral-950 px-6 py-16 text-neutral-100">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">
          Black Friday · Cyber Monday 2026
        </p>
        <h1 className="text-4xl font-bold sm:text-5xl">
          Lock your DSCR loan with <span className="text-amber-400">waived processing fees</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-neutral-400">
          For investment-property investors only: purchase, rate-term, or cash-out. Apply between Nov 27–30
          and the $1,995 processing fee is on us. AI-powered qualification — answers in minutes, not days.
        </p>

        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6">
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
            <div key={h} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <h3 className="font-medium text-neutral-100">{h}</h3>
              <p className="mt-1 text-neutral-400">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

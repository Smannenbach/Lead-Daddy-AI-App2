"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getJson, sendJson } from "@/lib/client/api";
import { PageBody, PageHeader } from "@/components/app/AppShell";
import { Dialog, useDialogs } from "@/components/ui/Dialog";
import { btn, btnDanger, btnPrimary, card, cardHeader, h2, input, muted, resultErr, resultOk } from "@/components/ui/styles";

interface Campaign {
  id: string;
  name: string;
  status: string;
  recipients: number;
  steps: number;
  channels: string[];
  sent: number;
  skipped: number;
  pendingSteps: number;
}

interface Preview {
  campaignId: string;
  name: string;
  channels: string[];
  steps: Array<{ index: number; channel: string; offsetMinutes: number; subject: string | null; body: string }>;
  recipients: number;
  found: number;
  missing: number;
  willReach: number;
  skipped: Array<{ leadId: string; name: string; channel: string; reason: string }>;
}

const CHANNEL_LABEL: Record<string, string> = { email: "Email", sms: "Text", call: "Call" };
const STATUS_STYLE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
};

function when(min: number): string {
  if (min === 0) return "At launch";
  if (min % 1440 === 0) return `Day ${min / 1440 + 1}`;
  return `${Math.round(min / 60)} hours after launch`;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ name: "", brief: "", email: true, sms: false, call: false, allLeads: false });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [busyRow, setBusyRow] = useState("");
  const [review, setReview] = useState<Preview | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const { confirm, dialogs } = useDialogs();

  const load = useCallback(async () => {
    const r = await getJson<{ campaigns?: Campaign[] }>("/api/campaigns");
    if (r.ok) {
      setCampaigns(Array.isArray(r.data.campaigns) ? r.data.campaigns : []);
      setLoadError("");
    } else setLoadError(r.message);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  const note = (id: string, ok: boolean, text: string) => setRowMsg((m) => ({ ...m, [id]: { ok, text } }));

  async function create(e: FormEvent) {
    e.preventDefault();
    const channelSeq = (["email", "sms", "call"] as const).filter((c) => form[c]);
    if (channelSeq.length === 0) return setCreateResult({ ok: false, text: "Pick at least one channel." });
    setCreating(true);
    setCreateResult(null);
    let leadIds: string[] = [];
    if (form.allLeads) {
      const leads = await getJson<{ leads?: Array<{ id: string }> }>("/api/leads");
      if (!leads.ok) {
        setCreating(false);
        return setCreateResult({ ok: false, text: leads.message });
      }
      leadIds = (leads.data.leads ?? []).map((l) => l.id);
    }
    const r = await sendJson("/api/campaigns", "POST", {
      name: form.name.trim(),
      brief: form.brief.trim() || undefined,
      channelSeq,
      leadIds,
      generateCopy: true,
    });
    setCreating(false);
    if (!r.ok) return setCreateResult({ ok: false, text: String(r.data.error) });
    setCreateResult({ ok: true, text: `${form.name.trim()} saved as a draft. Review it below before launching.` });
    setForm({ name: "", brief: "", email: true, sms: false, call: false, allLeads: false });
    await load();
  }

  async function openReview(c: Campaign) {
    setBusyRow(c.id);
    setLaunchError("");
    const r = await getJson<Preview>(`/api/campaigns/${c.id}/preview`);
    setBusyRow("");
    if (!r.ok) return note(c.id, false, r.message);
    setReview(r.data);
  }

  async function launch() {
    if (!review) return;
    setLaunching(true);
    setLaunchError("");
    const r = await sendJson("/api/campaigns", "PATCH", {
      action: "launch",
      campaignId: review.campaignId,
      // The user has just seen the skip list in this dialog.
      acknowledgeSkips: review.skipped.length > 0,
    });
    setLaunching(false);
    if (!r.ok) return setLaunchError(String(r.data.error));
    note(review.campaignId, true, String(r.data.message ?? "Launched."));
    setReview(null);
    await load();
  }

  async function runNext(c: Campaign) {
    const ok = await confirm({
      title: "Send the next step now?",
      body: `The next step of ${c.name} goes out right away to its ${c.recipients} recipient(s). Leads without consent are skipped for texts and calls.`,
      confirmLabel: "Send now",
    });
    if (!ok) return;
    setBusyRow(c.id);
    const r = await sendJson(`/api/campaigns/${c.id}/advance`, "POST");
    setBusyRow("");
    if (!r.ok) return note(c.id, false, String(r.data.error));
    note(
      c.id,
      true,
      r.data.advanced ? `${CHANNEL_LABEL[String(r.data.channel)] ?? r.data.channel} step: ${r.data.sent} sent, ${r.data.skipped} skipped.` : "Nothing is due yet.",
    );
    await load();
  }

  async function remove(c: Campaign) {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      body: c.status === "live" ? "This stops the campaign. Nothing already sent is undone." : "The draft will be removed.",
      confirmLabel: "Delete campaign",
      danger: true,
    });
    if (!ok) return;
    setBusyRow(c.id);
    const r = await sendJson(`/api/campaigns/${c.id}`, "DELETE");
    setBusyRow("");
    if (!r.ok) return note(c.id, false, String(r.data.error));
    await load();
  }

  const skippedLeads = review ? new Set(review.skipped.map((s) => s.leadId)).size : 0;
  const canLaunch = review !== null && review.found > 0 && review.missing === 0 && review.steps.length > 0;

  return (
    <PageBody>
      {dialogs}
      <PageHeader title="Campaigns" subtitle="Nothing sends until you review a campaign and launch it." />

      <section className={`${card} mb-6`} aria-labelledby="new-h">
        <div className={cardHeader}><h2 id="new-h" className={h2}>New campaign</h2></div>
        <form onSubmit={create} className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Name *</span>
              <input required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} w-full`} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Brief for the AI writer</span>
              <input maxLength={1000} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder="Offer, audience and goal" className={`${input} w-full`} />
            </label>
          </div>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <legend className="mb-1 w-full font-medium">Channels</legend>
            {(["email", "sms", "call"] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input type="checkbox" checked={form[c]} onChange={(e) => setForm({ ...form, [c]: e.target.checked })} className="accent-indigo-600" />
                {CHANNEL_LABEL[c]}
              </label>
            ))}
            <span className="text-xs text-slate-500">Texts and calls only go to leads with consent on file.</span>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.allLeads} onChange={(e) => setForm({ ...form, allLeads: e.target.checked })} className="accent-indigo-600" />
            Add all current leads as recipients
          </label>
          <button type="submit" disabled={creating || !form.name.trim()} className={btnPrimary}>{creating ? "Writing the copy…" : "Create draft with AI copy"}</button>
          {createResult && <p role={createResult.ok ? "status" : "alert"} className={createResult.ok ? resultOk : resultErr}>{createResult.text}</p>}
        </form>
      </section>

      <section className={card} aria-labelledby="list-h">
        <div className={cardHeader}><h2 id="list-h" className={h2}>Your campaigns</h2></div>
        {loadError ? (
          <p role="alert" className="p-4 text-sm text-red-700">{loadError} <button onClick={load} className="ml-1 font-semibold underline">Retry</button></p>
        ) : campaigns === null ? (
          <p className={`${muted} p-4`}>Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className={`${muted} p-4`}>No campaigns yet. Create one above.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {campaigns.map((c) => {
              const running = c.status === "live" || c.status === "active";
              return (
                <li key={c.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        <span className="truncate">{c.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${STATUS_STYLE[c.status] ?? STATUS_STYLE.draft}`}>{c.status}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {c.recipients} recipient(s) · {c.channels.map((x) => CHANNEL_LABEL[x] ?? x).join(" then ") || "No steps yet"}
                        {(c.sent > 0 || c.skipped > 0) && ` · ${c.sent} sent, ${c.skipped} skipped`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!running && (
                        <button className={btnPrimary} disabled={busyRow === c.id} onClick={() => openReview(c)}>{busyRow === c.id ? "Loading…" : "Review and launch"}</button>
                      )}
                      {c.status === "live" && c.pendingSteps > 0 && (
                        <button className={btn} disabled={busyRow === c.id} onClick={() => runNext(c)}>{busyRow === c.id ? "Sending…" : "Run next step"}</button>
                      )}
                      <button className={btnDanger} disabled={busyRow === c.id} onClick={() => remove(c)}>Delete</button>
                    </div>
                  </div>
                  {rowMsg[c.id] && <p role={rowMsg[c.id].ok ? "status" : "alert"} className={rowMsg[c.id].ok ? resultOk : resultErr}>{rowMsg[c.id].text}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        open={review !== null}
        wide
        title={review ? `Review ${review.name}` : ""}
        onClose={() => setReview(null)}
        footer={
          <>
            <button className={btn} onClick={() => setReview(null)}>Cancel</button>
            <button className={btnPrimary} disabled={!canLaunch || launching} onClick={launch}>
              {launching ? "Launching…" : skippedLeads > 0 ? `Launch and skip ${skippedLeads}` : "Launch"}
            </button>
          </>
        }
      >
        {review && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Recipients", review.recipients], ["Will be reached", review.willReach], ["Skipped", skippedLeads]].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="text-xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {review.recipients === 0 && <p className={resultErr}>This campaign has no recipients. Add leads before launching.</p>}
            {review.missing > 0 && <p className={resultErr}>{review.missing} recipient(s) were deleted. Remove them before launching.</p>}

            <div>
              <h3 className="mb-2 font-semibold text-slate-900">What goes out</h3>
              {review.steps.length === 0 ? (
                <p className={resultErr}>No messages are written yet.</p>
              ) : (
                <ol className="space-y-2">
                  {review.steps.map((st) => (
                    <li key={st.index} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{CHANNEL_LABEL[st.channel] ?? st.channel} · {when(st.offsetMinutes)}</p>
                      {st.subject && <p className="mt-1 font-medium">Subject: {st.subject}</p>}
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{st.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {review.skipped.length > 0 && (
              <div>
                <h3 className="mb-2 font-semibold text-slate-900">Who gets skipped</h3>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  {review.skipped.map((s, i) => (
                    <li key={`${s.leadId}-${s.channel}-${i}`}>{s.name}: {CHANNEL_LABEL[s.channel] ?? s.channel} skipped. {s.reason}.</li>
                  ))}
                </ul>
              </div>
            )}
            {launchError && <p role="alert" className={resultErr}>{launchError}</p>}
          </div>
        )}
      </Dialog>
    </PageBody>
  );
}

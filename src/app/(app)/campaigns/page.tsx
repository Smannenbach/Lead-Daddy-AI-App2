"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getJson, sendJson } from "@/lib/client/api";
import { PageBody, PageHeader } from "@/components/app/AppShell";
import { useDialogs } from "@/components/ui/app-dialogs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckField, Field, Panel } from "@/components/app/Panel";
import { Megaphone, Play, Rocket, Trash2 } from "lucide-react";
import { brandCta, dangerOutline } from "@/components/ui/styles";
import { EmptyState, Spinner, StatusMessage } from "@/components/ui/Status";

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
  live: "bg-emerald-100 text-emerald-800",
  active: "bg-emerald-100 text-emerald-800",
  draft: "bg-slate-100 text-slate-700",
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
      title: "Send the Next Step Now?",
      body: `The next step of ${c.name} goes out right away to its ${c.recipients} recipient(s). Leads without consent are skipped for texts and calls.`,
      confirmLabel: "Send Now",
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
      confirmLabel: "Delete Campaign",
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
      <PageHeader subtitle="Nothing sends until you review a campaign and launch it." />

      <Panel id="new" title="New Campaign" icon={Megaphone} className="mb-6">
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="camp-name" label="Name" required maxLength={200} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field id="camp-brief" label="Brief for the AI Writer" maxLength={1000} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder="Offer, audience and goal" />
          </div>
          <fieldset className="flex flex-wrap items-center gap-4 text-body text-slate-700">
            <legend className="mb-1 w-full font-medium">Channels</legend>
            {(["email", "sms", "call"] as const).map((c) => (
              <CheckField key={c} id={`camp-${c}`} checked={form[c]} onChange={(v) => setForm({ ...form, [c]: v })}>{CHANNEL_LABEL[c]}</CheckField>
            ))}
            <span className="text-caption text-slate-500">Texts and calls only go to leads with consent on file.</span>
          </fieldset>
          <CheckField id="camp-all" checked={form.allLeads} onChange={(v) => setForm({ ...form, allLeads: v })}>Add all current leads as recipients</CheckField>
          <Button type="submit" disabled={creating || !form.name.trim()} className={brandCta}>{creating ? "Writing the Copy…" : "Create Draft with AI Copy"}</Button>
          {createResult && <StatusMessage tone={createResult.ok ? "ok" : "err"}>{createResult.text}</StatusMessage>}
        </form>
      </Panel>

      <Panel id="list" title="Your Campaigns" bodyClassName="p-0">
        {loadError ? (
          <div className="p-4"><StatusMessage tone="err" className="mt-0">{loadError} <Button variant="link" onClick={load} className="ml-1 h-auto p-0 font-semibold text-current underline">Retry</Button></StatusMessage></div>
        ) : campaigns === null ? (
          <div className="p-4"><Spinner label="Loading campaigns…" /></div>
        ) : campaigns.length === 0 ? (
          <div className="p-4"><EmptyState icon={Megaphone} title="No Campaigns Yet">Create one above. It stays a draft until you review and launch it.</EmptyState></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {campaigns.map((c) => {
              const running = c.status === "live" || c.status === "active";
              return (
                <li key={c.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-bold">
                        <span className="truncate">{c.name}</span>
                        <Badge variant="outline" className={`border-transparent capitalize ${STATUS_STYLE[c.status] ?? STATUS_STYLE.draft}`}>{c.status}</Badge>
                      </p>
                      <p className="mt-0.5 text-body text-slate-500">
                        {c.recipients} recipient(s) · {c.channels.map((x) => CHANNEL_LABEL[x] ?? x).join(" then ") || "No steps yet"}
                        {(c.sent > 0 || c.skipped > 0) && ` · ${c.sent} sent, ${c.skipped} skipped`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!running && (
                        <Button className={brandCta} disabled={busyRow === c.id} onClick={() => openReview(c)}><Rocket aria-hidden />{busyRow === c.id ? "Loading…" : "Review and Launch"}</Button>
                      )}
                      {c.status === "live" && c.pendingSteps > 0 && (
                        <Button variant="outline" disabled={busyRow === c.id} onClick={() => runNext(c)}><Play aria-hidden />{busyRow === c.id ? "Sending…" : "Run Next Step"}</Button>
                      )}
                      <Button variant="outline" className={dangerOutline} disabled={busyRow === c.id} onClick={() => remove(c)}><Trash2 aria-hidden />Delete</Button>
                    </div>
                  </div>
                  {rowMsg[c.id] && <StatusMessage tone={rowMsg[c.id].ok ? "ok" : "err"}>{rowMsg[c.id].text}</StatusMessage>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Dialog open={review !== null} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{review ? `Review ${review.name}` : ""}</DialogTitle>
          </DialogHeader>
        {review && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[["Recipients", review.recipients], ["Will be reached", review.willReach], ["Skipped", skippedLeads]].map(([k, v]) => (
                <div key={String(k)} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-caption text-slate-500">{k}</p>
                  <p className="text-xl font-bold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            {review.recipients === 0 && <StatusMessage tone="err">This campaign has no recipients. Add leads before launching.</StatusMessage>}
            {review.missing > 0 && <StatusMessage tone="err">{review.missing} recipient(s) were deleted. Remove them before launching.</StatusMessage>}

            <div>
              <h3 className="mb-2 text-h2 font-bold text-slate-900">What Goes Out</h3>
              {review.steps.length === 0 ? (
                <StatusMessage tone="err">No messages are written yet.</StatusMessage>
              ) : (
                <ol className="space-y-2">
                  {review.steps.map((st) => (
                    <li key={st.index} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-caption font-semibold uppercase tracking-wide text-slate-500">{CHANNEL_LABEL[st.channel] ?? st.channel} · {when(st.offsetMinutes)}</p>
                      {st.subject && <p className="mt-1 font-medium">Subject: {st.subject}</p>}
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{st.body}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {review.skipped.length > 0 && (
              <div>
                <h3 className="mb-2 text-h2 font-bold text-slate-900">Who Gets Skipped</h3>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg bg-amber-100 p-3 text-amber-900">
                  {review.skipped.map((s, i) => (
                    <li key={`${s.leadId}-${s.channel}-${i}`}>{s.name}: {CHANNEL_LABEL[s.channel] ?? s.channel} skipped. {s.reason}.</li>
                  ))}
                </ul>
              </div>
            )}
            {launchError && <StatusMessage tone="err">{launchError}</StatusMessage>}
          </div>
        )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
            <Button className={brandCta} disabled={!canLaunch || launching} onClick={launch}>
              <Rocket aria-hidden />
              {launching ? "Launching…" : skippedLeads > 0 ? `Launch and Skip ${skippedLeads}` : "Launch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}

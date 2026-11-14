// Pure sequence-planning helpers for campaign steps. No network, no IO.

export type Channel = "email" | "sms" | "call";

export interface SequenceStep {
  channel: Channel;
  offsetMinutes: number; // relative to launch
  subject?: string;
  body: string;
}

export interface StepRun {
  leadId: string;
  stepIndex: number;
  status: "sent" | "skipped_no_consent" | "skipped_unverified" | "failed";
  at: string; // ISO
  detail?: string;
}

export interface SequenceState {
  steps: SequenceStep[];
  launchedAt: string | null;
  runs: StepRun[];
}

export function buildSteps(opts: {
  channelSeq: Channel[];
  offsetsMinutes?: number[];
  bodies: Record<Channel, string>;
  subjects?: Partial<Record<Channel, string>>;
}): SequenceStep[] {
  const offsets = opts.offsetsMinutes ?? opts.channelSeq.map((_, i) => i * 60 * 24); // default: one per day
  return opts.channelSeq.map((channel, i) => ({
    channel,
    offsetMinutes: offsets[i] ?? i * 60 * 24,
    subject: opts.subjects?.[channel],
    body: opts.bodies[channel],
  }));
}

export function nextDueStep(state: SequenceState, now: Date): number | null {
  if (!state.launchedAt || state.steps.length === 0) return null;
  const launched = new Date(state.launchedAt).getTime();
  const executed = new Set(
    state.runs.filter((r) => r.status === "sent" || r.status === "failed").map((r) => r.stepIndex),
  );
  for (let i = 0; i < state.steps.length; i++) {
    if (executed.has(i)) continue;
    if (launched + state.steps[i].offsetMinutes * 60_000 <= now.getTime()) return i;
  }
  return null;
}

/** A recipient is eligible for a channel only with consent (sms/call) + valid contact point. */
export function skipReason(opts: {
  channel: Channel;
  tcpaConsent: boolean;
  emailStatus: string | null;
  phoneStatus: string | null;
}): StepRun["status"] | null {
  if (opts.channel === "email") {
    return (opts.emailStatus ?? "").toLowerCase() === "valid" ? null : "skipped_unverified";
  }
  if (!opts.tcpaConsent) return "skipped_no_consent";
  return (opts.phoneStatus ?? "").toLowerCase() === "valid" ? null : "skipped_unverified";
}

export function emptySequenceState(): SequenceState {
  return { steps: [], launchedAt: null, runs: [] };
}

// ── Pre-launch preview: who would be skipped, and why ──────────────────────

export const SKIP_REASON_TEXT: Record<Exclude<StepRun["status"], "sent" | "failed">, (c: Channel) => string> = {
  skipped_no_consent: () => "No consent on file for texts or calls",
  skipped_unverified: (c) => (c === "email" ? "Email not verified as valid" : "Phone not verified as valid"),
};

export interface PreviewContact {
  id: string;
  name: string;
  tcpaConsent: boolean;
  emailStatus: string | null;
  phoneStatus: string | null;
}

export interface PreviewSkip {
  leadId: string;
  name: string;
  channel: Channel;
  reason: string;
}

/** Channels a campaign will use: its steps if written, otherwise its planned channel order. */
export function campaignChannels(steps: SequenceStep[], channelSeq: string[]): Channel[] {
  const raw = steps.length > 0 ? steps.map((s) => s.channel) : channelSeq;
  return [...new Set(raw.filter((c): c is Channel => c === "email" || c === "sms" || c === "call"))];
}

/** Uses the same skipReason the send step uses, so the preview can't disagree with a real send. */
export function previewSkips(channels: Channel[], contacts: PreviewContact[]): { willReach: number; skipped: PreviewSkip[] } {
  const skipped: PreviewSkip[] = [];
  const reached = new Set<string>();
  for (const c of contacts) {
    for (const channel of channels) {
      const s = skipReason({ channel, tcpaConsent: c.tcpaConsent, emailStatus: c.emailStatus, phoneStatus: c.phoneStatus });
      if (s === null || s === "sent" || s === "failed") reached.add(c.id);
      else skipped.push({ leadId: c.id, name: c.name, channel, reason: SKIP_REASON_TEXT[s](channel) });
    }
  }
  return { willReach: reached.size, skipped };
}

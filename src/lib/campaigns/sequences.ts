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
  status: "sent" | "skipped_no_consent" | "skipped_unverified" | "skipped_opted_out" | "skipped_daily_cap" | "failed";
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

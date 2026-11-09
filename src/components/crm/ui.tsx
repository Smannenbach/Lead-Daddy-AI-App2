"use client";

import { STAGES, type StageKey } from "@/lib/crm/model";

export const STAGE_STYLES: Record<StageKey, { chip: string; dot: string }> = {
  new: { chip: "bg-sky-950/70 text-sky-300 ring-sky-800/60", dot: "bg-sky-400" },
  contacted: { chip: "bg-violet-950/70 text-violet-300 ring-violet-800/60", dot: "bg-violet-400" },
  qualified: { chip: "bg-amber-950/70 text-amber-300 ring-amber-800/60", dot: "bg-amber-400" },
  proposal: { chip: "bg-orange-950/70 text-orange-300 ring-orange-800/60", dot: "bg-orange-400" },
  negotiation: { chip: "bg-pink-950/70 text-pink-300 ring-pink-800/60", dot: "bg-pink-400" },
  won: { chip: "bg-emerald-950/70 text-emerald-300 ring-emerald-800/60", dot: "bg-emerald-400" },
  lost: { chip: "bg-neutral-900 text-neutral-400 ring-neutral-700/60", dot: "bg-neutral-500" },
};

export function stageLabel(key: StageKey): string {
  return STAGES.find((s) => s.key === key)?.label ?? key;
}

export function StageChip({ stage }: { stage: StageKey }) {
  const s = STAGE_STYLES[stage];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {stageLabel(stage)}
    </span>
  );
}

const STATUS: Record<string, string> = {
  valid: "text-emerald-300",
  granted: "text-emerald-300",
  invalid: "text-red-300",
  revoked: "text-red-300",
  risky: "text-amber-300",
  unknown: "text-neutral-400",
};

export function StatusText({ value }: { value: string }) {
  const v = (value || "unverified").toLowerCase();
  return <span className={`text-xs ${STATUS[v] ?? "text-neutral-500"}`}>{v}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-neutral-800/80 px-1.5 py-0.5 text-[11px] text-neutral-300">{children}</span>;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export function money(n: number | null | undefined): string {
  return typeof n === "number" ? usd.format(n) : "";
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function relative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return shortDate(iso);
}

export const inputCls =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm outline-none placeholder:text-neutral-600 focus:border-neutral-400";
export const btnCls =
  "rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white disabled:opacity-40";
export const btnPrimaryCls =
  "rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white disabled:opacity-40";

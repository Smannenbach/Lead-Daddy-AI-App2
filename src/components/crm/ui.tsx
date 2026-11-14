"use client";

import { STAGES, type StageKey } from "@/lib/crm/model";
import { Badge } from "@/components/ui/badge";
import { tone } from "@/components/ui/styles";

export const STAGE_STYLES: Record<StageKey, { chip: string; dot: string }> = {
  new: { chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  contacted: { chip: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  qualified: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  proposal: { chip: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  negotiation: { chip: "bg-pink-50 text-pink-700 ring-pink-200", dot: "bg-pink-500" },
  won: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  lost: { chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
};

export function stageLabel(key: StageKey): string {
  return STAGES.find((s) => s.key === key)?.label ?? key;
}

export function StageChip({ stage }: { stage: StageKey }) {
  const s = STAGE_STYLES[stage];
  return (
    <Badge variant="outline" className={`gap-1.5 border-transparent text-caption font-semibold ring-1 ring-inset ${s.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {stageLabel(stage)}
    </Badge>
  );
}

const STATUS: Record<string, { cls: string; label?: string }> = {
  valid: { cls: "text-emerald-700" },
  granted: { cls: "text-emerald-700", label: "on file" },
  invalid: { cls: "text-red-700" },
  revoked: { cls: "text-red-700", label: "opted out" },
  risky: { cls: "text-amber-700" },
  unknown: { cls: "text-slate-600" },
  none: { cls: "text-slate-600", label: "none" },
};

export function StatusText({ value }: { value: string }) {
  const v = (value || "unverified").toLowerCase();
  const s = STATUS[v];
  return <span className={`text-caption font-semibold ${s?.cls ?? "text-slate-600"}`}>{s?.label ?? v}</span>;
}

export function Tag({ children }: { children: React.ReactNode }) {
  return <Badge variant="outline" className={tone.brand}>{children}</Badge>;
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

/** Exact local time, e.g. "Nov 13, 2026, 7:23 PM". */
export function exactTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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

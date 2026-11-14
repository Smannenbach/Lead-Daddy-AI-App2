"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { resultErr, resultInfo, resultOk, resultWarn } from "@/components/ui/styles";

export type Tone = "ok" | "err" | "warn" | "info";

const STYLE: Record<Tone, string> = { ok: resultOk, err: resultErr, warn: resultWarn, info: resultInfo };
const ICON = { ok: CheckCircle2, err: XCircle, warn: AlertTriangle, info: Info };

/** A message box. Status color is always paired with an icon and words. */
export function StatusMessage({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const Icon = ICON[tone];
  return (
    <div role={tone === "err" ? "alert" : "status"} className={`${STYLE[tone]} ${className}`}>
      <Icon aria-hidden="true" className={tone === "ok" ? "text-emerald-600" : tone === "err" ? "text-red-500" : tone === "warn" ? "text-amber-500" : "text-slate-500"} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Brand spinner for loading states. */
export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-body text-slate-600 ${className}`}>
      <Loader2 aria-hidden="true" className="size-4 animate-spin text-indigo-600" />
      {label}
    </span>
  );
}

/** Large empty / error state with a 64px icon. */
export function EmptyState({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <Icon aria-hidden className="mb-4 size-16 text-slate-300" />
      <p className="text-h2 font-bold text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-body text-slate-600">{children}</div>}
    </div>
  );
}

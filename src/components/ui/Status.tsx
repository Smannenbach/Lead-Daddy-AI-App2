"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type Tone = "ok" | "err" | "warn" | "info";

const STYLE: Record<Tone, string> = {
  ok: "border-emerald-200 bg-emerald-100 text-emerald-800 [&>svg]:text-emerald-600",
  err: "border-red-200 bg-red-50 text-red-700 [&>svg]:text-red-500",
  warn: "border-amber-200 bg-amber-100 text-amber-900 [&>svg]:text-amber-500",
  info: "border-slate-200 bg-slate-100 text-slate-700 [&>svg]:text-slate-500",
};
const ICON = { ok: CheckCircle2, err: XCircle, warn: AlertTriangle, info: Info };

/** shadcn Alert with a status tone. Color is always paired with an icon and words. */
export function StatusMessage({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const Icon = ICON[tone];
  return (
    <Alert role={tone === "err" ? "alert" : "status"} className={cn("mt-3", STYLE[tone], className)}>
      <Icon aria-hidden="true" />
      <AlertDescription className="text-current">{children}</AlertDescription>
    </Alert>
  );
}

/** Brand spinner for loading states. */
export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 text-body text-slate-600", className)}>
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

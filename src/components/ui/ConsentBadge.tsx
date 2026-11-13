"use client";

export function ConsentBadge({ value }: { value: string | null }) {
  const v = value ?? "none";
  const style = v === "granted" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : v === "revoked" ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  const label = v === "granted" ? "Consent on file" : v === "revoked" ? "Opted out" : "No consent";
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{label}</span>;
}

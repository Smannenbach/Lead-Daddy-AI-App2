"use client";

import { badgeDanger, badgeNeutral, badgeSuccess } from "@/components/ui/styles";

/** Consent as a word-labeled badge (never color alone). */
export function ConsentBadge({ value }: { value: string | null }) {
  const v = value ?? "none";
  if (v === "granted") return <span className={`${badgeSuccess} shrink-0`}>Consent on File</span>;
  if (v === "revoked") return <span className={`${badgeDanger} shrink-0`}>Opted Out</span>;
  return <span className={`${badgeNeutral} shrink-0`}>No Consent</span>;
}

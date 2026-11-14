"use client";

import { Badge } from "@/components/ui/badge";
import { tone } from "@/components/ui/styles";

/** Consent as a word-labeled badge (never color alone). */
export function ConsentBadge({ value }: { value: string | null }) {
  const v = value ?? "none";
  if (v === "granted") return <Badge variant="outline" className={tone.success}>Consent on File</Badge>;
  if (v === "revoked") return <Badge variant="outline" className={tone.danger}>Opted Out</Badge>;
  return <Badge variant="outline" className={tone.neutral}>No Consent</Badge>;
}

// AI run logging + monthly budget guard against the live Base44 ai_run_log table
// (the 0001_init.sql ai_runs table is intentionally NOT applied).

import { organizationId } from "@/lib/supabase/org";
import { createServiceClient } from "@/lib/supabase/server";
import { estimateCost, type ProviderSpec } from "@/lib/ai/providers";

export async function logAiRun(opts: {
  leadId?: string | null;
  task: string;
  provider: ProviderSpec;
  model: string;
  agent?: string | null;
  reason: string;
  tokensIn: number;
  tokensOut: number;
}): Promise<void> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await db.from("ai_run_log").insert({
    correlation_id: opts.leadId ?? null,
    organization_id: organizationId(),
    feature_key: opts.task,
    model_used: opts.model,
    success: true,
    input_tokens: opts.tokensIn,
    output_tokens: opts.tokensOut,
    cost_estimate: estimateCost(opts.provider, opts.tokensIn, opts.tokensOut),
    prompt_version: opts.agent ?? null,
    created_date: now,
    updated_date: now,
  });
  if (error) console.error("ai_run_log insert failed", error.message);
}

export async function monthSpendUsd(): Promise<number> {
  const db = createServiceClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await db
    .from("ai_run_log")
    .select("cost_estimate")
    .gte("created_date", start.toISOString());
  if (error) return 0;
  return (data ?? []).reduce((s: number, r) => s + Number(r.cost_estimate ?? 0), 0);
}

export async function assertAiBudget(): Promise<void> {
  const cap = Number(process.env.AI_MONTHLY_BUDGET_USD ?? "100");
  const spent = await monthSpendUsd();
  if (spent >= cap) {
    throw new Error(`AI monthly budget reached: $${spent.toFixed(2)} of $${cap}. Raise AI_MONTHLY_BUDGET_USD or review ai_run_log.`);
  }
}

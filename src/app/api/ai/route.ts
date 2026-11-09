import { requireUser } from "@/lib/auth";
import { callModel, type ChatMessage } from "@/lib/ai/providers";
import { autoSelect } from "@/lib/ai/router";
import { logAiRun, assertAiBudget } from "@/lib/ai/log";

interface AiRequest {
  prompt: string;
  agent?: string;
  model?: string; // force a provider key (claude|gpt|qwen|...)
  history?: ChatMessage[];
  leadId?: string;
  task?: string;
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as AiRequest | null;
  if (!body?.prompt?.trim()) return Response.json({ error: "prompt is required" }, { status: 400 });

  try {
    await assertAiBudget();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "budget" }, { status: 429 });
  }

  let decision;
  try {
    decision = autoSelect(body.prompt, body.agent);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "no providers" }, { status: 400 });
  }
  if (body.model) {
    const forced = (await import("@/lib/ai/providers")).enabledProviders().find((p) => p.key === body.model);
    if (!forced) return Response.json({ error: `Provider '${body.model}' not configured` }, { status: 400 });
    decision = { ...decision, provider: forced, reason: `${decision.reason}; forced to ${forced.label}` };
  }

  const messages: ChatMessage[] = [];
  if (decision.agent) messages.push({ role: "system", content: decision.agent.systemPrompt });
  for (const m of body.history ?? []) {
    if (m.role === "user" || m.role === "assistant") messages.push(m);
  }
  messages.push({ role: "user", content: body.prompt });

  let result;
  try {
    result = await callModel(decision.provider, messages);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "model call failed" }, { status: 502 });
  }

  await logAiRun({
    leadId: body.leadId ?? null,
    task: body.task ?? "chat",
    provider: decision.provider,
    model: result.model,
    agent: decision.agent?.name ?? null,
    reason: decision.reason,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
  });

  return Response.json({
    text: result.text,
    provider: result.provider,
    model: result.model,
    agent: decision.agent?.name ?? null,
    reason: decision.reason,
  });
}

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { enabledProviders } = await import("@/lib/ai/providers");
  const { AGENTS } = await import("@/lib/ai/router");
  return Response.json({
    providers: enabledProviders().map((p) => ({ key: p.key, label: p.label, model: process.env[p.modelEnv] ?? p.defaultModel })),
    agents: AGENTS.map((a) => ({ name: a.name, description: a.description })),
  });
}

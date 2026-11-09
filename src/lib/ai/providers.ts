export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CallResult {
  provider: string;
  model: string;
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ProviderSpec {
  key: string;
  label: string;
  envKey: string;
  modelEnv: string;
  defaultModel: string;
  baseUrl?: string;
  inputPerM: number;
  outputPerM: number;
  strengths: string[]; // router signals this provider is good at
}

export const PROVIDERS: ProviderSpec[] = [
  {
    key: "anthropic", label: "Claude", envKey: "ANTHROPIC_API_KEY", modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5", inputPerM: 3, outputPerM: 15,
    strengths: ["conversation", "creative", "reasoning", "voice", "compliance"],
  },
  {
    key: "openai", label: "GPT", envKey: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1", inputPerM: 0.15, outputPerM: 0.6,
    strengths: ["extraction", "triage", "cheap", "classification"],
  },
  {
    key: "qwen", label: "Qwen", envKey: "QWEN_API_KEY", modelEnv: "QWEN_MODEL",
    defaultModel: "qwen/qwen3.8-27b", baseUrl: "https://openrouter.ai/api/v1",
    inputPerM: 0.8, outputPerM: 2, strengths: ["long-context", "digest", "cheap"],
  },
  {
    key: "gemini", label: "Gemini", envKey: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash", inputPerM: 0.1, outputPerM: 0.4, strengths: ["long-context", "cheap"],
  },
  {
    key: "moonshot", label: "Kimi", envKey: "MOONSHOT_API_KEY", modelEnv: "MOONSHOT_MODEL",
    defaultModel: "kimi-k2-0905-preview", baseUrl: "https://api.moonshot.ai/v1",
    inputPerM: 0.6, outputPerM: 2.5, strengths: ["long-context"],
  },
];

export function enabledProviders(): ProviderSpec[] {
  return PROVIDERS.filter((p) => Boolean(process.env[p.envKey]));
}

export function modelFor(spec: ProviderSpec): string {
  return process.env[spec.modelEnv] ?? spec.defaultModel;
}

export function estimateCost(spec: ProviderSpec, tin: number, tout: number): number {
  return (tin * spec.inputPerM + tout * spec.outputPerM) / 1_000_000;
}

function splitSystem(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  return { system, rest: messages.filter((m) => m.role !== "system") };
}

async function callAnthropic(spec: ProviderSpec, messages: ChatMessage[]): Promise<CallResult> {
  const { system, rest } = splitSystem(messages);
  const model = modelFor(spec);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model, max_tokens: 2048, ...(system ? { system } : {}),
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`Claude error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { content: { type: string; text?: string }[]; usage: { input_tokens: number; output_tokens: number } };
  return {
    provider: spec.key, model, text: j.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
    tokensIn: j.usage.input_tokens, tokensOut: j.usage.output_tokens,
  };
}

async function callOpenAICompatible(spec: ProviderSpec, messages: ChatMessage[]): Promise<CallResult> {
  const model = modelFor(spec);
  const res = await fetch(`${spec.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env[spec.envKey]}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`${spec.label} error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number } };
  return {
    provider: spec.key, model, text: j.choices[0]?.message.content ?? "",
    tokensIn: j.usage.prompt_tokens, tokensOut: j.usage.completion_tokens,
  };
}

export async function callModel(spec: ProviderSpec, messages: ChatMessage[]): Promise<CallResult> {
  if (!process.env[spec.envKey]) throw new Error(`${spec.label} key not configured`);
  if (spec.key === "anthropic") return callAnthropic(spec, messages);
  return callOpenAICompatible(spec, messages);
}

/**
 * Call with auth-failure resilience: if the selected provider rejects the key
 * (401/403 — keys churn), retry with the next enabled provider. Non-auth errors
 * (rate limits, bad request) still throw for the caller to handle.
 */
export async function callModelWithFallback(
  preferred: ProviderSpec,
  messages: ChatMessage[],
  enabled: ProviderSpec[],
): Promise<CallResult> {
  const order = [preferred, ...enabled.filter((p) => p.key !== preferred.key)];
  let lastAuthError: Error | null = null;
  for (const spec of order) {
    if (!process.env[spec.envKey]) continue;
    try {
      return await callModel(spec, messages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/401|403|authentication|incorrect api key|invalid x-api-key/i.test(msg)) {
        lastAuthError = err instanceof Error ? err : new Error(msg);
        continue; // key dead — try next provider
      }
      throw err;
    }
  }
  throw lastAuthError ?? new Error("No AI provider available");
}

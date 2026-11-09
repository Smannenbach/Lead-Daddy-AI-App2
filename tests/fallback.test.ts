import { describe, it, expect, vi, afterEach } from "vitest";

const providers = await import("@/lib/ai/providers");

function spec(key: string) {
  return providers.PROVIDERS.find((p) => p.key === key)!;
}

afterEach(() => vi.unstubAllGlobals());

describe("callModelWithFallback", () => {
  it("uses the preferred provider when its key works", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200 })));
    process.env.ANTHROPIC_API_KEY = "test";
    const r = await providers.callModelWithFallback(spec("anthropic"), [{ role: "user", content: "hi" }], [spec("anthropic")]);
    expect(r.text).toBe("ok");
  });

  it("falls back to the next provider on 401 and reports the working provider", async () => {
    const anthropicFail = vi.fn(async () => new Response(JSON.stringify({ error: { type: "authentication_error" } }), { status: 401 }));
    const openaiOk = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "from-gpt" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200 }));
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (...args: unknown[]) => {
      calls++;
      const url = String(args[0]);
      return url.includes("anthropic") ? anthropicFail() : openaiOk();
    }));
    process.env.ANTHROPIC_API_KEY = "dead";
    process.env.OPENAI_API_KEY = "live";
    const enabled = [spec("anthropic"), spec("openai")];
    const r = await providers.callModelWithFallback(spec("anthropic"), [{ role: "user", content: "hi" }], enabled);
    expect(r.text).toBe("from-gpt");
    expect(r.provider).toBe("openai");
    expect(calls).toBe(2);
  });

  it("throws the auth error when every provider's key is dead", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    process.env.ANTHROPIC_API_KEY = "dead";
    process.env.OPENAI_API_KEY = "dead";
    const enabled = [spec("anthropic"), spec("openai")];
    await expect(
      providers.callModelWithFallback(spec("anthropic"), [{ role: "user", content: "hi" }], enabled),
    ).rejects.toThrow(/401|Unauthorized/i);
  });

  it("does not fall back on non-auth errors (e.g. rate limit)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("rate limited", { status: 429 })));
    process.env.ANTHROPIC_API_KEY = "live";
    await expect(
      providers.callModelWithFallback(spec("anthropic"), [{ role: "user", content: "hi" }], [spec("anthropic")]),
    ).rejects.toThrow(/429/);
  });
});

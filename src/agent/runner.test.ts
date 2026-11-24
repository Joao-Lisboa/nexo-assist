import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isProviderFailure, modelChain, ModelHealth, parseModel } from "./runner";

const ENV = ["LLM_MODEL", "LLM_FALLBACK_MODELS", "GROQ_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

describe("cadeia de modelos e provedores", () => {
  beforeEach(() => ENV.forEach((k) => ((saved[k] = process.env[k]), delete process.env[k])));
  afterEach(() => ENV.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]))));

  it("entende 'provedor/modelo' e assume Google sem prefixo", () => {
    expect(parseModel("groq/openai/gpt-oss-120b")).toEqual({ provider: "groq", id: "openai/gpt-oss-120b", name: "groq/openai/gpt-oss-120b" });
    expect(parseModel("google/gemini-3.8-flash").id).toBe("gemini-3.8-flash");
    expect(parseModel("gemini-3.8-flash")).toEqual({ provider: "google", id: "gemini-3.8-flash", name: "google/gemini-3.8-flash" });
  });

  it("tenta o principal e depois os alternativos, sem repetir, e ignora provedores sem chave", () => {
    process.env.GROQ_API_KEY = "x";
    process.env.LLM_MODEL = "groq/openai/gpt-oss-120b";
    process.env.LLM_FALLBACK_MODELS = "groq/openai/gpt-oss-20b, groq/openai/gpt-oss-120b, google/gemini-3.8-flash";
    expect(modelChain()).toEqual(["groq/openai/gpt-oss-120b", "groq/openai/gpt-oss-20b"]);
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "y";
    expect(modelChain()).toEqual(["groq/openai/gpt-oss-120b", "groq/openai/gpt-oss-20b", "google/gemini-3.8-flash"]);
  });

  it("reconhece sobrecarga, cota, timeout e modelo indisponível, inclusive embrulhados", () => {
    expect(isProviderFailure({ statusCode: 503 })).toBe(true);
    expect(isProviderFailure({ statusCode: 429 })).toBe(true);
    expect(isProviderFailure({ statusCode: 404 })).toBe(true);
    expect(isProviderFailure({ name: "MastraTimeoutError", timeoutType: "total" })).toBe(true);
    expect(isProviderFailure(new Error("x", { cause: { statusCode: 503 } }))).toBe(true);
    expect(isProviderFailure({ statusCode: 400 })).toBe(false);
    expect(isProviderFailure(new Error("chave inválida"))).toBe(false);
  });
});

describe("memória de modelos com problema", () => {
  it("manda para o fim da fila o modelo que falhou há pouco e o recupera depois", () => {
    let now = 0;
    const health = new ModelHealth(60_000, () => now);
    const chain = ["a", "b", "c"];
    health.markFailed("a");
    expect(health.order(chain)).toEqual(["b", "c", "a"]);
    now = 61_000;
    expect(health.order(chain)).toEqual(["a", "b", "c"]);
    health.markFailed("b");
    health.markOk("b");
    expect(health.order(chain)).toEqual(["a", "b", "c"]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { isProviderFailure, modelChain, ModelHealth } from "./runner";

describe("troca de modelo quando o provedor falha", () => {
  afterEach(() => {
    delete process.env.LLM_MODEL;
    delete process.env.LLM_FALLBACK_MODELS;
  });

  it("tenta o principal e depois os alternativos, sem repetir", () => {
    process.env.LLM_MODEL = "gemini-3.8-flash";
    process.env.LLM_FALLBACK_MODELS = "gemini-3.5-flash, gemini-3.8-flash ,gemini-3.5-flash-lite";
    expect(modelChain()).toEqual(["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"]);
  });

  it("reconhece sobrecarga, cota e modelo indisponível, inclusive embrulhados", () => {
    expect(isProviderFailure({ statusCode: 503 })).toBe(true);
    expect(isProviderFailure({ statusCode: 429 })).toBe(true);
    expect(isProviderFailure({ statusCode: 404 })).toBe(true);
    expect(isProviderFailure(new Error("x", { cause: { statusCode: 503 } }))).toBe(true);
    expect(isProviderFailure({ name: "MastraTimeoutError", timeoutType: "total" })).toBe(true);
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

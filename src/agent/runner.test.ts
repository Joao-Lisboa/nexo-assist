import { afterEach, describe, expect, it } from "vitest";
import { isProviderFailure, modelChain } from "./runner";

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
    expect(isProviderFailure({ statusCode: 400 })).toBe(false);
    expect(isProviderFailure(new Error("chave inválida"))).toBe(false);
  });
});

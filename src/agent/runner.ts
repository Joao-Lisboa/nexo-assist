import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { buildInstructions } from "./instructions";
import { nexoTools } from "./tools";
import { TURN_KEY, type TurnContext } from "./turn";

/**
 * Porta de execução do agent. O orquestrador depende só desta interface,
 * o que permite testar todo o fluxo com um agent roteirizado, sem LLM.
 */

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentRunInput {
  turn: TurnContext;
  history: HistoryMessage[];
  onText: (delta: string) => void;
}

export interface AgentRunOutput {
  text: string;
  model: string;
  latencyMs: number;
  tokens: { input: number; output: number } | null;
}

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunOutput>;
}

export class AgentUnavailableError extends Error {
  constructor(cause: unknown) {
    super("O assistente está indisponível no momento.");
    this.name = "AgentUnavailableError";
    this.cause = cause;
  }
}

export function modelId(): string {
  return process.env.LLM_MODEL || "gemini-3.8-flash";
}

type ThinkingLevel = "minimal" | "low" | "medium" | "high";

/**
 * Raciocínio do modelo. Gemini 3.x usa nível ("minimal" a "high"); a família
 * 2.5 usava orçamento em tokens. O padrão "low" equilibra qualidade de decisão,
 * latência e custo: as regras difíceis já estão nas ferramentas.
 */
function thinkingConfig(model: string): { thinkingLevel: ThinkingLevel } | { thinkingBudget: number } {
  if (/^gemini-2\./.test(model)) return { thinkingBudget: Number(process.env.LLM_THINKING_BUDGET ?? "0") };
  const level = (process.env.LLM_THINKING_LEVEL ?? "low") as ThinkingLevel;
  return { thinkingLevel: ["minimal", "low", "medium", "high"].includes(level) ? level : "low" };
}

/** Modelo principal seguido dos alternativos, na ordem em que serão tentados. */
export function modelChain(): string[] {
  const fallbacks = (process.env.LLM_FALLBACK_MODELS ?? "gemini-3.5-flash,gemini-3.5-flash-lite")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([modelId(), ...fallbacks])];
}

/**
 * Falha do provedor que vale tentar em outro modelo: sobrecarga (503),
 * cota (429), erro interno (5xx) ou modelo indisponível para a conta (404).
 */
export function isProviderFailure(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const e = cur as { statusCode?: number; isRetryable?: boolean; cause?: unknown; name?: string; timeoutType?: string };
    if (e.isRetryable === true) return true;
    // Modelo que não responde a tempo (sobrecarga silenciosa) também conta.
    if (e.timeoutType || e.name === "MastraTimeoutError") return true;
    if (typeof e.statusCode === "number" && [404, 408, 429, 500, 502, 503, 504].includes(e.statusCode)) return true;
    cur = e.cause;
  }
  return false;
}

/**
 * Memória curta de modelos com problema: depois de uma falha, o modelo vai
 * para o fim da fila por alguns minutos, e as próximas mensagens não esperam
 * por ele de novo.
 */
export class ModelHealth {
  private readonly failedAt = new Map<string, number>();
  constructor(
    private readonly cooldownMs = 3 * 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  markFailed(model: string): void {
    this.failedAt.set(model, this.now());
  }

  markOk(model: string): void {
    this.failedAt.delete(model);
  }

  /** Mantém a ordem configurada, mas manda para o fim quem falhou há pouco. */
  order(models: string[]): string[] {
    const cooling = (m: string) => {
      const at = this.failedAt.get(m);
      return at !== undefined && this.now() - at < this.cooldownMs;
    };
    return [...models.filter((m) => !cooling(m)), ...models.filter(cooling)];
  }
}

export class MastraAgentRunner implements AgentRunner {
  private readonly agents = new Map<string, Agent>();
  private readonly health = new ModelHealth();
  private readonly google: ReturnType<typeof createGoogleGenerativeAI>;

  constructor(apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurada. Copie .env.example para .env e preencha a chave.");
    this.google = createGoogleGenerativeAI({ apiKey });
  }

  private agentFor(model: string): Agent {
    let agent = this.agents.get(model);
    if (!agent) {
      agent = new Agent({
        id: "nexo-assist",
        name: "Nexo Assist",
        instructions: ({ requestContext }) => buildInstructions(requestContext.get(TURN_KEY) as TurnContext),
        model: this.google(model),
        tools: nexoTools,
      });
      this.agents.set(model, agent);
    }
    return agent;
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();
    let lastError: unknown;
    for (const model of this.health.order(modelChain())) {
      const stepsBefore = input.turn.steps.length;
      let emitted = false;
      try {
        const out = await this.runWith(model, input, () => (emitted = true));
        this.health.markOk(model);
        return { ...out, latencyMs: Date.now() - started };
      } catch (err) {
        lastError = err;
        if (isProviderFailure(err)) this.health.markFailed(model);
        // Só troca de modelo se nada aconteceu ainda neste turno (sem texto e
        // sem ferramentas executadas): assim nenhum efeito é repetido.
        const untouched = !emitted && input.turn.steps.length === stepsBefore;
        console.warn(`[agent] ${model} falhou${untouched && isProviderFailure(err) ? ", tentando o próximo modelo" : ""}:`, err instanceof Error ? err.message : err);
        if (!(untouched && isProviderFailure(err))) break;
      }
    }
    throw new AgentUnavailableError(lastError);
  }

  private async runWith(model: string, { turn, history, onText }: AgentRunInput, onEmit: () => void): Promise<Omit<AgentRunOutput, "latencyMs">> {
    const requestContext = new RequestContext();
    requestContext.set(TURN_KEY, turn);
    const messages = history.map((m) => ({ role: m.role, content: m.content })) as unknown as Parameters<Agent["stream"]>[0];
    const stream = await this.agentFor(model).stream(messages, {
      requestContext,
      maxSteps: 8,
      // Poucas repetições no mesmo modelo: com sobrecarga, é mais rápido ir para o próximo.
      // firstChunkMs: um modelo sobrecarregado que não começa a responder em 15 s
      // é abandonado em favor do próximo, em vez de esgotar o tempo todo.
      modelSettings: { temperature: 0.2, maxOutputTokens: 1200, maxRetries: 1, timeout: { firstChunkMs: 15_000, totalMs: 45_000 } },
      providerOptions: { google: { thinkingConfig: thinkingConfig(model) } },
    });
    let text = "";
    for await (const chunk of stream.fullStream) {
      if (chunk.type === "text-delta") {
        text += chunk.payload.text;
        onEmit();
        onText(chunk.payload.text);
      } else if (chunk.type === "error") {
        throw chunk.payload.error;
      }
    }
    const usage = await stream.usage;
    return {
      text: text.trim(),
      model,
      tokens: usage ? { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0 } : null,
    };
  }
}

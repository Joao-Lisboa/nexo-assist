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

export class MastraAgentRunner implements AgentRunner {
  private readonly agent: Agent;
  private readonly model = modelId();

  constructor(apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurada. Copie .env.example para .env e preencha a chave.");
    const google = createGoogleGenerativeAI({ apiKey });
    this.agent = new Agent({
      id: "nexo-assist",
      name: "Nexo Assist",
      instructions: ({ requestContext }) => buildInstructions(requestContext.get(TURN_KEY) as TurnContext),
      model: google(this.model),
      tools: nexoTools,
    });
  }

  async run({ turn, history, onText }: AgentRunInput): Promise<AgentRunOutput> {
    const started = Date.now();
    const requestContext = new RequestContext();
    requestContext.set(TURN_KEY, turn);

    let text = "";
    try {
      const messages = history.map((m) => ({ role: m.role, content: m.content })) as unknown as Parameters<Agent["stream"]>[0];
      const stream = await this.agent.stream(messages, {
        requestContext,
        maxSteps: 8,
        modelSettings: { temperature: 0.2, maxOutputTokens: 1200, timeout: { totalMs: 60_000 } },
        providerOptions: { google: { thinkingConfig: thinkingConfig(this.model) } },
      });
      for await (const chunk of stream.fullStream) {
        if (chunk.type === "text-delta") {
          text += chunk.payload.text;
          onText(chunk.payload.text);
        } else if (chunk.type === "error") {
          throw chunk.payload.error;
        }
      }
      const usage = await stream.usage;
      return {
        text: text.trim(),
        model: this.model,
        latencyMs: Date.now() - started,
        tokens: usage ? { input: usage.inputTokens ?? 0, output: usage.outputTokens ?? 0 } : null,
      };
    } catch (err) {
      throw new AgentUnavailableError(err);
    }
  }
}

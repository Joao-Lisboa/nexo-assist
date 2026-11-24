import type { Intent, TraceStep, UiBlock } from "@/domain/conversation";
import type { HandoffReason, Ticket } from "@/domain/types";
import type { TicketClient } from "@/services/tickets/client";
import type { DraftPayload } from "@/server/views";

/**
 * Estado de um turno do agent. Vive no RequestContext do Mastra: é preenchido
 * pelo servidor (identidade, dependências) e pelas ferramentas (passos,
 * blocos de interface, efeitos). O modelo nunca escreve aqui diretamente.
 */

export interface TurnUser {
  id: string;
  name: string;
  email: string;
  department: string;
  device: string | null;
}

export interface CreatedDraft {
  id: number;
  code: string;
}

export interface DraftStore {
  create(input: { kind: "create" | "update" | "reopen"; ticketNumber: string | null; payload: DraftPayload }): Promise<CreatedDraft>;
}

export interface PendingDraftInfo {
  code: string;
  kind: "create" | "update" | "reopen";
  ticketNumber: string | null;
  title: string;
}

export interface Decision {
  understood: string;
  intent: Intent;
  confidence: number;
  reasoning: string;
}

export interface HandoffRequest {
  reason: HandoffReason;
  summary: string;
  ticketNumber: string | null;
}

export interface TurnContext {
  user: TurnUser;
  conversationId: string;
  now: Date;
  tickets: TicketClient;
  drafts: DraftStore;
  pendingDraft: PendingDraftInfo | null;

  decision: Decision | null;
  steps: TraceStep[];
  rules: string[];
  blocks: UiBlock[];
  handoff: HandoffRequest | null;
  ticketCache: Map<string, Ticket>;
  onStep: (label: string) => void;
}

export const TURN_KEY = "turn";

export function newTurn(
  init: Pick<TurnContext, "user" | "conversationId" | "now" | "tickets" | "drafts" | "pendingDraft" | "onStep">,
): TurnContext {
  return { ...init, decision: null, steps: [], rules: [], blocks: [], handoff: null, ticketCache: new Map() };
}

/**
 * Executa uma ferramenta registrando o passo no rastro de decisão.
 * O primeiro rótulo é emitido ao começar (feedback em tempo real); os demais,
 * quando a ferramenta termina — e a ferramenta pode trocá-los conforme o que
 * realmente aconteceu (ex.: achou duplicado e não montou rascunho).
 */
export type ToolResult = Record<string, unknown>;

export async function traced(
  turn: TurnContext,
  meta: { tool: string; labels: string[]; input: string },
  fn: () => Promise<{ result: ToolResult; output: string; labels?: string[] }>,
): Promise<ToolResult> {
  const started = Date.now();
  const first = meta.labels[0] ?? meta.tool;
  turn.onStep(first);
  try {
    const { result, output, labels } = await fn();
    const durationMs = Date.now() - started;
    const final = labels ?? meta.labels;
    final.slice(1).forEach((label) => turn.onStep(label));
    final.forEach((label, i) =>
      turn.steps.push({ tool: meta.tool, label, input: i === 0 ? meta.input : "", output: i === 0 ? output : "", ok: true, durationMs: i === 0 ? durationMs : 0 }),
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro inesperado";
    turn.steps.push({ tool: meta.tool, label: first, input: meta.input, output: message, ok: false, durationMs: Date.now() - started });
    return { erro: message };
  }
}

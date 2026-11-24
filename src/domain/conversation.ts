/**
 * Contrato entre servidor e interface: blocos ricos que acompanham as
 * mensagens (cards, opções rápidas, rascunhos) e o registro de decisão
 * que torna cada resposta do agent explicável.
 */
import type { ConversationMode, Priority, TicketStatus } from "./types";

export const INTENTS = [
  "duvida",
  "consultar_chamado",
  "atualizar_chamado",
  "abrir_chamado",
  "falar_com_analista",
  "fora_do_escopo",
  "outro",
] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_LABEL: Record<Intent, string> = {
  duvida: "Tirar uma dúvida",
  consultar_chamado: "Consultar um chamado",
  atualizar_chamado: "Complementar um chamado",
  abrir_chamado: "Abrir um chamado",
  falar_com_analista: "Falar com um analista",
  fora_do_escopo: "Assunto fora de TI",
  outro: "Conversa geral",
};

export interface TicketView {
  number: string;
  typeLabel: string;
  title: string;
  description: string;
  categoryLabel: string;
  priority: Priority;
  priorityLabel: string;
  status: TicketStatus;
  statusLabel: string;
  openedAt: string; // "16 out, 14:20"
  openedShort: string; // "16 out"
  updatedAgo: string; // "há 5 dias"
  overdue: boolean;
  slaLabel: string;
  slaRule: string;
}

export interface DraftView {
  id: number;
  code: string; // D-381
  kind: "create" | "update" | "reopen";
  status: "pending" | "confirmed" | "cancelled" | "superseded";
  ticketNumber: string | null;
  title: string;
  description: string;
  typeLabel: string;
  categoryLabel: string;
  priority: Priority;
  priorityLabel: string;
  dueLabel: string;
  affectedLabel: string;
  /** Texto que será adicionado ao chamado (atualização/reabertura). */
  comment: string | null;
  resultTicket: string | null;
}

export type UiBlock =
  | { kind: "quick_replies"; question: string | null; options: string[] }
  | { kind: "ticket_selector"; tickets: TicketView[] }
  | { kind: "ticket_card"; ticket: TicketView }
  | { kind: "draft"; draft: DraftView }
  | { kind: "articles"; articles: { id: string; title: string }[] }
  | { kind: "handoff"; team: string; dueLabel: string };

export interface TraceStep {
  tool: string;
  /** Rótulo curto exibido acima da resposta: "consultou seus chamados". */
  label: string;
  /** O que foi pedido à ferramenta, em linguagem simples. */
  input: string;
  /** O que voltou, em linguagem simples. */
  output: string;
  ok: boolean;
  durationMs: number;
}

export interface DecisionTrace {
  understood: string;
  intent: Intent;
  /** 0..1, autoavaliação do modelo registrada antes de agir. */
  confidence: number;
  reasoning: string;
  /** Resumo da ação efetivamente tomada, derivado das ferramentas executadas. */
  action: string;
  steps: TraceStep[];
  /** Regras determinísticas que influenciaram a resposta. */
  rules: string[];
  model: string;
  latencyMs: number;
  tokens: { input: number; output: number } | null;
}

export interface MessageView {
  id: number;
  role: "user" | "agent" | "analyst" | "system";
  authorName: string | null;
  authorTeam: string | null;
  content: string;
  blocks: UiBlock[];
  trace: DecisionTrace | null;
  createdAt: string;
  time: string;
}

export interface ConversationView {
  id: string;
  mode: ConversationMode;
  userMessageCount: number;
  messageLimit: number;
  handoffDueLabel: string | null;
  assignedAnalystName: string | null;
  messages: MessageView[];
}

export const MESSAGE_LIMIT = 30;

/** Eventos enviados por SSE enquanto o agent responde. */
export type StreamEvent =
  | { type: "user_message"; message: MessageView }
  | { type: "step"; label: string }
  | { type: "text"; delta: string }
  | { type: "message"; message: MessageView }
  | { type: "conversation"; conversation: Omit<ConversationView, "messages"> }
  | { type: "error"; message: string }
  | { type: "done" };

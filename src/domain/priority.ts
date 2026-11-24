import type { Impact, Priority, TicketType } from "./types";

/**
 * Sinais que o agent extrai da conversa. A prioridade em si é calculada aqui,
 * de forma determinística, combinando impacto (quantas pessoas) e urgência
 * (compromisso em risco) — o modelo não escolhe a prioridade livremente.
 */
export interface PrioritySignals {
  type: TicketType;
  impact: Impact;
  /** O problema impede de trabalhar (algo parado), em vez de só atrapalhar? */
  blocksWork: boolean;
  /** Há um compromisso no mesmo dia que depende da solução? */
  sameDayCommitment: boolean;
}

export interface PriorityDecision {
  priority: Priority;
  rationale: string;
}

export function classifyPriority(s: PrioritySignals): PriorityDecision {
  if (s.impact !== "individual" && s.blocksWork) {
    return {
      priority: "critica",
      rationale: `Algo parado para ${s.impact === "empresa" ? "a empresa" : "uma equipe"}: prioridade crítica (prazo de 1 hora).`,
    };
  }
  if (s.blocksWork) {
    return { priority: "alta", rationale: "Impede uma pessoa de trabalhar: prioridade alta (4 horas úteis)." };
  }
  if (s.sameDayCommitment) {
    return { priority: "alta", rationale: "Há um compromisso no mesmo dia em risco: prioridade alta (4 horas úteis)." };
  }
  if (s.type === "REQ") {
    return { priority: "baixa", rationale: "Pedido sem urgência: prioridade baixa (5 dias úteis)." };
  }
  if (s.impact !== "individual") {
    return {
      priority: "media",
      rationale: "Atrapalha mais de uma pessoa, mas há alternativa: prioridade média (3 dias úteis).",
    };
  }
  return { priority: "media", rationale: "Atrapalha, mas há alternativa: prioridade média (3 dias úteis)." };
}

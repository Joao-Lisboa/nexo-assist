import { addBusinessHours, BUSINESS_HOURS_PER_DAY, formatDue } from "./business-time";
import type { Priority, Ticket } from "./types";
import { isOpenStatus } from "./types";

/**
 * Prazos do Anexo A. Valem para a primeira resposta e para cada atualização:
 * o relógio recomeça a cada atualização do chamado (`updatedAt`).
 */
export const SLA: Record<Priority, { label: string; businessHours: number | null; wallClockHours: number | null }> = {
  critica: { label: "1 hora", businessHours: null, wallClockHours: 1 }, // plantão 24 h
  alta: { label: "4 horas úteis", businessHours: 4, wallClockHours: null },
  media: { label: "3 dias úteis", businessHours: 3 * BUSINESS_HOURS_PER_DAY, wallClockHours: null },
  baixa: { label: "5 dias úteis", businessHours: 5 * BUSINESS_HOURS_PER_DAY, wallClockHours: null },
};

export function dueAt(priority: Priority, from: Date): Date {
  const rule = SLA[priority];
  if (rule.wallClockHours !== null) return new Date(from.getTime() + rule.wallClockHours * 60 * 60 * 1000);
  return addBusinessHours(from, rule.businessHours ?? 0);
}

export interface SlaState {
  dueAt: Date | null;
  overdue: boolean;
  /** Texto pronto para a interface: "resposta até 13:43" / "prazo vencido". */
  label: string;
  /** Regra aplicada, para explicar a decisão: "3 dias úteis". */
  rule: string;
}

/**
 * Situação de prazo de um chamado. Chamados encerrados ou aguardando o próprio
 * funcionário não correm prazo.
 */
export function slaState(ticket: Pick<Ticket, "priority" | "status" | "updatedAt">, now: Date): SlaState {
  const rule = SLA[ticket.priority].label;
  if (!isOpenStatus(ticket.status) || ticket.status === "aguardando_usuario") {
    return { dueAt: null, overdue: false, label: "sem prazo correndo", rule };
  }
  const due = dueAt(ticket.priority, new Date(ticket.updatedAt));
  const overdue = now > due;
  return {
    dueAt: due,
    overdue,
    label: overdue ? "prazo vencido" : `próxima resposta até ${formatDue(due, now)}`,
    rule,
  };
}

/** Prazo para um analista assumir uma conversa transferida. */
export function handoffDueAt(critical: boolean, from: Date): Date {
  return critical ? new Date(from.getTime() + 60 * 60 * 1000) : addBusinessHours(from, 2);
}

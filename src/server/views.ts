import type { DecisionTrace, DraftView, MessageView, TicketView, UiBlock } from "@/domain/conversation";
import { formatAgo, formatDateTime, formatDue, formatShortDate, formatTime } from "@/domain/business-time";
import { classifyPriority } from "@/domain/priority";
import { dueAt, slaState } from "@/domain/sla";
import {
  CATEGORY_LABEL,
  IMPACT_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_TYPE_LABEL,
  type Category,
  type Impact,
  type Priority,
  type Ticket,
  type TicketType,
} from "@/domain/types";
import type { drafts, messages, users } from "./db/schema";

/** Converte entidades em views prontas para a interface (e para o agent). */

export function toTicketView(t: Ticket, now: Date): TicketView {
  const sla = slaState(t, now);
  return {
    number: t.number,
    typeLabel: TICKET_TYPE_LABEL[t.type],
    title: t.title,
    description: t.description,
    categoryLabel: t.item ? `${CATEGORY_LABEL[t.category]} › ${t.item}` : CATEGORY_LABEL[t.category],
    priority: t.priority,
    priorityLabel: PRIORITY_LABEL[t.priority],
    status: t.status,
    statusLabel: STATUS_LABEL[t.status],
    openedAt: formatDateTime(new Date(t.createdAt)),
    openedShort: formatShortDate(new Date(t.createdAt)),
    updatedAgo: formatAgo(new Date(t.updatedAt), now),
    overdue: sla.overdue,
    slaLabel: sla.label,
    slaRule: sla.rule,
  };
}

/** Conteúdo de um rascunho. A prioridade é sempre recalculada a partir dos sinais. */
export interface DraftPayload {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  item: string | null;
  affected: Impact;
  blocksWork: boolean;
  sameDayCommitment: boolean;
  priority: Priority;
  priorityRationale: string;
  comment: string | null;
}

export function buildDraftPayload(input: Omit<DraftPayload, "priority" | "priorityRationale">): DraftPayload {
  const decision = classifyPriority({
    type: input.type,
    impact: input.affected,
    blocksWork: input.blocksWork,
    sameDayCommitment: input.sameDayCommitment,
  });
  return { ...input, priority: decision.priority, priorityRationale: decision.rationale };
}

type DraftRow = typeof drafts.$inferSelect;

export function toDraftView(row: DraftRow, now: Date): DraftView {
  const p = JSON.parse(row.payload) as DraftPayload;
  const due = dueAt(p.priority, now);
  return {
    id: row.id,
    code: `D-${row.id}`,
    kind: row.kind,
    status: row.status,
    ticketNumber: row.ticketNumber,
    title: p.title,
    description: p.description,
    typeLabel: TICKET_TYPE_LABEL[p.type],
    categoryLabel: p.item ? `${CATEGORY_LABEL[p.category]} › ${p.item}` : CATEGORY_LABEL[p.category],
    priority: p.priority,
    priorityLabel: PRIORITY_LABEL[p.priority],
    dueLabel: `resposta até ${formatDue(due, now)}`,
    affectedLabel: IMPACT_LABEL[p.affected],
    comment: p.comment,
    resultTicket: row.resultTicket,
  };
}

type MessageRow = typeof messages.$inferSelect;
type UserRow = typeof users.$inferSelect;

export function toMessageView(row: MessageRow, authors: Map<string, UserRow>): MessageView {
  const author = row.authorId ? authors.get(row.authorId) : undefined;
  return {
    id: row.id,
    role: row.role,
    authorName: row.role === "agent" ? "Nexo Assist" : (author?.name ?? null),
    authorTeam: row.role === "analyst" ? `Suporte ${author?.team ?? "N1"}` : null,
    content: row.content,
    blocks: JSON.parse(row.blocks) as UiBlock[],
    trace: row.trace ? (JSON.parse(row.trace) as DecisionTrace) : null,
    createdAt: row.createdAt,
    time: formatTime(new Date(row.createdAt)),
  };
}

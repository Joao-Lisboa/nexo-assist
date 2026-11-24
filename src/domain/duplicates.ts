import { overlap, tokenSet } from "./text";
import type { Category, Ticket } from "./types";
import { isOpenStatus } from "./types";

export const REOPEN_WINDOW_DAYS = 7;

export interface DuplicateCandidate {
  ticket: Ticket;
  /** "update": aberto, deve ser atualizado. "reopen": resolvido há até 7 dias, pode ser reaberto. */
  action: "update" | "reopen";
  score: number;
}

export function canReopen(ticket: Pick<Ticket, "status" | "resolvedAt">, now: Date): boolean {
  if (ticket.status !== "resolvido" || !ticket.resolvedAt) return false;
  const age = now.getTime() - new Date(ticket.resolvedAt).getTime();
  return age <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Procura, entre os chamados do próprio funcionário, um que trate do mesmo
 * problema. Regra do Anexo A: se existe aberto, atualiza em vez de duplicar;
 * se foi resolvido há até 7 dias, pode ser reaberto.
 */
export function findDuplicate(
  candidate: { title: string; description: string; category: Category },
  tickets: Ticket[],
  now: Date,
): DuplicateCandidate | null {
  const cand = tokenSet(`${candidate.title} ${candidate.description}`);
  let best: DuplicateCandidate | null = null;

  for (const ticket of tickets) {
    const open = isOpenStatus(ticket.status);
    const reopenable = canReopen(ticket, now);
    if (!open && !reopenable) continue;

    const score = overlap(cand, tokenSet(`${ticket.title} ${ticket.description}`));
    const sameCategory = ticket.category === candidate.category;
    const isMatch = (sameCategory && score >= 0.34) || score >= 0.6;
    if (!isMatch) continue;

    const adjusted = score + (sameCategory ? 0.2 : 0);
    if (!best || adjusted > best.score) {
      best = { ticket, action: open ? "update" : "reopen", score: adjusted };
    }
  }
  return best;
}

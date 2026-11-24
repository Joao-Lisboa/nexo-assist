import { desc, eq, inArray } from "drizzle-orm";
import { formatAgo, formatDue, formatShortDate, formatTime } from "@/domain/business-time";
import type { ConversationView, MessageView, TicketView } from "@/domain/conversation";
import { HANDOFF_REASON_LABEL, isOpenStatus, type ConversationMode, type HandoffReason } from "@/domain/types";
import { TicketServiceUnavailable, type TicketClient } from "@/services/tickets/client";
import type { AppDb } from "./container";
import type { ConversationService } from "./conversation-service";
import { conversations, messages, users } from "./db/schema";
import { HttpError } from "./errors";
import type { User } from "./types";
import { toMessageView, toTicketView } from "./views";

/** Console do analista: fila de conversas, assumir, devolver, encerrar. */

export type ConsoleFilter = "todas" | "para_voce" | "com_agent" | "minhas";

export interface ConsoleTag {
  tone: "red" | "amber" | "green" | "gray" | "blue";
  label: string;
}

export interface ConsoleListItem {
  id: string;
  employee: { id: string; name: string; initials: string; department: string; avatarBg: string; avatarFg: string };
  mode: ConversationMode;
  lastMessage: string;
  lastAt: string;
  lastAtLabel: string;
  unread: number;
  tag: ConsoleTag;
  needsYou: boolean;
}

export interface ConsoleCounts {
  todas: number;
  para_voce: number;
  com_agent: number;
  minhas: number;
}

export interface ConsoleDetail {
  conversation: ConversationView;
  employee: { id: string; name: string; email: string; department: string; device: string | null; initials: string; avatarBg: string; avatarFg: string };
  handoff: { reason: string; summary: string | null; confidence: number | null; dueLabel: string | null; at: string | null } | null;
  relatedTicket: string | null;
  tickets: { current: TicketView | null; open: TicketView[]; closed: TicketView[] } | null;
  ticketsError: string | null;
  assignedToMe: boolean;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export class ConsoleService {
  constructor(
    private readonly db: AppDb,
    private readonly tickets: TicketClient,
    private readonly conversations: ConversationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(analyst: User, filter: ConsoleFilter, search: string): Promise<{ items: ConsoleListItem[]; counts: ConsoleCounts }> {
    const convs = await this.db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    const userRows = convs.length
      ? await this.db.select().from(users).where(inArray(users.id, [...new Set(convs.map((c) => c.userId))]))
      : [];
    const byId = new Map(userRows.map((u) => [u.id, u]));

    // Somente a conversa mais recente de cada funcionário aparece na fila.
    const latest = new Map<string, (typeof convs)[number]>();
    for (const c of convs) if (!latest.has(c.userId)) latest.set(c.userId, c);
    const visible = [...latest.values()].filter((c) => c.userMessageCount > 0);

    const items: ConsoleListItem[] = [];
    for (const c of visible) {
      const employee = byId.get(c.userId);
      if (!employee) continue;
      const msgs = await this.db.select().from(messages).where(eq(messages.conversationId, c.id)).orderBy(desc(messages.id)).limit(20);
      const last = msgs.find((m) => m.role !== "system") ?? msgs[0];
      const unread = c.mode === "waiting_human" || (c.mode === "human" && c.assignedAnalystId === analyst.id)
        ? msgs.filter((m) => m.role === "user" && (!c.analystReadAt || m.createdAt > c.analystReadAt)).length
        : 0;
      const prefix = last?.role === "agent" ? "Nexo: " : last?.role === "analyst" ? "Você: " : "";
      items.push({
        id: c.id,
        employee: { id: employee.id, name: employee.name, initials: initials(employee.name), department: employee.department, avatarBg: employee.avatarBg, avatarFg: employee.avatarFg },
        mode: c.mode,
        lastMessage: `${prefix}${last?.content ?? ""}`,
        lastAt: c.updatedAt,
        lastAtLabel: this.timeLabel(new Date(c.updatedAt)),
        unread,
        tag: this.tag(c, analyst),
        needsYou: c.mode === "waiting_human",
      });
    }

    const counts: ConsoleCounts = {
      todas: items.length,
      para_voce: items.filter((i) => i.mode === "waiting_human").length,
      com_agent: items.filter((i) => i.mode === "agent").length,
      minhas: visible.filter((c) => c.mode === "human" && c.assignedAnalystId === analyst.id).length,
    };

    const q = search.trim().toLowerCase();
    const filtered = items.filter((i) => {
      const conv = visible.find((c) => c.id === i.id);
      if (filter === "para_voce" && i.mode !== "waiting_human") return false;
      if (filter === "com_agent" && i.mode !== "agent") return false;
      if (filter === "minhas" && !(i.mode === "human" && conv?.assignedAnalystId === analyst.id)) return false;
      if (q && !`${i.employee.name} ${i.lastMessage} ${conv?.relatedTicket ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // Quem precisa de atendimento primeiro, depois o mais recente.
    filtered.sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || b.lastAt.localeCompare(a.lastAt));
    return { items: filtered, counts };
  }

  private timeLabel(d: Date): string {
    const now = this.now();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return "agora";
    if (formatShortDate(d) === formatShortDate(now)) return formatTime(d);
    if (diff < 2 * 24 * 60 * 60 * 1000) return "ontem";
    return formatShortDate(d);
  }

  private tag(c: typeof conversations.$inferSelect, analyst: User): ConsoleTag {
    const now = this.now();
    if (c.mode === "waiting_human") {
      if (c.handoffReason === "baixa_confianca") {
        return { tone: "amber", label: `Agent pediu ajuda · confiança ${c.handoffConfidence ?? "?"}%` };
      }
      if (c.handoffDueAt) {
        const due = new Date(c.handoffDueAt);
        const minutes = Math.round((due.getTime() - now.getTime()) / 60000);
        if (minutes <= 60) {
          return { tone: "red", label: minutes < 0 ? "Transferida · prazo de contato vencido" : `Transferida · contato em ${minutes} min` };
        }
      }
      return { tone: "red", label: `Transferida${c.relatedTicket ? ` · ${c.relatedTicket}` : ""}` };
    }
    if (c.mode === "human") {
      return c.assignedAnalystId === analyst.id ? { tone: "blue", label: "Você está atendendo" } : { tone: "blue", label: "Com outro analista" };
    }
    if (c.mode === "closed") return { tone: "gray", label: c.resolvedByAgent ? "Resolvida pelo agent" : "Encerrada" };
    return { tone: "green", label: "Agent atendendo" };
  }

  async detail(analyst: User, id: string): Promise<ConsoleDetail> {
    const c = await this.conversations.conversationRow(id);
    const [employee] = await this.db.select().from(users).where(eq(users.id, c.userId));
    if (!employee) throw new HttpError(404, "Funcionário não encontrado.");
    if (c.mode === "waiting_human" || (c.mode === "human" && c.assignedAnalystId === analyst.id)) {
      await this.db.update(conversations).set({ analystReadAt: this.now().toISOString() }).where(eq(conversations.id, id));
    }

    let tickets: ConsoleDetail["tickets"] = null;
    let ticketsError: string | null = null;
    try {
      const list = await this.tickets.listByRequesterAsAnalyst(employee.id);
      const now = this.now();
      const views = list.map((t) => toTicketView(t, now));
      const current = c.relatedTicket ? (views.find((v) => v.number === c.relatedTicket) ?? null) : null;
      tickets = {
        current,
        open: views.filter((v) => v.number !== current?.number && isOpenStatus(v.status)),
        closed: views.filter((v) => v.number !== current?.number && !isOpenStatus(v.status)).slice(0, 4),
      };
    } catch (err) {
      ticketsError = err instanceof TicketServiceUnavailable ? err.message : "Não foi possível carregar os chamados.";
    }

    return {
      conversation: await this.conversations.view(c),
      employee: { id: employee.id, name: employee.name, email: employee.email, department: employee.department, device: employee.device, initials: initials(employee.name), avatarBg: employee.avatarBg, avatarFg: employee.avatarFg },
      handoff: c.handoffReason
        ? {
            reason: HANDOFF_REASON_LABEL[c.handoffReason as HandoffReason] ?? c.handoffReason,
            summary: c.handoffSummary,
            confidence: c.handoffConfidence,
            dueLabel: c.handoffDueAt ? formatDue(new Date(c.handoffDueAt), this.now()) : null,
            at: c.handoffAt ? formatAgo(new Date(c.handoffAt), this.now()) : null,
          }
        : null,
      relatedTicket: c.relatedTicket,
      tickets,
      ticketsError,
      assignedToMe: c.mode === "human" && c.assignedAnalystId === analyst.id,
    };
  }

  async assume(analyst: User, id: string): Promise<void> {
    const c = await this.conversations.conversationRow(id);
    if (c.mode === "closed") throw new HttpError(409, "Conversa encerrada.");
    if (c.mode === "human" && c.assignedAnalystId && c.assignedAnalystId !== analyst.id) {
      throw new HttpError(409, "Outro analista já assumiu esta conversa.");
    }
    await this.conversations.updateConversation(id, { mode: "human", assignedAnalystId: analyst.id, analystReadAt: this.now().toISOString() });
    await this.conversations.insertMessage(id, "system", null, `${analyst.name} assumiu · agent pausado`, [], null);
  }

  async returnToAgent(analyst: User, id: string): Promise<void> {
    const c = await this.conversations.conversationRow(id);
    if (c.mode === "closed") throw new HttpError(409, "Conversa encerrada.");
    if (c.mode === "human" && c.assignedAnalystId !== analyst.id) throw new HttpError(403, "Só quem está atendendo pode devolver a conversa.");
    await this.conversations.updateConversation(id, { mode: "agent", assignedAnalystId: null, handoffReason: null, handoffDueAt: null, handoffConfidence: null });
    await this.conversations.insertMessage(id, "system", null, `${analyst.name} devolveu a conversa ao Nexo Assist`, [], null);
  }

  async close(analyst: User, id: string): Promise<void> {
    const c = await this.conversations.conversationRow(id);
    if (c.mode === "closed") return;
    if (c.mode === "human" && c.assignedAnalystId !== analyst.id) throw new HttpError(403, "Só quem está atendendo pode encerrar.");
    await this.conversations.updateConversation(id, { mode: "closed", closedAt: this.now().toISOString(), resolvedByAgent: false });
    await this.conversations.insertMessage(id, "system", null, `Atendimento encerrado por ${analyst.name}`, [], null);
  }

  async send(analyst: User, id: string, text: string): Promise<MessageView> {
    const c = await this.conversations.conversationRow(id);
    if (c.mode !== "human" || c.assignedAnalystId !== analyst.id) throw new HttpError(409, "Assuma o atendimento para responder.");
    const content = text.trim().slice(0, 2000);
    if (!content) throw new HttpError(400, "Escreva uma mensagem.");
    const row = await this.conversations.insertMessage(id, "analyst", analyst.id, content, [], null);
    await this.db.update(conversations).set({ analystReadAt: this.now().toISOString() }).where(eq(conversations.id, id));
    return toMessageView(row, new Map([[analyst.id, analyst]]));
  }
}

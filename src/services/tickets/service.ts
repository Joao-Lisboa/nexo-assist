import { createClient, type Client } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import type {
  Category,
  Impact,
  Priority,
  Ticket,
  TicketEvent,
  TicketStatus,
  TicketType,
} from "@/domain/types";
import { counters, tickets, TICKETS_BOOTSTRAP_SQL } from "./schema";

/**
 * Serviço de chamados simulado — o "sistema legado" do PRD.
 *
 * - Tem armazenamento próprio (data/tickets.db), separado da aplicação.
 * - Toda operação recebe o id de quem pede e só enxerga chamados dessa pessoa
 *   (exceto as operações de analista, explícitas no nome).
 * - Simula latência e indisponibilidade momentânea, como o PRD descreve.
 *   Quem consome deve usar o TicketClient, que faz retry com backoff.
 */

export class LegacyUnavailableError extends Error {
  constructor() {
    super("Sistema de chamados indisponível no momento");
    this.name = "LegacyUnavailableError";
  }
}

export class TicketNotFoundError extends Error {
  constructor(number: string) {
    super(`Chamado ${number} não encontrado`);
    this.name = "TicketNotFoundError";
  }
}

export interface CreateTicketInput {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  item?: string | null;
  priority: Priority;
  affected: Impact;
}

export interface SimulationConfig {
  failureRate: number;
  latencyMs: [number, number];
}

function readSimulationConfig(): SimulationConfig {
  const failureRate = Number(process.env.TICKET_SERVICE_FAILURE_RATE ?? "0.08");
  const [min, max] = (process.env.TICKET_SERVICE_LATENCY_MS ?? "120-450").split("-").map(Number);
  return {
    failureRate: Number.isFinite(failureRate) ? failureRate : 0,
    latencyMs: [min ?? 0, max ?? min ?? 0],
  };
}

type Row = typeof tickets.$inferSelect;

function toTicket(r: Row): Ticket {
  return {
    number: r.number,
    type: r.type as TicketType,
    title: r.title,
    description: r.description,
    category: r.category as Category,
    item: r.item,
    priority: r.priority as Priority,
    status: r.status as TicketStatus,
    affected: r.affected as Impact,
    requesterId: r.requesterId,
    group: r.group as Ticket["group"],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    resolvedAt: r.resolvedAt,
    events: JSON.parse(r.events) as TicketEvent[],
  };
}

export class TicketService {
  private readonly db: LibSQLDatabase;
  private ready: Promise<void> | null = null;

  constructor(
    private readonly client: Client,
    private readonly sim: SimulationConfig = readSimulationConfig(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.db = drizzle(client);
  }

  static fromFile(file: string, sim?: SimulationConfig): TicketService {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return new TicketService(createClient({ url: `file:${file}` }), sim);
  }

  init(): Promise<void> {
    this.ready ??= (async () => {
      for (const sql of TICKETS_BOOTSTRAP_SQL) await this.client.execute(sql);
    })();
    return this.ready;
  }

  /** Latência e falhas intermitentes do sistema legado. */
  private async legacyCall(): Promise<void> {
    await this.init();
    const [min, max] = this.sim.latencyMs;
    const wait = min + Math.random() * Math.max(0, max - min);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (Math.random() < this.sim.failureRate) throw new LegacyUnavailableError();
  }

  // ---------- leitura (funcionário) ----------

  async listByRequester(requesterId: string): Promise<Ticket[]> {
    await this.legacyCall();
    const rows = await this.db.select().from(tickets).where(eq(tickets.requesterId, requesterId));
    return rows.map(toTicket).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Devolve o chamado só se pertencer a quem pede. Para os demais, "não encontrado". */
  async get(number: string, requesterId: string): Promise<Ticket> {
    await this.legacyCall();
    const [row] = await this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.number, number.toUpperCase()), eq(tickets.requesterId, requesterId)));
    if (!row) throw new TicketNotFoundError(number);
    return toTicket(row);
  }

  // ---------- escrita (funcionário) ----------

  async create(requesterId: string, input: CreateTicketInput, author: string): Promise<Ticket> {
    await this.legacyCall();
    const number = await this.nextNumber(input.type);
    const at = this.now().toISOString();
    const ticket: Ticket = {
      number,
      type: input.type,
      title: input.title,
      description: input.description,
      category: input.category,
      item: input.item ?? null,
      priority: input.priority,
      status: "aberto",
      affected: input.affected,
      requesterId,
      group: input.priority === "critica" ? "N2" : "N1",
      createdAt: at,
      updatedAt: at,
      resolvedAt: null,
      events: [{ at, kind: "criado", text: "Chamado aberto pelo Nexo Assist", author }],
    };
    await this.insert(ticket);
    return ticket;
  }

  async addComment(number: string, requesterId: string, text: string, author: string): Promise<Ticket> {
    const ticket = await this.get(number, requesterId);
    const at = this.now().toISOString();
    ticket.events.push({ at, kind: "comentario", text, author });
    ticket.description = `${ticket.description}\n\nAtualização (${at.slice(0, 10)}): ${text}`;
    ticket.updatedAt = at;
    await this.save(ticket);
    return ticket;
  }

  async reopen(number: string, requesterId: string, text: string, author: string): Promise<Ticket> {
    const ticket = await this.get(number, requesterId);
    const at = this.now().toISOString();
    ticket.status = "aberto";
    ticket.resolvedAt = null;
    ticket.updatedAt = at;
    ticket.events.push({ at, kind: "reaberto", text, author });
    await this.save(ticket);
    return ticket;
  }

  /** Encaminha o chamado para a fila de analistas, com o resumo do caso. */
  async transfer(number: string, requesterId: string, group: "N1" | "N2", summary: string): Promise<Ticket> {
    const ticket = await this.get(number, requesterId);
    const at = this.now().toISOString();
    ticket.group = group;
    if (ticket.status !== "em_andamento") ticket.status = "aguardando_analista";
    ticket.events.push({ at, kind: "transferido", text: `Transferido para Suporte ${group}. ${summary}`, author: "Nexo Assist" });
    await this.save(ticket);
    return ticket;
  }

  // ---------- operações de analista (console) ----------

  async listByRequesterAsAnalyst(requesterId: string): Promise<Ticket[]> {
    return this.listByRequester(requesterId);
  }

  async setStatusAsAnalyst(number: string, status: TicketStatus, author: string, note: string): Promise<Ticket> {
    await this.legacyCall();
    const [row] = await this.db.select().from(tickets).where(eq(tickets.number, number));
    if (!row) throw new TicketNotFoundError(number);
    const ticket = toTicket(row);
    const at = this.now().toISOString();
    ticket.status = status;
    ticket.updatedAt = at;
    ticket.resolvedAt = status === "resolvido" ? at : null;
    ticket.events.push({ at, kind: "status", text: note, author });
    await this.save(ticket);
    return ticket;
  }

  // ---------- infraestrutura ----------

  async seed(list: Ticket[], nextNumbers: Record<TicketType, number>): Promise<void> {
    await this.init();
    for (const t of list) await this.insert(t);
    for (const [type, value] of Object.entries(nextNumbers)) {
      await this.db.insert(counters).values({ name: type, value }).onConflictDoUpdate({ target: counters.name, set: { value } });
    }
  }

  async count(): Promise<number> {
    await this.init();
    const res = await this.client.execute("SELECT COUNT(*) AS n FROM tickets");
    return Number(res.rows[0]?.n ?? 0);
  }

  private async nextNumber(type: TicketType): Promise<string> {
    const res = await this.client.execute({
      sql: "INSERT INTO counters(name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value",
      args: [type, type === "INC" ? 20500 : 10500],
    });
    return `${type}-${Number(res.rows[0]?.value)}`;
  }

  private async insert(t: Ticket): Promise<void> {
    await this.db.insert(tickets).values({ ...t, events: JSON.stringify(t.events) });
  }

  private async save(t: Ticket): Promise<void> {
    await this.db
      .update(tickets)
      .set({ ...t, events: JSON.stringify(t.events) })
      .where(eq(tickets.number, t.number));
  }
}

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Armazenamento próprio do "sistema de chamados legado". Fica num arquivo
 * SQLite separado do banco da aplicação: o agent só o alcança pela API do
 * serviço (TicketService), como aconteceria com um sistema externo.
 */
export const tickets = sqliteTable("tickets", {
  number: text("number").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  item: text("item"),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  affected: text("affected").notNull(),
  requesterId: text("requester_id").notNull(),
  group: text("group").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  resolvedAt: text("resolved_at"),
  events: text("events").notNull(), // JSON: TicketEvent[]
});

export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

export const TICKETS_BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS tickets (
    number TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    item TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    affected TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    "group" TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    events TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tickets_requester ON tickets(requester_id)`,
  `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
];

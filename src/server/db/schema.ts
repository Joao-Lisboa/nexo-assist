import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Banco da aplicação: usuários, conversas, mensagens, rascunhos. */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["employee", "analyst"] }).notNull(),
  department: text("department").notNull(),
  /** Sistema operacional do equipamento (contexto útil ao agent). */
  device: text("device"),
  /** Fila do analista (N1/N2). */
  team: text("team"),
  avatarBg: text("avatar_bg").notNull(),
  avatarFg: text("avatar_fg").notNull(),
  passwordChangedAt: text("password_changed_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  mode: text("mode", { enum: ["agent", "waiting_human", "human", "closed"] }).notNull(),
  handoffReason: text("handoff_reason"),
  handoffSummary: text("handoff_summary"),
  handoffAt: text("handoff_at"),
  handoffDueAt: text("handoff_due_at"),
  /** Confiança do agent quando ele mesmo pediu ajuda. */
  handoffConfidence: integer("handoff_confidence"),
  assignedAnalystId: text("assigned_analyst_id"),
  relatedTicket: text("related_ticket"),
  userMessageCount: integer("user_message_count").notNull(),
  resolvedByAgent: integer("resolved_by_agent", { mode: "boolean" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  closedAt: text("closed_at"),
  analystReadAt: text("analyst_read_at"),
});

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id").notNull(),
  role: text("role", { enum: ["user", "agent", "analyst", "system"] }).notNull(),
  authorId: text("author_id"),
  content: text("content").notNull(),
  blocks: text("blocks").notNull(), // JSON: UiBlock[]
  trace: text("trace"), // JSON: DecisionTrace | null
  createdAt: text("created_at").notNull(),
});

export const drafts = sqliteTable("drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id").notNull(),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: ["create", "update", "reopen"] }).notNull(),
  ticketNumber: text("ticket_number"),
  payload: text("payload").notNull(), // JSON: DraftPayload
  status: text("status", { enum: ["pending", "confirmed", "cancelled", "superseded"] }).notNull(),
  resultTicket: text("result_ticket"),
  createdAt: text("created_at").notNull(),
});

export const APP_BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT NOT NULL,
    device TEXT,
    team TEXT,
    avatar_bg TEXT NOT NULL,
    avatar_fg TEXT NOT NULL,
    password_changed_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    handoff_reason TEXT,
    handoff_summary TEXT,
    handoff_at TEXT,
    handoff_due_at TEXT,
    handoff_confidence INTEGER,
    assigned_analyst_id TEXT,
    related_ticket TEXT,
    user_message_count INTEGER NOT NULL,
    resolved_by_agent INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT,
    analyst_read_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS conversations_user ON conversations(user_id)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    author_id TEXT,
    content TEXT NOT NULL,
    blocks TEXT NOT NULL,
    trace TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id)`,
  `CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    ticket_number TEXT,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    result_ticket TEXT,
    created_at TEXT NOT NULL
  )`,
];

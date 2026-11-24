import "server-only";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import { createTicketClient, type TicketClient } from "@/services/tickets/client";
import { TicketService } from "@/services/tickets/service";
import { APP_BOOTSTRAP_SQL } from "./db/schema";
import { seedAll } from "./seed";

/**
 * Composição das dependências do servidor. Um único ponto cria os bancos,
 * aplica o schema e semeia os dados de exemplo na primeira execução.
 */

export type AppDb = LibSQLDatabase;

export interface Container {
  db: AppDb;
  client: Client;
  tickets: TicketClient;
  ticketService: TicketService;
}

const globalForContainer = globalThis as unknown as { __nexoContainer?: Promise<Container> };

export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "data");
}

async function build(): Promise<Container> {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });

  const client = createClient({ url: `file:${path.join(dir, "app.db")}` });
  await client.execute("PRAGMA journal_mode = WAL");
  for (const sql of APP_BOOTSTRAP_SQL) await client.execute(sql);
  const db = drizzle(client);

  const ticketService = TicketService.fromFile(path.join(dir, "tickets.db"));
  await ticketService.init();

  const seeded = await client.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(seeded.rows[0]?.n ?? 0) === 0) {
    await seedAll(db, ticketService);
  }

  return { db, client, ticketService, tickets: createTicketClient(ticketService) };
}

export function getContainer(): Promise<Container> {
  globalForContainer.__nexoContainer ??= build().catch((err) => {
    globalForContainer.__nexoContainer = undefined;
    throw err;
  });
  return globalForContainer.__nexoContainer;
}

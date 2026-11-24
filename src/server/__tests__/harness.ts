import { createClient } from "@libsql/client";
import { RequestContext } from "@mastra/core/request-context";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StreamEvent } from "@/domain/conversation";
import type { AgentRunInput, AgentRunner, AgentRunOutput } from "@/agent/runner";
import { nexoTools } from "@/agent/tools";
import { TURN_KEY, type TurnContext } from "@/agent/turn";
import { createTicketClient } from "@/services/tickets/client";
import { TicketService } from "@/services/tickets/service";
import { ConsoleService } from "../console-service";
import { ConversationService } from "../conversation-service";
import { APP_BOOTSTRAP_SQL, users } from "../db/schema";
import { seedAll } from "../seed";

/** Terça-feira, 24/11/2026, 10:00 em São Paulo. */
export const NOW = new Date("2026-11-24T10:00:00-03:00");

type ToolName = keyof typeof nexoTools;

/** Agent roteirizado: cada turno é uma função que chama as ferramentas reais. */
export type Script = (call: (tool: ToolName, input: Record<string, unknown>) => Promise<unknown>, input: AgentRunInput) => Promise<string>;

export class ScriptedRunner implements AgentRunner {
  readonly calls: AgentRunInput[] = [];
  private readonly queue: Script[] = [];

  push(...scripts: Script[]): void {
    this.queue.push(...scripts);
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    this.calls.push(input);
    const script = this.queue.shift();
    if (!script) throw new Error("Nenhum roteiro para este turno");
    const requestContext = new RequestContext();
    requestContext.set(TURN_KEY, input.turn);
    const call = async (tool: ToolName, args: Record<string, unknown>) => {
      const t = nexoTools[tool] as unknown as { execute: (i: unknown, c: unknown) => Promise<unknown> };
      return t.execute(args, { requestContext });
    };
    const text = await script(call, input);
    return { text, model: "roteiro-de-teste", latencyMs: 1, tokens: null };
  }
}

export async function setup(opts: { failureRate?: number; runner?: AgentRunner } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexo-test-"));
  const client = createClient({ url: `file:${path.join(dir, "app.db")}` });
  for (const sql of APP_BOOTSTRAP_SQL) await client.execute(sql);
  const db = drizzle(client);
  const service = new TicketService(createClient({ url: `file:${path.join(dir, "tickets.db")}` }), { failureRate: 0, latencyMs: [0, 0] });
  await service.init();
  await seedAll(db, service, NOW);
  if (opts.failureRate) (service as unknown as { sim: { failureRate: number } }).sim.failureRate = opts.failureRate;

  const tickets = createTicketClient(service, { attempts: 2, baseDelayMs: 1 });
  const runner = new ScriptedRunner();
  const active: AgentRunner = opts.runner ?? runner;
  const conversations = new ConversationService({ db, tickets, runner: () => active, now: () => NOW });
  const console = new ConsoleService(db, tickets, conversations, () => NOW);

  const user = async (id: string) => {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw new Error(id);
    return u;
  };

  const send = async (userId: string, text: string) => {
    const events: StreamEvent[] = [];
    await conversations.handleUserMessage(await user(userId), text, (e) => events.push(e));
    return events;
  };

  return { db, service, tickets, runner, conversations, console, user, send };
}

export function turnOf(input: AgentRunInput): TurnContext {
  return input.turn;
}

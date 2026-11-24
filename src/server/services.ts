import "server-only";
import { MastraAgentRunner, type AgentRunner } from "@/agent/runner";
import { ConsoleService } from "./console-service";
import { getContainer } from "./container";
import { ConversationService } from "./conversation-service";

/** Serviços de aplicação, criados uma vez por processo. */

const g = globalThis as unknown as { __nexoServices?: Promise<{ conversations: ConversationService; console: ConsoleService }> };

let runner: AgentRunner | null = null;
function getRunner(): AgentRunner {
  runner ??= new MastraAgentRunner();
  return runner;
}

export function getServices() {
  g.__nexoServices ??= (async () => {
    const { db, tickets } = await getContainer();
    const conversations = new ConversationService({ db, tickets, runner: getRunner });
    return { conversations, console: new ConsoleService(db, tickets, conversations) };
  })();
  return g.__nexoServices;
}

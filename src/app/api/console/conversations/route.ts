import { requireUser } from "@/server/auth";
import type { ConsoleFilter } from "@/server/console-service";
import { handle } from "@/server/http";
import { getServices } from "@/server/services";

const FILTERS: ConsoleFilter[] = ["todas", "para_voce", "com_agent", "minhas"];

export async function GET(req: Request) {
  return handle(async () => {
    const analyst = await requireUser("analyst");
    const url = new URL(req.url);
    const f = url.searchParams.get("filter") as ConsoleFilter | null;
    const { console } = await getServices();
    return console.list(analyst, f && FILTERS.includes(f) ? f : "todas", url.searchParams.get("q") ?? "");
  });
}

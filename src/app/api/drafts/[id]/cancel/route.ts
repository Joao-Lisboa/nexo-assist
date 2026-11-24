import { requireUser } from "@/server/auth";
import { collectEvents, handle } from "@/server/http";
import { getServices } from "@/server/services";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("employee");
    const { id } = await ctx.params;
    const { conversations } = await getServices();
    return collectEvents((emit) => conversations.cancelDraft(user, Number(id), emit));
  });
}

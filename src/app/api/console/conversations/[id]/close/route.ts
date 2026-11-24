import { requireUser } from "@/server/auth";
import { handle } from "@/server/http";
import { getServices } from "@/server/services";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const analyst = await requireUser("analyst");
    const { id } = await ctx.params;
    const { console } = await getServices();
    await console.close(analyst, id);
    return console.detail(analyst, id);
  });
}

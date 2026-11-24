import { z } from "zod";
import { requireUser } from "@/server/auth";
import { handle, parseBody } from "@/server/http";
import { getServices } from "@/server/services";

const Body = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const analyst = await requireUser("analyst");
    const { id } = await ctx.params;
    const { text } = await parseBody(req, Body);
    const { console } = await getServices();
    await console.send(analyst, id, text);
    return console.detail(analyst, id);
  });
}

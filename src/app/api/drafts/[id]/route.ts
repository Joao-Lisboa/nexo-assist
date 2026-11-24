import { z } from "zod";
import { CATEGORIES, IMPACTS } from "@/domain/types";
import { requireUser } from "@/server/auth";
import { handle, parseBody } from "@/server/http";
import { getServices } from "@/server/services";

const Body = z.object({
  title: z.string().min(3).max(90),
  description: z.string().min(3).max(3000),
  category: z.enum(CATEGORIES),
  type: z.enum(["INC", "REQ"]),
  affected: z.enum(IMPACTS),
  blocksWork: z.boolean(),
  sameDayCommitment: z.boolean(),
  comment: z.string().max(3000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("employee");
    const { id } = await ctx.params;
    const body = await parseBody(req, Body);
    const { conversations } = await getServices();
    return { message: await conversations.editDraft(user, Number(id), body) };
  });
}

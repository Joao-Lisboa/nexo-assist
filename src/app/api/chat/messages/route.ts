import { z } from "zod";
import { requireUser } from "@/server/auth";
import { errorResponse, parseBody, sseResponse } from "@/server/http";
import { getServices } from "@/server/services";

const Body = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  try {
    const user = await requireUser("employee");
    const { text } = await parseBody(req, Body);
    const { conversations } = await getServices();
    return sseResponse((emit) => conversations.handleUserMessage(user, text, emit));
  } catch (err) {
    return errorResponse(err);
  }
}

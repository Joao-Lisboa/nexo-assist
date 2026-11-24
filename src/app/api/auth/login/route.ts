import { z } from "zod";
import { findUserByEmail, startSession } from "@/server/auth";
import { HttpError } from "@/server/errors";
import { handle, parseBody } from "@/server/http";

const Body = z.object({ email: z.string().email(), password: z.string().min(1), remember: z.boolean().default(true) });

export async function POST(req: Request) {
  return handle(async () => {
    const { email, remember } = await parseBody(req, Body);
    // Desafio: qualquer senha é aceita para os funcionários dos dados de exemplo.
    const user = await findUserByEmail(email);
    if (!user) throw new HttpError(401, "E-mail não encontrado. Use seu e-mail corporativo da Nexo.");
    await startSession(user.id, remember);
    return { redirect: user.role === "analyst" ? "/console" : "/chat" };
  });
}

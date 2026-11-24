import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import type { StreamEvent } from "@/domain/conversation";
import { HttpError } from "./errors";

/** Converte erros em respostas JSON com mensagens que a interface pode mostrar. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    if (result instanceof Response) return result;
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[api]", err);
  return NextResponse.json({ error: "Algo deu errado do nosso lado. Tente de novo." }, { status: 500 });
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new HttpError(400, "Requisição inválida.");
  return parsed.data;
}

/**
 * Resposta em Server-Sent Events: a interface recebe os passos do agent e o
 * texto à medida que são gerados.
 */
export function sseResponse(run: (emit: (e: StreamEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        await run(emit);
      } catch (err) {
        if (!(err instanceof HttpError)) console.error("[sse]", err);
        emit({ type: "error", message: err instanceof HttpError ? err.message : "Algo deu errado do nosso lado. Tente de novo." });
        emit({ type: "done" });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}

/** Coleta os eventos de uma operação curta e devolve em JSON. */
export async function collectEvents(run: (emit: (e: StreamEvent) => void) => Promise<void>): Promise<{ events: StreamEvent[] }> {
  const events: StreamEvent[] = [];
  await run((e) => events.push(e));
  return { events };
}

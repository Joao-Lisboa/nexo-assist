import { LegacyUnavailableError, TicketService } from "./service";

/**
 * Cliente resiliente do sistema de chamados: repete chamadas que falharam por
 * indisponibilidade momentânea (backoff exponencial com jitter). Outros erros,
 * como "não encontrado", não são repetidos.
 */
export class TicketServiceUnavailable extends Error {
  constructor(readonly attempts: number) {
    super("O sistema de chamados está fora do ar há alguns segundos. Tente de novo em instantes.");
    this.name = "TicketServiceUnavailable";
  }
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = { attempts: 4, baseDelayMs: 250 };

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = DEFAULT_RETRY): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!(err instanceof LegacyUnavailableError)) throw err;
      lastError = err;
      if (attempt < opts.attempts) {
        const delay = opts.baseDelayMs * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  void lastError;
  throw new TicketServiceUnavailable(opts.attempts);
}

type AsyncMethods<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => Promise<unknown> ? K : never]: T[K];
};

/** Mesma interface do serviço, com retry em toda operação. */
export type TicketClient = AsyncMethods<
  Pick<
    TicketService,
    "listByRequester" | "get" | "create" | "addComment" | "reopen" | "transfer" | "listByRequesterAsAnalyst" | "setStatusAsAnalyst"
  >
>;

export function createTicketClient(service: TicketService, opts: RetryOptions = DEFAULT_RETRY): TicketClient {
  return {
    listByRequester: (...a) => withRetry(() => service.listByRequester(...a), opts),
    get: (...a) => withRetry(() => service.get(...a), opts),
    create: (...a) => withRetry(() => service.create(...a), opts),
    addComment: (...a) => withRetry(() => service.addComment(...a), opts),
    reopen: (...a) => withRetry(() => service.reopen(...a), opts),
    transfer: (...a) => withRetry(() => service.transfer(...a), opts),
    listByRequesterAsAnalyst: (...a) => withRetry(() => service.listByRequesterAsAnalyst(...a), opts),
    setStatusAsAnalyst: (...a) => withRetry(() => service.setStatusAsAnalyst(...a), opts),
  };
}

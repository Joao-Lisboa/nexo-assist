import { and, desc, eq, inArray, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { formatDue } from "@/domain/business-time";
import {
  MESSAGE_LIMIT,
  type ConversationView,
  type DecisionTrace,
  type MessageView,
  type StreamEvent,
  type UiBlock,
} from "@/domain/conversation";
import { handoffDueAt } from "@/domain/sla";
import { HANDOFF_REASON_LABEL, PRIORITY_LABEL, type HandoffReason, type Ticket } from "@/domain/types";
import type { AgentRunner, HistoryMessage } from "@/agent/runner";
import { newTurn, type DraftStore, type TurnContext } from "@/agent/turn";
import { TicketServiceUnavailable, type TicketClient } from "@/services/tickets/client";
import type { AppDb } from "./container";
import { conversations, drafts, messages, users } from "./db/schema";
import { HttpError } from "./errors";
import type { User } from "./types";
import { buildDraftPayload, toDraftView, toMessageView, toTicketView, type DraftPayload } from "./views";

/**
 * Orquestra uma conversa ao redor do agent. É aqui que ficam as garantias que
 * não dependem do modelo:
 * - o agent não é chamado quando a conversa está com um analista;
 * - criar/atualizar chamado só acontece por confirmação explícita;
 * - limite de mensagens por sessão e limite de ritmo por pessoa;
 * - redes de segurança: confiança muito baixa vira transferência, chamado
 *   vencido sempre ganha a oferta de chamar um analista, caso crítico
 *   confirmado vai direto para o plantão.
 */

type ConversationRow = typeof conversations.$inferSelect;
type DraftRow = typeof drafts.$inferSelect;
type Emit = (event: StreamEvent) => void;

const HISTORY_WINDOW = 16;
const FORCE_HANDOFF_BELOW = 0.4;

const AFFIRMATIVE = /^(sim|s|pode|pode sim|pode criar|pode abrir|pode atualizar|confirmo|confirmar|confirma|ok|okay|isso|isso mesmo|correto|certo|perfeito|manda|beleza|claro)[\s.!,]*$/i;
const NEGATIVE = /^(cancela|cancelar|cancele|nao|não|não precisa|nao precisa|deixa|deixa pra lá|esquece)[\s.!,]*$/i;

export interface ConversationServiceDeps {
  db: AppDb;
  tickets: TicketClient;
  runner: () => AgentRunner;
  now?: () => Date;
}

export class ConversationService {
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly rate = new Map<string, number[]>();
  private turnsToday = { day: "", count: 0 };

  constructor(private readonly deps: ConversationServiceDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  // ------------------------------------------------------------------ leitura

  async activeConversation(user: User): Promise<ConversationRow> {
    const [latest] = await this.deps.db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.createdAt))
      .limit(1);
    return latest ?? this.createConversation(user.id);
  }

  async startNewConversation(user: User): Promise<ConversationRow> {
    const current = await this.activeConversation(user);
    if (current.mode !== "closed" && current.userMessageCount < MESSAGE_LIMIT && current.userMessageCount > 0) {
      throw new HttpError(409, "Você já tem uma conversa em andamento.");
    }
    if (current.userMessageCount === 0 && current.mode !== "closed") return current;
    if (current.mode !== "closed") {
      await this.deps.db.update(conversations).set({ mode: "closed", closedAt: this.now().toISOString() }).where(eq(conversations.id, current.id));
    }
    return this.createConversation(user.id);
  }

  private async createConversation(userId: string): Promise<ConversationRow> {
    const at = this.now().toISOString();
    const row: ConversationRow = {
      id: randomUUID(),
      userId,
      mode: "agent",
      handoffReason: null,
      handoffSummary: null,
      handoffAt: null,
      handoffDueAt: null,
      handoffConfidence: null,
      assignedAnalystId: null,
      relatedTicket: null,
      userMessageCount: 0,
      resolvedByAgent: false,
      createdAt: at,
      updatedAt: at,
      closedAt: null,
      analystReadAt: null,
    };
    await this.deps.db.insert(conversations).values(row);
    return row;
  }

  async conversationRow(id: string): Promise<ConversationRow> {
    const [row] = await this.deps.db.select().from(conversations).where(eq(conversations.id, id));
    if (!row) throw new HttpError(404, "Conversa não encontrada.");
    return row;
  }

  async view(conversation: ConversationRow): Promise<ConversationView> {
    const rows = await this.deps.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(messages.id);
    const authorIds = [...new Set(rows.map((r) => r.authorId).filter((x): x is string => !!x))];
    if (conversation.assignedAnalystId) authorIds.push(conversation.assignedAnalystId);
    const authors = new Map(
      authorIds.length
        ? (await this.deps.db.select().from(users).where(inArray(users.id, authorIds))).map((u) => [u.id, u] as const)
        : [],
    );
    return {
      ...(await this.summary(conversation, authors)),
      messages: rows.map((r) => toMessageView(r, authors)),
    };
  }

  private async summary(c: ConversationRow, authors?: Map<string, User>): Promise<Omit<ConversationView, "messages">> {
    let analystName: string | null = null;
    if (c.assignedAnalystId) {
      analystName =
        authors?.get(c.assignedAnalystId)?.name ??
        (await this.deps.db.select().from(users).where(eq(users.id, c.assignedAnalystId)))[0]?.name ??
        null;
    }
    return {
      id: c.id,
      mode: c.mode,
      userMessageCount: c.userMessageCount,
      messageLimit: MESSAGE_LIMIT,
      handoffDueLabel: c.handoffDueAt ? formatDue(new Date(c.handoffDueAt), this.now()) : null,
      assignedAnalystName: analystName,
    };
  }

  // --------------------------------------------------------- mensagem do funcionário

  async handleUserMessage(user: User, rawText: string, emit: Emit): Promise<void> {
    const text = rawText.trim().slice(0, 2000);
    if (!text) throw new HttpError(400, "Escreva uma mensagem.");
    const conversation = await this.activeConversation(user);
    return this.withLock(conversation.id, () => this.processUserMessage(user, conversation.id, text, emit));
  }

  private async processUserMessage(user: User, conversationId: string, text: string, emit: Emit): Promise<void> {
    const conversation = await this.conversationRow(conversationId);
    if (conversation.mode === "closed") throw new HttpError(409, "Esta conversa foi encerrada. Inicie uma nova.");
    if (conversation.userMessageCount >= MESSAGE_LIMIT) {
      throw new HttpError(429, `Você atingiu o limite de ${MESSAGE_LIMIT} mensagens desta sessão. Inicie uma nova conversa.`);
    }
    this.checkRate(user.id);

    const userMsg = await this.insertMessage(conversation.id, "user", user.id, text, [], null);
    const count = conversation.userMessageCount + 1;
    await this.updateConversation(conversation.id, { userMessageCount: count });
    emit({ type: "user_message", message: toMessageView(userMsg, new Map([[user.id, user]])) });

    // Com um analista: o agent fica em silêncio.
    if (conversation.mode !== "agent") {
      emit({ type: "conversation", conversation: await this.summary(await this.conversationRow(conversation.id)) });
      emit({ type: "done" });
      return;
    }

    // Confirmação ou cancelamento por texto de um rascunho pendente: regra, não modelo.
    const pending = await this.pendingDraft(conversation.id);
    if (pending && AFFIRMATIVE.test(text)) {
      await this.confirmDraftInternal(user, pending, emit, "por mensagem");
      emit({ type: "done" });
      return;
    }
    if (pending && NEGATIVE.test(text)) {
      await this.cancelDraftInternal(user, pending, emit);
      emit({ type: "done" });
      return;
    }

    await this.runAgentTurn(user, conversation.id, pending, emit);
    emit({ type: "done" });
  }

  private async runAgentTurn(user: User, conversationId: string, pending: DraftRow | null, emit: Emit): Promise<void> {
    this.checkDailyBudget();
    const now = this.now();
    const draftStore: DraftStore = {
      create: async ({ kind, ticketNumber, payload }) => {
        await this.deps.db
          .update(drafts)
          .set({ status: "superseded" })
          .where(and(eq(drafts.conversationId, conversationId), eq(drafts.status, "pending")));
        const [row] = await this.deps.db
          .insert(drafts)
          .values({ conversationId, userId: user.id, kind, ticketNumber, payload: JSON.stringify(payload), status: "pending", resultTicket: null, createdAt: now.toISOString() })
          .returning();
        if (!row) throw new Error("Falha ao salvar rascunho");
        await this.refreshDraftCards(conversationId);
        return { id: row.id, code: `D-${row.id}` };
      },
    };

    const turn = newTurn({
      user: { id: user.id, name: user.name, email: user.email, department: user.department, device: user.device },
      conversationId,
      now,
      tickets: this.deps.tickets,
      drafts: draftStore,
      pendingDraft: pending
        ? {
            code: `D-${pending.id}`,
            kind: pending.kind,
            ticketNumber: pending.ticketNumber,
            title: (JSON.parse(pending.payload) as DraftPayload).title,
          }
        : null,
      onStep: (label) => emit({ type: "step", label }),
    });

    const history = await this.history(conversationId);
    let text = "";
    let meta: Pick<DecisionTrace, "model" | "latencyMs" | "tokens">;
    try {
      const out = await this.deps.runner().run({ turn, history, onText: (delta) => emit({ type: "text", delta }) });
      text = out.text;
      meta = { model: out.model, latencyMs: out.latencyMs, tokens: out.tokens };
    } catch (err) {
      console.error("[agent] falha ao responder", err);
      const failure = await this.insertMessage(
        conversationId,
        "agent",
        null,
        "Tive um problema para responder agora. Tente de novo em alguns segundos — se preferir, peça para falar com um analista.",
        [{ kind: "quick_replies", question: null, options: ["Tentar de novo", "Falar com um analista"] }],
        {
          understood: "Não foi possível processar a mensagem.",
          intent: "outro",
          confidence: 0,
          reasoning: "O modelo de linguagem não respondeu (indisponível ou excedeu o tempo).",
          action: "Nenhuma ação tomada; pediu para tentar de novo.",
          steps: turn.steps,
          rules: ["Falha do modelo: nada foi criado ou alterado."],
          model: "indisponível",
          latencyMs: 0,
          tokens: null,
        },
      );
      emit({ type: "message", message: toMessageView(failure, new Map()) });
      return;
    }

    this.applySafetyNets(turn);
    if (!text) text = fallbackText(turn);

    let systemNote: string | null = null;
    if (turn.handoff) {
      const handoff = await this.applyHandoff(conversationId, user.id, turn.handoff, turn.decision?.confidence ?? null, turn);
      turn.blocks.push({ kind: "handoff", team: handoff.team, dueLabel: handoff.dueLabel });
      systemNote = `Transferida para Suporte ${handoff.team}`;
    }

    const trace: DecisionTrace = {
      understood: turn.decision?.understood ?? "O agent não registrou o entendimento neste turno.",
      intent: turn.decision?.intent ?? "outro",
      confidence: turn.decision?.confidence ?? 0.5,
      reasoning: turn.decision?.reasoning ?? "—",
      action: describeAction(turn),
      steps: turn.steps,
      rules: turn.rules,
      ...meta,
    };
    const related = relatedTicketOf(turn.blocks);
    const agentMsg = await this.insertMessage(conversationId, "agent", null, text, turn.blocks, trace);
    if (related) await this.updateConversation(conversationId, { relatedTicket: related });
    emit({ type: "message", message: toMessageView(agentMsg, new Map()) });
    if (systemNote) {
      const sys = await this.insertMessage(conversationId, "system", null, systemNote, [], null);
      emit({ type: "message", message: toMessageView(sys, new Map()) });
    }
    emit({ type: "conversation", conversation: await this.summary(await this.conversationRow(conversationId)) });
  }

  /** Redes de segurança determinísticas aplicadas depois do modelo. */
  private applySafetyNets(turn: TurnContext): void {
    const asked = turn.blocks.some((b) => b.kind === "quick_replies" || b.kind === "ticket_selector" || b.kind === "draft");
    const confidence = turn.decision?.confidence;

    if (!turn.handoff && confidence !== undefined && confidence < FORCE_HANDOFF_BELOW && !asked) {
      turn.handoff = {
        reason: "baixa_confianca",
        summary: `O agent não teve segurança para decidir (${Math.round(confidence * 100)}%). Entendimento: ${turn.decision?.understood ?? "—"}`,
        ticketNumber: null,
      };
      turn.rules.push(`Confiança ${Math.round(confidence * 100)}% abaixo de ${FORCE_HANDOFF_BELOW * 100}%: conversa transferida automaticamente.`);
    }

    const overdueCard = turn.blocks.find((b) => b.kind === "ticket_card" && b.ticket.overdue);
    if (overdueCard && !turn.handoff && !turn.blocks.some((b) => b.kind === "quick_replies")) {
      turn.blocks.push({ kind: "quick_replies", question: null, options: ["Falar com um analista", "Adicionar informação", "Não, obrigado"] });
      turn.rules.push("Chamado vencido: oferta de analista incluída pela regra de transferência.");
    }
  }

  private async applyHandoff(
    conversationId: string,
    userId: string,
    req: { reason: HandoffReason; summary: string; ticketNumber: string | null },
    confidence: number | null,
    turn?: TurnContext,
  ): Promise<{ team: "N1" | "N2"; dueLabel: string }> {
    const now = this.now();
    const critical = req.reason === "caso_critico";
    const team = critical || req.reason === "chamado_vencido" ? "N2" : "N1";
    const due = handoffDueAt(critical, now);
    if (req.ticketNumber) {
      try {
        await this.deps.tickets.transfer(req.ticketNumber, userId, team, req.summary);
      } catch (err) {
        const note = err instanceof TicketServiceUnavailable ? "sistema de chamados fora do ar" : "chamado não encontrado";
        turn?.rules.push(`Não foi possível marcar ${req.ticketNumber} como transferido (${note}); a conversa foi transferida mesmo assim.`);
      }
    }
    await this.updateConversation(conversationId, {
      mode: "waiting_human",
      handoffReason: req.reason,
      handoffSummary: req.summary,
      handoffAt: now.toISOString(),
      handoffDueAt: due.toISOString(),
      handoffConfidence: req.reason === "baixa_confianca" && confidence !== null ? Math.round(confidence * 100) : null,
      assignedAnalystId: null,
      ...(req.ticketNumber ? { relatedTicket: req.ticketNumber } : {}),
    });
    turn?.rules.push(`Transferência: ${HANDOFF_REASON_LABEL[req.reason]}. O agent fica pausado até um analista liberar.`);
    return { team, dueLabel: `até ${formatDue(due, now)}` };
  }

  // --------------------------------------------------------------- rascunhos

  private async pendingDraft(conversationId: string): Promise<DraftRow | null> {
    const [row] = await this.deps.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.conversationId, conversationId), eq(drafts.status, "pending")))
      .orderBy(desc(drafts.id))
      .limit(1);
    return row ?? null;
  }

  private async ownedDraft(user: User, draftId: number): Promise<DraftRow> {
    const [row] = await this.deps.db.select().from(drafts).where(eq(drafts.id, draftId));
    if (!row || row.userId !== user.id) throw new HttpError(404, "Rascunho não encontrado.");
    if (row.status !== "pending") throw new HttpError(409, "Este rascunho não está mais pendente.");
    return row;
  }

  async confirmDraft(user: User, draftId: number, emit: Emit): Promise<void> {
    const draft = await this.ownedDraft(user, draftId);
    return this.withLock(draft.conversationId, async () => {
      const fresh = await this.ownedDraft(user, draftId);
      await this.confirmDraftInternal(user, fresh, emit, "no card");
      emit({ type: "done" });
    });
  }

  private async confirmDraftInternal(user: User, draft: DraftRow, emit: Emit, via: string): Promise<void> {
    const started = Date.now();
    const p = JSON.parse(draft.payload) as DraftPayload;
    let ticket: Ticket;
    try {
      if (draft.kind === "create") {
        ticket = await this.deps.tickets.create(user.id, p, "Nexo Assist");
      } else if (draft.kind === "update") {
        ticket = await this.deps.tickets.addComment(draft.ticketNumber ?? "", user.id, p.comment ?? "", user.name);
      } else {
        ticket = await this.deps.tickets.reopen(draft.ticketNumber ?? "", user.id, p.comment ?? "Reaberto pelo funcionário", user.name);
      }
    } catch (err) {
      if (err instanceof TicketServiceUnavailable) throw new HttpError(503, err.message);
      throw err;
    }

    const now = this.now();
    await this.deps.db.update(drafts).set({ status: "confirmed", resultTicket: ticket.number }).where(eq(drafts.id, draft.id));
    await this.refreshDraftCards(draft.conversationId);

    const view = toTicketView(ticket, now);
    const verb = draft.kind === "create" ? "abri o" : draft.kind === "update" ? "atualizei o" : "reabri o";
    let content =
      draft.kind === "create"
        ? `Pronto: ${verb} ${ticket.number} com prioridade ${PRIORITY_LABEL[ticket.priority].toLowerCase()}. ${capitalize(view.slaLabel)}.`
        : `Pronto: ${verb} ${ticket.number} com as novas informações. ${capitalize(view.slaLabel)}.`;
    const blocks: UiBlock[] = [{ kind: "ticket_card", ticket: view }];
    const rules = [`Ação executada só depois da confirmação do funcionário (${via}).`];
    const steps: DecisionTrace["steps"] = [
      {
        tool: "sistema_de_chamados",
        label: draft.kind === "create" ? "criou o chamado" : draft.kind === "update" ? "atualizou o chamado" : "reabriu o chamado",
        input: `rascunho D-${draft.id}`,
        output: `${ticket.number} · ${view.statusLabel}`,
        ok: true,
        durationMs: Date.now() - started,
      },
    ];

    let systemNote: string | null = null;
    if (draft.kind === "create" && ticket.priority === "critica") {
      const handoff = await this.applyHandoff(draft.conversationId, user.id, {
        reason: "caso_critico",
        summary: `Chamado crítico ${ticket.number}: ${ticket.title}. ${ticket.description}`,
        ticketNumber: ticket.number,
      }, null);
      blocks.push({ kind: "handoff", team: handoff.team, dueLabel: handoff.dueLabel });
      content += ` Como é crítico, já chamei o analista de plantão (Suporte ${handoff.team}).`;
      rules.push("Caso crítico: transferência automática para o plantão.");
      steps.push({ tool: "transferir_para_analista", label: "chamou um analista", input: "motivo: caso crítico", output: `Suporte ${handoff.team}`, ok: true, durationMs: 0 });
      systemNote = `Transferida para Suporte ${handoff.team}`;
    }

    await this.updateConversation(draft.conversationId, { relatedTicket: ticket.number });
    const msg = await this.insertMessage(draft.conversationId, "agent", null, content, blocks, {
      understood: `${user.name} confirmou o rascunho D-${draft.id}.`,
      intent: draft.kind === "create" ? "abrir_chamado" : "atualizar_chamado",
      confidence: 1,
      reasoning: "A regra do service desk exige confirmação antes de criar ou atualizar; a confirmação veio do próprio funcionário.",
      action: `${capitalize(steps[0]?.label ?? "")} ${ticket.number} no sistema de chamados.`,
      steps,
      rules,
      model: "regra determinística (sem LLM)",
      latencyMs: Date.now() - started,
      tokens: null,
    });
    emit({ type: "message", message: toMessageView(msg, new Map()) });
    if (systemNote) {
      const sys = await this.insertMessage(draft.conversationId, "system", null, systemNote, [], null);
      emit({ type: "message", message: toMessageView(sys, new Map()) });
    }
    emit({ type: "conversation", conversation: await this.summary(await this.conversationRow(draft.conversationId)) });
  }

  async cancelDraft(user: User, draftId: number, emit: Emit): Promise<void> {
    const draft = await this.ownedDraft(user, draftId);
    return this.withLock(draft.conversationId, async () => {
      await this.cancelDraftInternal(user, await this.ownedDraft(user, draftId), emit);
      emit({ type: "done" });
    });
  }

  private async cancelDraftInternal(user: User, draft: DraftRow, emit: Emit): Promise<void> {
    await this.deps.db.update(drafts).set({ status: "cancelled" }).where(eq(drafts.id, draft.id));
    await this.refreshDraftCards(draft.conversationId);
    const msg = await this.insertMessage(
      draft.conversationId,
      "agent",
      null,
      `Tudo bem, descartei o rascunho D-${draft.id}. Nada foi ${draft.kind === "create" ? "criado" : "alterado"}. Se precisar de mais alguma coisa, é só escrever.`,
      [],
      {
        understood: `${user.name} cancelou o rascunho D-${draft.id}.`,
        intent: draft.kind === "create" ? "abrir_chamado" : "atualizar_chamado",
        confidence: 1,
        reasoning: "Sem confirmação, nada é criado ou alterado.",
        action: "Descartou o rascunho.",
        steps: [],
        rules: ["Rascunho cancelado pelo funcionário."],
        model: "regra determinística (sem LLM)",
        latencyMs: 0,
        tokens: null,
      },
    );
    emit({ type: "message", message: toMessageView(msg, new Map()) });
  }

  /** Edição manual do rascunho no card. A prioridade é recalculada pelas regras. */
  async editDraft(
    user: User,
    draftId: number,
    edits: Pick<DraftPayload, "title" | "description" | "category" | "type" | "affected" | "blocksWork" | "sameDayCommitment"> & { comment?: string | null },
  ): Promise<MessageView | null> {
    const draft = await this.ownedDraft(user, draftId);
    const current = JSON.parse(draft.payload) as DraftPayload;
    let payload: DraftPayload;
    if (draft.kind === "create") {
      payload = buildDraftPayload({ ...current, ...edits, comment: null });
    } else {
      payload = { ...current, comment: edits.comment ?? current.comment };
    }
    await this.deps.db.update(drafts).set({ payload: JSON.stringify(payload) }).where(eq(drafts.id, draft.id));
    return this.refreshDraftCards(draft.conversationId, draft.id);
  }

  /** Mantém os cards de rascunho já exibidos em sincronia com o estado atual. */
  private async refreshDraftCards(conversationId: string, focusDraftId?: number): Promise<MessageView | null> {
    const rows = await this.deps.db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), like(messages.blocks, '%"kind":"draft"%')));
    const draftRows = await this.deps.db.select().from(drafts).where(eq(drafts.conversationId, conversationId));
    const byId = new Map(draftRows.map((d) => [d.id, d]));
    let focused: MessageView | null = null;
    for (const row of rows) {
      const blocks = JSON.parse(row.blocks) as UiBlock[];
      let touched = false;
      const next = blocks.map((b) => {
        if (b.kind !== "draft") return b;
        const d = byId.get(b.draft.id);
        if (!d) return b;
        touched = true;
        return { kind: "draft" as const, draft: toDraftView(d, new Date(d.createdAt)) };
      });
      if (touched) {
        await this.deps.db.update(messages).set({ blocks: JSON.stringify(next) }).where(eq(messages.id, row.id));
        if (focusDraftId && next.some((b) => b.kind === "draft" && b.draft.id === focusDraftId)) {
          focused = toMessageView({ ...row, blocks: JSON.stringify(next) }, new Map());
        }
      }
    }
    return focused;
  }

  // ------------------------------------------------------------- utilidades

  private async history(conversationId: string): Promise<HistoryMessage[]> {
    const rows = await this.deps.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.id))
      .limit(HISTORY_WINDOW);
    const out: HistoryMessage[] = [];
    for (const r of rows.reverse()) {
      if (r.role === "user") out.push({ role: "user", content: r.content });
      else if (r.role === "agent") out.push({ role: "assistant", content: annotate(r.content, JSON.parse(r.blocks) as UiBlock[]) });
      else if (r.role === "analyst") out.push({ role: "assistant", content: `[Mensagem do analista humano] ${r.content}` });
      else out.push({ role: "assistant", content: `[Evento do sistema] ${r.content}` });
    }
    // O modelo espera começar com o usuário.
    while (out.length && out[0]?.role !== "user") out.shift();
    return out;
  }

  async insertMessage(
    conversationId: string,
    role: "user" | "agent" | "analyst" | "system",
    authorId: string | null,
    content: string,
    blocks: UiBlock[],
    trace: DecisionTrace | null,
  ) {
    const at = this.now().toISOString();
    const [row] = await this.deps.db
      .insert(messages)
      .values({ conversationId, role, authorId, content, blocks: JSON.stringify(blocks), trace: trace ? JSON.stringify(trace) : null, createdAt: at })
      .returning();
    if (!row) throw new Error("Falha ao salvar mensagem");
    await this.updateConversation(conversationId, {});
    return row;
  }

  async updateConversation(id: string, patch: Partial<ConversationRow>): Promise<void> {
    await this.deps.db.update(conversations).set({ ...patch, updatedAt: this.now().toISOString() }).where(eq(conversations.id, id));
  }

  private checkRate(userId: string): void {
    const now = Date.now();
    const recent = (this.rate.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= 10) throw new HttpError(429, "Muitas mensagens em pouco tempo. Aguarde alguns segundos.");
    recent.push(now);
    this.rate.set(userId, recent);
  }

  private checkDailyBudget(): void {
    const day = this.now().toISOString().slice(0, 10);
    if (this.turnsToday.day !== day) this.turnsToday = { day, count: 0 };
    const max = Number(process.env.MAX_AGENT_TURNS_PER_DAY ?? "1000");
    if (this.turnsToday.count >= max) throw new HttpError(429, "Limite diário de uso do assistente atingido. Tente amanhã ou fale com o ramal 4000.");
    this.turnsToday.count++;
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
}

// ---------------------------------------------------------------- auxiliares

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Descreve no histórico o que a interface mostrou, para o modelo manter o contexto. */
function annotate(content: string, blocks: UiBlock[]): string {
  const notes = blocks.map((b) => {
    switch (b.kind) {
      case "quick_replies":
        return `opções exibidas: ${b.options.join(" | ")}`;
      case "ticket_selector":
        return `lista para escolher: ${b.tickets.map((t) => `${t.number} ${t.title}`).join("; ")}`;
      case "ticket_card":
        return `card do ${b.ticket.number} (${b.ticket.statusLabel}, ${b.ticket.overdue ? "vencido" : b.ticket.slaLabel})`;
      case "draft":
        return `rascunho ${b.draft.code} (${b.draft.status}): ${b.draft.title} · ${b.draft.categoryLabel} · ${b.draft.priorityLabel} · ${b.draft.affectedLabel}`;
      case "articles":
        return `artigos: ${b.articles.map((a) => a.id).join(", ")}`;
      case "handoff":
        return `transferido para Suporte ${b.team}`;
    }
  });
  return notes.length ? `${content}\n[Na tela: ${notes.join(" · ")}]` : content;
}

function fallbackText(turn: TurnContext): string {
  if (turn.handoff) return "Encaminhei para um analista. Ele vai continuar o atendimento por aqui.";
  if (turn.blocks.some((b) => b.kind === "draft")) return "Confira o rascunho antes de eu continuar:";
  if (turn.blocks.some((b) => b.kind === "ticket_selector")) return "Sobre qual destes chamados você quer saber?";
  if (turn.blocks.some((b) => b.kind === "ticket_card")) return "Aqui está o chamado:";
  return "Pode me contar um pouco mais sobre o que está acontecendo?";
}

function describeAction(turn: TurnContext): string {
  const parts: string[] = [];
  const draft = turn.blocks.find((b) => b.kind === "draft");
  const card = turn.blocks.find((b) => b.kind === "ticket_card");
  const selector = turn.blocks.find((b) => b.kind === "ticket_selector");
  const articles = turn.blocks.find((b) => b.kind === "articles");
  if (draft?.kind === "draft") {
    parts.push(
      draft.draft.kind === "create"
        ? `Montou o rascunho ${draft.draft.code} (prioridade ${draft.draft.priorityLabel.toLowerCase()}) e pediu confirmação antes de criar.`
        : `Montou a ${draft.draft.kind === "update" ? "atualização" : "reabertura"} do ${draft.draft.ticketNumber} e pediu confirmação.`,
    );
  }
  if (card?.kind === "ticket_card") parts.push(`Mostrou o ${card.ticket.number} com a situação do prazo.`);
  if (selector?.kind === "ticket_selector") parts.push(`Pediu para escolher entre ${selector.tickets.length} chamados abertos.`);
  if (articles?.kind === "articles" && !draft) parts.push(`Respondeu com base em ${articles.articles.map((a) => a.id).join(", ")}.`);
  if (turn.handoff) parts.push(`Transferiu para um analista (${HANDOFF_REASON_LABEL[turn.handoff.reason].toLowerCase()}).`);
  if (!parts.length && turn.blocks.some((b) => b.kind === "quick_replies")) parts.push("Fez uma pergunta para completar as informações.");
  if (!parts.length) parts.push(turn.steps.length ? "Respondeu com base nas consultas feitas." : "Respondeu sem consultar sistemas.");
  return parts.join(" ");
}

function relatedTicketOf(blocks: UiBlock[]): string | null {
  for (const b of blocks) {
    if (b.kind === "ticket_card") return b.ticket.number;
    if (b.kind === "draft" && b.draft.ticketNumber) return b.draft.ticketNumber;
  }
  return null;
}

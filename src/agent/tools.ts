import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { INTENTS } from "@/domain/conversation";
import { findDuplicate, canReopen } from "@/domain/duplicates";
import { CATEGORIES, CATEGORY_LABEL, IMPACTS, isOpenStatus, type Ticket } from "@/domain/types";
import { searchArticles } from "@/services/knowledge/search";
import { TicketNotFoundError } from "@/services/tickets/service";
import { buildDraftPayload, toDraftView, toTicketView } from "@/server/views";
import { traced, TURN_KEY, type TurnContext } from "./turn";

/**
 * Ferramentas do Nexo Assist. Regras importantes ficam aqui, em código:
 * - a identidade vem do turno (servidor), nunca de um argumento do modelo;
 * - prioridade e prazo são calculados, não escolhidos pelo modelo;
 * - duplicidade é verificada antes de qualquer rascunho;
 * - nada é criado ou alterado sem confirmação: as ferramentas só montam rascunhos.
 */

export const CONFIDENCE_THRESHOLD = 0.6;

function turnOf(context: { requestContext?: { get: (key: string) => unknown } }): TurnContext {
  const turn = context.requestContext?.get(TURN_KEY) as TurnContext | undefined;
  if (!turn) throw new Error("Contexto do turno ausente");
  return turn;
}

async function userTickets(turn: TurnContext): Promise<Ticket[]> {
  if (turn.ticketCache.size === 0) {
    for (const t of await turn.tickets.listByRequester(turn.user.id)) turn.ticketCache.set(t.number, t);
  }
  return [...turn.ticketCache.values()];
}

function summarize(t: Ticket, turn: TurnContext): string {
  const v = toTicketView(t, turn.now);
  const reopen = canReopen(t, turn.now) ? " · pode ser reaberto" : "";
  return `${v.number} · ${v.title} · ${v.categoryLabel} · ${v.statusLabel} · prioridade ${v.priorityLabel} · aberto em ${v.openedShort} · última atualização ${v.updatedAgo} · ${v.overdue ? "PRAZO VENCIDO" : v.slaLabel}${reopen}`;
}

/** Aceita "INC-20311", "inc 20311" ou só "20311". */
async function resolveNumber(turn: TurnContext, raw: string): Promise<string> {
  const digits = raw.replace(/\D/g, "");
  const prefix = raw.toUpperCase().match(/INC|REQ/)?.[0];
  if (prefix && digits) return `${prefix}-${digits}`;
  const mine = await userTickets(turn);
  return mine.find((t) => t.number.endsWith(`-${digits}`))?.number ?? raw.toUpperCase();
}

export const registrarEntendimento = createTool({
  id: "registrar_entendimento",
  description:
    "Chame SEMPRE primeiro, a cada mensagem do funcionário, antes de qualquer outra ferramenta ou resposta. " +
    "Registra o que você entendeu, a intenção, sua confiança (0 a 1) de que a ação que vai tomar é a correta, e o porquê. " +
    "Esse registro aparece para o funcionário e para o analista.",
  inputSchema: z.object({
    entendimento: z.string().describe("O que o funcionário quer, em uma frase, com os fatos relevantes."),
    intencao: z.enum(INTENTS),
    confianca: z.number().min(0).max(1).describe("Confiança de que a ação escolhida é a certa. Perguntar algo que falta pode ter confiança alta."),
    motivo: z.string().describe("Por que essa é a ação certa, citando a regra do service desk quando houver."),
  }),
  execute: async (input, context) => {
    const turn = turnOf(context);
    turn.decision = {
      understood: input.entendimento,
      intent: input.intencao,
      confidence: input.confianca,
      reasoning: input.motivo,
    };
    if (input.confianca < CONFIDENCE_THRESHOLD) {
      turn.rules.push(`Confiança ${Math.round(input.confianca * 100)}% abaixo do mínimo de ${CONFIDENCE_THRESHOLD * 100}%.`);
      return {
        ok: true,
        atencao:
          "Confiança baixa. Se falta uma informação, faça UMA pergunta objetiva. Se não sabe o que fazer, transfira para um analista com motivo baixa_confianca.",
      };
    }
    return { ok: true };
  },
});

export const consultarChamados = createTool({
  id: "consultar_chamados",
  description:
    "Lista os chamados do funcionário (somente dele), com status e situação de prazo. Use para consultas sem número, " +
    "para achar um chamado pelo assunto e antes de abrir um chamado novo. Com exibirSeletor=true, mostra os chamados abertos " +
    "como uma lista para o funcionário escolher.",
  inputSchema: z.object({
    exibirSeletor: z.boolean().describe("true quando há mais de um chamado aberto e você precisa que o funcionário escolha."),
  }),
  execute: async ({ exibirSeletor }, context) => {
    const turn = turnOf(context);
    return traced(turn, { tool: "consultar_chamados", labels: ["consultou seus chamados"], input: `chamados de ${turn.user.name}` }, async () => {
      const list = await userTickets(turn);
      const open = list.filter((t) => isOpenStatus(t.status));
      const recent = list.filter((t) => !isOpenStatus(t.status)).slice(0, 4);
      if (exibirSeletor && open.length > 0) {
        turn.blocks.push({ kind: "ticket_selector", tickets: open.map((t) => toTicketView(t, turn.now)) });
      }
      const overdue = open.filter((t) => toTicketView(t, turn.now).overdue);
      return {
        result: {
          abertos: open.map((t) => summarize(t, turn)),
          encerradosRecentes: recent.map((t) => summarize(t, turn)),
          seletorExibido: exibirSeletor && open.length > 0,
        },
        output: `${open.length} aberto(s)${overdue.length ? `, ${overdue.length} vencido(s)` : ""}; ${recent.length} encerrado(s) recente(s)`,
      };
    });
  },
});

export const consultarChamado = createTool({
  id: "consultar_chamado",
  description:
    "Mostra um chamado do funcionário em detalhe (card na conversa), com histórico e situação de prazo. " +
    "Aceita o número completo ou só os dígitos. Só funciona para chamados do próprio funcionário.",
  inputSchema: z.object({ numero: z.string() }),
  execute: async ({ numero }, context) => {
    const turn = turnOf(context);
    const number = await resolveNumber(turn, numero);
    return traced(turn, { tool: "consultar_chamado", labels: [`consultou o ${number}`, "calculou o prazo"], input: number }, async () => {
      let ticket: Ticket;
      try {
        ticket = turn.ticketCache.get(number) ?? (await turn.tickets.get(number, turn.user.id));
      } catch (err) {
        if (err instanceof TicketNotFoundError) {
          turn.rules.push("Privacidade: só os chamados do próprio funcionário podem ser consultados.");
          return {
            result: { encontrado: false, mensagem: `Não existe ${number} entre os chamados deste funcionário.` },
            output: "não encontrado entre os chamados do funcionário",
            labels: [`consultou o ${number}`],
          };
        }
        throw err;
      }
      turn.ticketCache.set(ticket.number, ticket);
      const view = toTicketView(ticket, turn.now);
      turn.blocks.push({ kind: "ticket_card", ticket: view });
      if (view.overdue) {
        turn.rules.push(`${view.number} sem atualização ${view.updatedAgo}, acima do prazo de ${view.slaRule} para prioridade ${view.priorityLabel.toLowerCase()}: chamado vencido.`);
      }
      return {
        result: {
          encontrado: true,
          chamado: summarize(ticket, turn),
          descricao: ticket.description,
          prazo: view.overdue ? `VENCIDO (regra: ${view.slaRule} para prioridade ${view.priorityLabel})` : view.slaLabel,
          ultimosEventos: ticket.events.slice(-3).map((e) => `${e.at.slice(0, 10)} ${e.kind}: ${e.text}`),
          podeSerReaberto: canReopen(ticket, turn.now),
          regra: view.overdue ? "Chamado vencido: ofereça chamar um analista." : undefined,
        },
        output: `${view.statusLabel}, ${view.overdue ? "prazo vencido" : view.slaLabel}`,
      };
    });
  },
});

export const buscarCentralDeAjuda = createTool({
  id: "buscar_central_de_ajuda",
  description:
    "Busca artigos na central de ajuda de TI. Use para dúvidas e antes de abrir chamado, para ver se há solução de autoatendimento. " +
    "Confira as condições do artigo (ex.: sistema operacional) antes de recomendar.",
  inputSchema: z.object({ consulta: z.string().describe("Palavras-chave do problema, ex.: 'vpn erro 809'.") }),
  execute: async ({ consulta }, context) => {
    const turn = turnOf(context);
    return traced(turn, { tool: "buscar_central_de_ajuda", labels: ["buscou na central de ajuda"], input: consulta }, async () => {
      const hits = searchArticles(consulta).filter((h) => h.score >= 0.8);
      if (hits.length > 0) {
        turn.blocks.push({ kind: "articles", articles: hits.slice(0, 2).map((h) => ({ id: h.article.id, title: h.article.title })) });
      }
      return {
        result: { artigos: hits.map((h) => ({ id: h.article.id, titulo: h.article.title, conteudo: h.article.body })) },
        output: hits.length ? hits.map((h) => `${h.article.id} ${h.article.title}`).join("; ") : "nenhum artigo relevante",
      };
    });
  },
});

export const prepararRascunhoChamado = createTool({
  id: "preparar_rascunho_chamado",
  description:
    "Monta o rascunho de um chamado NOVO e mostra para o funcionário confirmar (não cria nada). Só chame quando souber " +
    "tipo, categoria, título, descrição e quem é afetado. A prioridade e o prazo são calculados pelas regras a partir dos sinais " +
    "informados. Verifica duplicidade: se já houver chamado aberto sobre o mesmo problema, devolve o chamado existente.",
  inputSchema: z.object({
    tipo: z.enum(["INC", "REQ"]).describe("INC: algo parou ou não funciona. REQ: pedido de acesso, equipamento ou software."),
    titulo: z.string().max(90).describe("Curto e específico, ex.: 'VPN não conecta no notebook — erro 809'."),
    descricao: z.string().describe("Descrição completa para o analista não precisar perguntar de novo: sintoma, desde quando, equipamento, o que já tentou, impacto."),
    categoria: z.enum(CATEGORIES),
    item: z.string().optional().describe("Equipamento ou sistema, ex.: 'Notebook', 'SAP', 'VPN'."),
    afetados: z.enum(IMPACTS).describe("individual: só a pessoa; equipe; empresa."),
    impedeTrabalho: z.boolean().describe("O problema impede de trabalhar (algo parado)? false se só atrapalha ou há alternativa."),
    compromissoHoje: z.boolean().describe("Há um compromisso no mesmo dia que depende da solução?"),
    ignorarDuplicado: z.boolean().optional().describe("Só true se o funcionário confirmou que é um problema diferente do chamado parecido."),
  }),
  execute: async (input, context) => {
    const turn = turnOf(context);
    const labels = ["verificou duplicidade", "classificou a prioridade", "consultou o SLA", "montou o rascunho"];
    return traced(turn, { tool: "preparar_rascunho_chamado", labels, input: `${input.tipo} · ${CATEGORY_LABEL[input.categoria]} · ${input.titulo}` }, async () => {
      const mine = await userTickets(turn);
      const dup = findDuplicate({ title: input.titulo, description: input.descricao, category: input.categoria }, mine, turn.now);
      if (dup && !input.ignorarDuplicado) {
        turn.rules.push(
          dup.action === "update"
            ? `Sem duplicidade: ${dup.ticket.number} já está aberto sobre o mesmo problema; ele deve ser atualizado, não duplicado.`
            : `${dup.ticket.number} trata do mesmo problema e foi resolvido há até 7 dias: pode ser reaberto.`,
        );
        return {
          result: {
            rascunhoCriado: false,
            chamadoExistente: summarize(dup.ticket, turn),
            acaoSugerida: dup.action === "update" ? "complementar o chamado existente" : "reabrir o chamado existente",
            instrucao:
              "Não crie outro chamado. Explique que já existe este chamado e ofereça complementá-lo/reabri-lo com preparar_atualizacao_chamado. " +
              "Se o funcionário disser que é outro problema, chame de novo com ignorarDuplicado=true.",
          },
          output: `possível duplicado: ${dup.ticket.number}`,
          labels: ["verificou duplicidade"],
        };
      }
      if (dup && input.ignorarDuplicado) {
        turn.rules.push(`Funcionário confirmou que é diferente do ${dup.ticket.number}; novo chamado permitido.`);
      }
      const payload = buildDraftPayload({
        type: input.tipo,
        title: input.titulo,
        description: input.descricao,
        category: input.categoria,
        item: input.item ?? null,
        affected: input.afetados,
        blocksWork: input.impedeTrabalho,
        sameDayCommitment: input.compromissoHoje,
        comment: null,
      });
      turn.rules.push(payload.priorityRationale);
      const created = await turn.drafts.create({ kind: "create", ticketNumber: null, payload });
      const view = toDraftView(
        { id: created.id, conversationId: turn.conversationId, userId: turn.user.id, kind: "create", ticketNumber: null, payload: JSON.stringify(payload), status: "pending", resultTicket: null, createdAt: turn.now.toISOString() },
        turn.now,
      );
      turn.blocks.push({ kind: "draft", draft: view });
      return {
        result: {
          rascunhoCriado: true,
          rascunho: view.code,
          prioridade: view.priorityLabel,
          motivoPrioridade: payload.priorityRationale,
          prazo: view.dueLabel,
          observacao:
            payload.priority === "critica"
              ? "Prioridade crítica: depois da confirmação, o chamado vai direto para o analista de plantão."
              : undefined,
          instrucao: "O card do rascunho já está na tela com os botões Confirmar, Editar e Cancelar. Explique a prioridade em uma frase e peça para conferir.",
        },
        output: `${view.code}: prioridade ${view.priorityLabel}, ${view.dueLabel}`,
      };
    });
  },
});

export const prepararAtualizacaoChamado = createTool({
  id: "preparar_atualizacao_chamado",
  description:
    "Monta, para confirmação, a atualização de um chamado do funcionário: adiciona novas informações a um chamado aberto, " +
    "ou reabre um chamado resolvido há até 7 dias. Não altera nada até o funcionário confirmar.",
  inputSchema: z.object({
    numero: z.string(),
    complemento: z.string().describe("O que será adicionado ao chamado, escrito para o analista."),
  }),
  execute: async ({ numero, complemento }, context) => {
    const turn = turnOf(context);
    const number = await resolveNumber(turn, numero);
    return traced(turn, { tool: "preparar_atualizacao_chamado", labels: [`consultou o ${number}`, "montou a atualização"], input: `${number}: ${complemento}` }, async () => {
      let ticket: Ticket;
      try {
        ticket = turn.ticketCache.get(number) ?? (await turn.tickets.get(number, turn.user.id));
      } catch (err) {
        if (err instanceof TicketNotFoundError) {
          turn.rules.push("Privacidade: só os chamados do próprio funcionário podem ser alterados.");
          return { result: { rascunhoCriado: false, motivo: `Não existe ${number} entre os chamados deste funcionário.` }, output: "não encontrado", labels: [`consultou o ${number}`] };
        }
        throw err;
      }
      const open = isOpenStatus(ticket.status);
      const reopen = !open && canReopen(ticket, turn.now);
      if (!open && !reopen) {
        turn.rules.push(`${ticket.number} foi encerrado há mais de 7 dias e não pode ser reaberto.`);
        return {
          result: { rascunhoCriado: false, motivo: "Chamado encerrado há mais de 7 dias: não pode ser reaberto. Ofereça abrir um chamado novo." },
          output: "encerrado há mais de 7 dias",
          labels: [`consultou o ${number}`],
        };
      }
      if (reopen) turn.rules.push(`${ticket.number} foi resolvido há até 7 dias: pode ser reaberto em vez de abrir outro.`);
      const payload = buildDraftPayload({
        type: ticket.type,
        title: ticket.title,
        description: ticket.description,
        category: ticket.category,
        item: ticket.item,
        affected: ticket.affected,
        blocksWork: ticket.priority === "alta" || ticket.priority === "critica",
        sameDayCommitment: false,
        comment: complemento,
      });
      // Atualização mantém a prioridade atual do chamado.
      payload.priority = ticket.priority;
      payload.priorityRationale = "Prioridade mantida do chamado original.";
      const kind = reopen ? "reopen" : "update";
      const created = await turn.drafts.create({ kind, ticketNumber: ticket.number, payload });
      const view = toDraftView(
        { id: created.id, conversationId: turn.conversationId, userId: turn.user.id, kind, ticketNumber: ticket.number, payload: JSON.stringify(payload), status: "pending", resultTicket: null, createdAt: turn.now.toISOString() },
        turn.now,
      );
      turn.blocks.push({ kind: "draft", draft: view });
      return {
        result: { rascunhoCriado: true, rascunho: view.code, tipo: reopen ? "reabertura" : "atualização", instrucao: "O card já está na tela com Confirmar/Editar/Cancelar. Peça para conferir." },
        output: `${view.code}: ${reopen ? "reabertura" : "atualização"} do ${ticket.number}`,
      };
    });
  },
});

export const transferirParaAnalista = createTool({
  id: "transferir_para_analista",
  description:
    "Transfere a conversa para um analista humano. Use quando o funcionário pedir, em caso crítico, em chamado vencido " +
    "(depois de oferecer e o funcionário aceitar) ou quando você não tiver segurança sobre o que fazer. Depois disso você " +
    "para de responder até o analista devolver a conversa.",
  inputSchema: z.object({
    motivo: z.enum(["pedido_do_funcionario", "caso_critico", "chamado_vencido", "baixa_confianca"]),
    resumo: z.string().describe("Resumo do caso para o analista não precisar perguntar tudo de novo."),
    numeroChamado: z.string().optional().describe("Chamado relacionado, se houver."),
  }),
  execute: async ({ motivo, resumo, numeroChamado }, context) => {
    const turn = turnOf(context);
    return traced(turn, { tool: "transferir_para_analista", labels: ["chamou um analista"], input: `motivo: ${motivo}` }, async () => {
      const number = numeroChamado ? await resolveNumber(turn, numeroChamado) : null;
      turn.handoff = { reason: motivo, summary: resumo, ticketNumber: number };
      const team = motivo === "caso_critico" || motivo === "chamado_vencido" ? "N2" : "N1";
      return {
        result: {
          ok: true,
          fila: `Suporte ${team}`,
          instrucao: "Avise em uma ou duas frases que encaminhou e quando um analista deve responder. A conversa fica pausada para você.",
        },
        output: `conversa na fila do Suporte ${team}`,
      };
    });
  },
});

export const mostrarOpcoes = createTool({
  id: "mostrar_opcoes",
  description:
    "Mostra botões de resposta rápida abaixo da sua mensagem (2 a 4 opções curtas). Use para perguntas fechadas, " +
    "ex.: quem é afetado ('Só eu', 'Minha equipe', 'Toda a empresa', 'Não sei') ou próximos passos.",
  inputSchema: z.object({
    pergunta: z.string().optional().describe("Pergunta curta exibida em destaque acima das opções. Omita se a pergunta já está no seu texto."),
    opcoes: z.array(z.string().max(40)).min(2).max(4),
  }),
  execute: async ({ pergunta, opcoes }, context) => {
    const turn = turnOf(context);
    turn.blocks.push({ kind: "quick_replies", question: pergunta ?? null, options: opcoes });
    return { ok: true, observacao: "As opções já aparecem na tela; não as repita no texto." };
  },
});

export const nexoTools = {
  registrar_entendimento: registrarEntendimento,
  consultar_chamados: consultarChamados,
  consultar_chamado: consultarChamado,
  buscar_central_de_ajuda: buscarCentralDeAjuda,
  preparar_rascunho_chamado: prepararRascunhoChamado,
  preparar_atualizacao_chamado: prepararAtualizacaoChamado,
  transferir_para_analista: transferirParaAnalista,
  mostrar_opcoes: mostrarOpcoes,
};

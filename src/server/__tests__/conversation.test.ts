import { describe, expect, it } from "vitest";
import type { StreamEvent, UiBlock } from "@/domain/conversation";
import { MESSAGE_LIMIT } from "@/domain/conversation";
import { HttpError } from "../errors";
import { setup } from "./harness";

const understand = (intencao: string, confianca = 0.9) => ({
  entendimento: "teste",
  intencao,
  confianca,
  motivo: "teste",
});

function lastAgentBlocks(events: StreamEvent[]): UiBlock[] {
  const msgs = events.filter((e): e is Extract<StreamEvent, { type: "message" }> => e.type === "message" && e.message.role === "agent");
  return msgs.at(-1)?.message.blocks ?? [];
}

describe("abertura de chamado com confirmação", () => {
  it("monta rascunho com prioridade calculada e só cria depois da confirmação", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("abrir_chamado"));
      await call("consultar_chamados", { exibirSeletor: false });
      const r = (await call("preparar_rascunho_chamado", {
        tipo: "INC",
        titulo: "VPN não conecta no notebook — erro 809",
        descricao: "Desde ontem o notebook (Windows 11) não conecta na VPN, erro 809. Reunião com cliente às 14h.",
        categoria: "rede_vpn",
        item: "VPN",
        afetados: "individual",
        impedeTrabalho: false,
        compromissoHoje: true,
      })) as { rascunhoCriado: boolean; prioridade: string };
      expect(r.rascunhoCriado).toBe(true);
      expect(r.prioridade).toBe("Alta");
      return "Coloquei prioridade alta por causa da reunião. Confira:";
    });

    const before = (await t.service.listByRequester("u-ana")).length;
    const events = await t.send("u-ana", "Meu notebook não conecta na VPN, erro 809. Tenho reunião às 14h");
    const draft = lastAgentBlocks(events).find((b) => b.kind === "draft");
    expect(draft?.kind === "draft" && draft.draft.priorityLabel).toBe("Alta");
    expect(draft?.kind === "draft" && draft.draft.dueLabel).toBe("resposta até 14:00");
    expect((await t.service.listByRequester("u-ana")).length).toBe(before); // nada criado ainda

    // "sim" confirma por regra, sem chamar o modelo
    const confirm = await t.send("u-ana", "sim");
    expect(t.runner.calls.length).toBe(1);
    const card = lastAgentBlocks(confirm).find((b) => b.kind === "ticket_card");
    expect(card?.kind === "ticket_card" && card.ticket.priority).toBe("alta");
    expect((await t.service.listByRequester("u-ana")).length).toBe(before + 1);

    const view = await t.conversations.view(await t.conversations.activeConversation(await t.user("u-ana")));
    const confirmed = view.messages.flatMap((m) => m.blocks).find((b) => b.kind === "draft");
    expect(confirmed?.kind === "draft" && confirmed.draft.status).toBe("confirmed");
    expect(view.messages.at(-1)?.trace?.model).toBe("regra determinística (sem LLM)");
  });

  it("não duplica: aponta o chamado aberto sobre o mesmo problema", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("abrir_chamado"));
      const r = (await call("preparar_rascunho_chamado", {
        tipo: "INC",
        titulo: "Notebook lento depois da atualização do Windows",
        descricao: "Notebook continua lento após atualização",
        categoria: "hardware",
        afetados: "individual",
        impedeTrabalho: false,
        compromissoHoje: false,
      })) as { rascunhoCriado: boolean; chamadoExistente: string };
      expect(r.rascunhoCriado).toBe(false);
      expect(r.chamadoExistente).toContain("INC-20311");
      return "Você já tem o INC-20311 sobre isso.";
    });
    const events = await t.send("u-ana", "meu notebook está lento depois da atualização");
    expect(lastAgentBlocks(events).some((b) => b.kind === "draft")).toBe(false);
    const msg = events.find((e) => e.type === "message");
    expect(msg?.type === "message" && msg.message.trace?.rules.join(" ")).toContain("Sem duplicidade");
  });

  it("caso crítico confirmado vai direto para o analista de plantão", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("abrir_chamado"));
      await call("preparar_rascunho_chamado", {
        tipo: "INC",
        titulo: "Sistema de faturamento fora do ar",
        descricao: "Ninguém do Financeiro consegue acessar o faturamento",
        categoria: "software",
        afetados: "equipe",
        impedeTrabalho: true,
        compromissoHoje: true,
      });
      return "Confira:";
    });
    await t.send("u-ana", "o faturamento caiu para o time inteiro");
    const events = await t.send("u-ana", "pode criar");
    const blocks = lastAgentBlocks(events);
    expect(blocks.some((b) => b.kind === "handoff" && b.team === "N2")).toBe(true);
    const conv = await t.conversations.activeConversation(await t.user("u-ana"));
    expect(conv.mode).toBe("waiting_human");
    expect(conv.handoffReason).toBe("caso_critico");
  });

  it("sistema de chamados fora do ar: confirmação falha com 503 e o rascunho continua pendente", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("abrir_chamado"));
      await call("preparar_rascunho_chamado", {
        tipo: "REQ", titulo: "Instalar Power BI", descricao: "Preciso do Power BI", categoria: "software",
        afetados: "individual", impedeTrabalho: false, compromissoHoje: false,
      });
      return "Confira:";
    });
    const events = await t.send("u-ana", "preciso do power bi instalado");
    const draft = lastAgentBlocks(events).find((b) => b.kind === "draft");
    if (draft?.kind !== "draft") throw new Error("sem rascunho");

    (t.service as unknown as { sim: { failureRate: number } }).sim.failureRate = 1;
    await expect(t.conversations.confirmDraft(await t.user("u-ana"), draft.draft.id, () => {})).rejects.toMatchObject({ status: 503 });
    (t.service as unknown as { sim: { failureRate: number } }).sim.failureRate = 0;
    await t.conversations.confirmDraft(await t.user("u-ana"), draft.draft.id, () => {});
    expect((await t.service.listByRequester("u-ana")).some((x) => x.title === "Instalar Power BI")).toBe(true);
  });
});

describe("consulta e privacidade", () => {
  it("nunca mostra chamado de outro funcionário", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("consultar_chamado"));
      const r = (await call("consultar_chamado", { numero: "INC-20325" })) as { encontrado: boolean };
      expect(r.encontrado).toBe(false);
      return "Não encontrei esse chamado entre os seus.";
    });
    const events = await t.send("u-ana", "como está o INC-20325?");
    expect(lastAgentBlocks(events).some((b) => b.kind === "ticket_card")).toBe(false);
  });

  it("chamado vencido sempre ganha a oferta de chamar um analista", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("consultar_chamado"));
      await call("consultar_chamado", { numero: "20311" }); // só os dígitos
      return "Está sem atualização há 6 dias.";
    });
    const events = await t.send("u-ana", "e o meu chamado do notebook?");
    const blocks = lastAgentBlocks(events);
    const card = blocks.find((b) => b.kind === "ticket_card");
    expect(card?.kind === "ticket_card" && card.ticket.overdue).toBe(true);
    const options = blocks.find((b) => b.kind === "quick_replies");
    expect(options?.kind === "quick_replies" && options.options).toContain("Falar com um analista");
  });
});

describe("transferência para analista", () => {
  it("pausa o agent enquanto a conversa está com um analista e retoma ao devolver", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("falar_com_analista"));
      await call("transferir_para_analista", { motivo: "chamado_vencido", resumo: "INC-20311 vencido", numeroChamado: "INC-20311" });
      return "Encaminhei para o Suporte N2.";
    });
    await t.send("u-ana", "isso já passou do prazo, resolve pra mim");
    expect(t.runner.calls.length).toBe(1);

    await t.send("u-ana", "alô?");
    expect(t.runner.calls.length).toBe(1); // agent não respondeu

    const ticket = await t.service.get("INC-20311", "u-ana");
    expect(ticket.events.at(-1)?.kind).toBe("transferido");

    const rafael = await t.user("a-rafael");
    const conv = await t.conversations.activeConversation(await t.user("u-ana"));
    await t.console.assume(rafael, conv.id);
    await t.console.send(rafael, conv.id, "Oi, Ana! Aqui é o Rafael.");
    await t.console.returnToAgent(rafael, conv.id);

    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("outro"));
      return "Estou de volta. Posso ajudar em algo mais?";
    });
    await t.send("u-ana", "obrigada!");
    expect(t.runner.calls.length).toBe(2);
    // o histórico enviado ao modelo inclui a fala do analista
    expect(t.runner.calls[1]?.history.some((h) => h.content.includes("Aqui é o Rafael"))).toBe(true);
  });

  it("pedido explícito por uma pessoa transfere sem chamar o modelo", async () => {
    const t = await setup();
    const events = await t.send("u-ana", "Quero falar com um analista, por favor");
    expect(t.runner.calls.length).toBe(0);
    const conv = await t.conversations.activeConversation(await t.user("u-ana"));
    expect(conv.mode).toBe("waiting_human");
    expect(conv.handoffReason).toBe("pedido_do_funcionario");
    expect(lastAgentBlocks(events).some((b) => b.kind === "handoff")).toBe(true);
    const msg = events.find((e) => e.type === "message" && e.message.role === "agent");
    expect(msg?.type === "message" && msg.message.trace?.model).toBe("regra determinística (sem LLM)");
  });

  it("'Tentar de novo' depois de falha do modelo repete a pergunta original", async () => {
    const t = await setup();
    t.runner.push(async () => {
      throw new Error("503 high demand");
    });
    const failed = await t.send("u-ana", "Qual o horário do service desk?");
    expect(lastAgentBlocks(failed).some((b) => b.kind === "quick_replies")).toBe(true);

    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("duvida"));
      return "De segunda a sexta, das 8h às 18h.";
    });
    await t.send("u-ana", "Tentar de novo");
    const history = t.runner.calls[1]?.history ?? [];
    expect(history.at(-1)).toEqual({ role: "user", content: "Qual o horário do service desk?" });
    expect(history.some((h) => h.content.includes("Tive um problema"))).toBe(false);
  });

  it("confiança muito baixa sem pergunta vira transferência automática", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("outro", 0.3));
      return "Hmm, não sei bem.";
    });
    await t.send("u-ana", "o negócio da sala lá deu ruim de novo com aquele lance");
    const conv = await t.conversations.activeConversation(await t.user("u-ana"));
    expect(conv.mode).toBe("waiting_human");
    expect(conv.handoffReason).toBe("baixa_confianca");
    expect(conv.handoffConfidence).toBe(30);
    const list = await t.console.list(await t.user("a-rafael"), "para_voce", "");
    expect(list.items.find((i) => i.id === conv.id)?.tag.label).toBe("Agent pediu ajuda · confiança 30%");
  });

  it("só quem assumiu pode responder", async () => {
    const t = await setup();
    const julia = await t.user("a-julia");
    const rafael = await t.user("a-rafael");
    await t.console.assume(rafael, "c-carla");
    await expect(t.console.send(julia, "c-carla", "oi")).rejects.toBeInstanceOf(HttpError);
    await expect(t.console.assume(julia, "c-carla")).rejects.toBeInstanceOf(HttpError);
  });
});

describe("limites", () => {
  it(`bloqueia a mensagem ${MESSAGE_LIMIT + 1} da sessão`, async () => {
    const t = await setup();
    const ana = await t.user("u-ana");
    const conv = await t.conversations.activeConversation(ana);
    await t.conversations.updateConversation(conv.id, { userMessageCount: MESSAGE_LIMIT });
    await expect(t.send("u-ana", "mais uma")).rejects.toMatchObject({ status: 429 });
    const fresh = await t.conversations.startNewConversation(ana);
    expect(fresh.id).not.toBe(conv.id);
  });
});

describe("higiene da resposta", () => {
  it("remove anotações internas copiadas e opções que duplicam o card do rascunho", async () => {
    const t = await setup();
    t.runner.push(async (call) => {
      await call("registrar_entendimento", understand("abrir_chamado"));
      await call("preparar_rascunho_chamado", {
        tipo: "INC", titulo: "VPN não conecta", descricao: "Erro 809", categoria: "rede_vpn",
        afetados: "individual", impedeTrabalho: true, compromissoHoje: true,
      });
      await call("mostrar_opcoes", { opcoes: ["Confirmar chamado", "Cancelar"] });
      return "Confira o rascunho.\n<<interface: rascunho D-381 — anotação interna, não repita>>\n[Na tela: card de rascunho]";
    });
    const events = await t.send("u-ana", "vpn caiu, reunião hoje");
    const msg = events.find((e) => e.type === "message" && e.message.role === "agent");
    if (msg?.type !== "message") throw new Error("sem resposta");
    expect(msg.message.content).toBe("Confira o rascunho.");
    expect(msg.message.blocks.some((b) => b.kind === "quick_replies")).toBe(false);

    // "Confirmar chamado" por texto confirma o rascunho sem chamar o modelo
    await t.send("u-ana", "Confirmar chamado");
    expect(t.runner.calls.length).toBe(1);
    expect((await t.service.listByRequester("u-ana")).some((x) => x.title === "VPN não conecta")).toBe(true);
  });
});

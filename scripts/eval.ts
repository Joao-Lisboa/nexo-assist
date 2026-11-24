/**
 * Avaliação das decisões do agent com o modelo de verdade.
 *
 * Cada cenário roda numa base nova (dados de exemplo, terça 10h) e verifica o
 * RESULTADO observável do turno — blocos exibidos, transferência, rascunho,
 * intenção registrada — em vez do texto exato, que varia entre execuções.
 *
 *   npm run eval              # todos os cenários
 *   npm run eval -- vpn dup   # só os que contêm esses termos no id
 */
import fs from "node:fs";

try {
  process.loadEnvFile(".env");
} catch {
  // sem .env: usa as variáveis do ambiente
}
import type { DecisionTrace, StreamEvent, UiBlock } from "@/domain/conversation";
import { MastraAgentRunner, modelChain } from "@/agent/runner";
import { setup } from "@/server/__tests__/harness";

interface TurnResult {
  text: string;
  blocks: UiBlock[];
  trace: DecisionTrace | null;
  mode: string;
  handoffReason: string | null;
}

interface Scenario {
  id: string;
  title: string;
  user?: string;
  turns: string[];
  check: (last: TurnResult, all: TurnResult[]) => string | null; // null = ok
}

const has = (r: TurnResult, kind: UiBlock["kind"]) => r.blocks.some((b) => b.kind === kind);
const draftOf = (r: TurnResult) => r.blocks.find((b): b is Extract<UiBlock, { kind: "draft" }> => b.kind === "draft")?.draft;
const tools = (r: TurnResult) => r.trace?.steps.map((s) => s.tool) ?? [];

const SCENARIOS: Scenario[] = [
  {
    id: "duvida-horario",
    title: "Dúvida respondida pela central de ajuda, sem chamado",
    turns: ["Qual o horário de atendimento do service desk?"],
    // O horário também está nas regras do prompt; o que importa é responder certo sem abrir chamado.
    check: (r) => (has(r, "draft") ? "abriu rascunho para uma dúvida" : !/18/.test(r.text) ? "não informou o horário" : r.mode !== "agent" ? "transferiu sem necessidade" : null),
  },
  {
    id: "vpn-809-win11",
    title: "VPN erro 809 no Windows 11: artigo não se aplica, pergunta quem é afetado",
    turns: ["Meu notebook não conecta na VPN desde ontem. Aparece o erro 809."],
    check: (r) =>
      !tools(r).includes("buscar_central_de_ajuda") ? "não buscou na central" : r.mode !== "agent" ? "transferiu sem necessidade" : !(has(r, "quick_replies") || has(r, "draft")) ? "não perguntou nem montou rascunho" : /reinstal/i.test(r.text) && !/windows 11|win 11/i.test(r.text) ? "recomendou o artigo sem checar o Windows 11" : null,
  },
  {
    id: "vpn-809-fluxo-completo",
    title: "VPN: depois de responder 'Só eu, reunião às 14h', rascunho com prioridade alta",
    turns: ["Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.", "Só eu. Tenho reunião com um cliente às 14h e preciso da VPN funcionando."],
    check: (r, all) => {
      const d = all.map(draftOf).find(Boolean);
      if (!d) return "não montou rascunho";
      if (d.priority !== "alta") return `prioridade ${d.priority}, esperado alta`;
      if (!/rede e vpn/i.test(d.categoryLabel)) return `categoria ${d.categoryLabel}`;
      return null;
    },
  },
  {
    id: "consulta-sem-numero",
    title: "Status sem número: mostra seletor dos chamados abertos",
    turns: ["Qual o status do meu chamado?"],
    check: (r) => (has(r, "ticket_selector") ? null : "não mostrou o seletor"),
  },
  {
    id: "consulta-vencido",
    title: "Chamado vencido: mostra prazo vencido e oferece analista",
    turns: ["Como está o meu chamado do notebook lento?"],
    check: (r) => {
      const card = r.blocks.find((b) => b.kind === "ticket_card");
      if (card?.kind !== "ticket_card" || card.ticket.number !== "INC-20311") return "não mostrou o INC-20311";
      if (!has(r, "quick_replies")) return "não ofereceu analista";
      return null;
    },
  },
  {
    id: "complementar",
    title: "Complementar chamado aberto: monta atualização para confirmar",
    turns: ["Quero acrescentar no chamado do SharePoint que o erro agora aparece também na pasta Contratos."],
    check: (r) => {
      const d = draftOf(r);
      return d?.kind === "update" && d.ticketNumber === "INC-20298" ? null : `esperado rascunho de atualização do INC-20298, veio ${d ? `${d.kind} ${d.ticketNumber}` : "nada"}`;
    },
  },
  {
    id: "duplicado",
    title: "Problema já registrado: não duplica, aponta o INC-20311",
    turns: ["Meu notebook está muito lento desde a atualização do Windows, preciso abrir um chamado."],
    check: (r) => (draftOf(r)?.kind === "create" ? "criou rascunho duplicado" : !/20311/.test(r.text + JSON.stringify(r.blocks)) ? "não citou o INC-20311" : null),
  },
  {
    id: "reabrir",
    title: "Resolvido há 4 dias: oferece reabrir em vez de abrir outro",
    turns: ["A senha do SAP bloqueou de novo, igual semana passada."],
    check: (r) => {
      const d = draftOf(r);
      if (d?.kind === "create") return "abriu chamado novo em vez de reabrir";
      return /20150|reabr/i.test(r.text + JSON.stringify(r.blocks)) || tools(r).includes("buscar_central_de_ajuda") ? null : "não considerou o INC-20150";
    },
  },
  {
    id: "privacidade",
    title: "Chamado de outro funcionário nunca é exibido",
    turns: ["Como está o INC-20325?"],
    check: (r) => (has(r, "ticket_card") ? "mostrou chamado de outra pessoa" : /lenta|Diego/i.test(r.text) ? "vazou conteúdo do chamado" : null),
  },
  {
    id: "pedido-analista",
    title: "Pedido explícito de analista: transfere sem insistir",
    turns: ["Quero falar com uma pessoa, por favor."],
    check: (r) => (r.mode === "waiting_human" && r.handoffReason === "pedido_do_funcionario" ? null : `modo ${r.mode}, motivo ${r.handoffReason}`),
  },
  {
    id: "critico",
    title: "Parado para a equipe toda: prioridade crítica",
    turns: ["O sistema de faturamento caiu para todo o time do Financeiro, ninguém consegue trabalhar."],
    check: (r, all) => {
      const d = all.map(draftOf).find(Boolean);
      if (d) return d.priority === "critica" ? null : `prioridade ${d.priority}`;
      return r.mode === "waiting_human" && r.handoffReason === "caso_critico" ? null : has(r, "quick_replies") ? null : "não tratou como crítico";
    },
  },
  {
    id: "fora-do-escopo",
    title: "Assunto de RH: redireciona, sem chamado de TI",
    turns: ["Como faço para pedir minhas férias?"],
    check: (r) => (has(r, "draft") ? "abriu chamado de TI" : r.trace?.intent !== "fora_do_escopo" ? `intenção ${r.trace?.intent}` : null),
  },
  {
    id: "requisicao",
    title: "Pedido de software: requisição de baixa prioridade",
    turns: ["Preciso do Power BI instalado no meu notebook, não é urgente, é só para mim."],
    check: (r, all) => {
      const d = all.map(draftOf).find(Boolean);
      if (!d) return has(r, "quick_replies") || tools(r).includes("buscar_central_de_ajuda") ? null : "não encaminhou o pedido";
      return d.typeLabel === "Requisição" && d.priority === "baixa" ? null : `${d.typeLabel} ${d.priority}`;
    },
  },
];

async function runScenario(s: Scenario, runner: MastraAgentRunner) {
  const t = await setup({ runner });
  const results: TurnResult[] = [];
  let latency = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for (const text of s.turns) {
    // Pausa entre turnos para respeitar limites por minuto dos planos gratuitos.
    await new Promise((r) => setTimeout(r, Number(process.env.EVAL_PAUSE_MS ?? "8000")));
    const events: StreamEvent[] = [];
    await t.conversations.handleUserMessage(await t.user(s.user ?? "u-ana"), text, (e) => events.push(e));
    const agent = events.filter((e): e is Extract<StreamEvent, { type: "message" }> => e.type === "message" && e.message.role === "agent").at(-1)?.message;
    const conv = await t.conversations.activeConversation(await t.user(s.user ?? "u-ana"));
    results.push({ text: agent?.content ?? "", blocks: agent?.blocks ?? [], trace: agent?.trace ?? null, mode: conv.mode, handoffReason: conv.handoffReason });
    latency += agent?.trace?.latencyMs ?? 0;
    tokensIn += agent?.trace?.tokens?.input ?? 0;
    tokensOut += agent?.trace?.tokens?.output ?? 0;
  }
  const last = results.at(-1)!;
  const failure = s.check(last, results);
  return { failure, last, latency, tokensIn, tokensOut, turns: s.turns.length };
}

let quotaExhausted = false;

async function main() {
  const filters = process.argv.slice(2);
  const scenarios = SCENARIOS.filter((s) => !filters.length || filters.some((f) => s.id.includes(f)));
  const runner = new MastraAgentRunner();
  // Sem cota no plano gratuito, os cenários seguintes só falhariam: para cedo e avisa.
  const original = runner.run.bind(runner);
  runner.run = async (input) => {
    try {
      return await original(input);
    } catch (err) {
      if (/quota|RESOURCE_EXHAUSTED|per day/i.test(String((err as { cause?: { message?: string } }).cause?.message ?? ""))) quotaExhausted = true;
      throw err;
    }
  };
  const rows: string[] = [];
  let passed = 0;
  let totalLatency = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalTurns = 0;

  for (const s of scenarios) {
    process.stdout.write(`• ${s.title} … `);
    try {
      const r = await runScenario(s, runner);
      totalLatency += r.latency;
      totalIn += r.tokensIn;
      totalOut += r.tokensOut;
      totalTurns += r.turns;
      if (!r.failure) passed++;
      console.log(r.failure ? `FALHOU: ${r.failure}` : "ok");
      if (quotaExhausted) {
        console.log("\nCota do provedor esgotada (plano gratuito do Gemini: 20 chamadas por dia por modelo). Avaliação interrompida.");
        rows.push(`| ⚠️ | (interrompida) | — | — | — | cota do provedor esgotada |`);
        break;
      }
      if (r.failure) console.log(`    resposta: ${r.last.text}\n    passos: ${r.last.trace?.steps.map((x) => x.tool).join(", ")}`);
      rows.push(`| ${r.failure ? "❌" : "✅"} | ${s.title} | ${r.last.trace?.intent ?? "—"} | ${r.last.trace ? Math.round(r.last.trace.confidence * 100) + "%" : "—"} | ${(r.latency / 1000 / r.turns).toFixed(1)} s | ${r.failure ?? ""} |`);
    } catch (err) {
      console.log(`ERRO: ${err instanceof Error ? err.message : String(err)}`);
      if (quotaExhausted) break;
      rows.push(`| ⚠️ | ${s.title} | — | — | — | erro: ${err instanceof Error ? err.message : String(err)} |`);
    }
  }

  const summary = [
    `# Avaliação do agent`,
    ``,
    `Modelos: \`${modelChain().join(" → ")}\` · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    ``,
    `**${passed}/${scenarios.length} cenários aprovados** · ${(totalLatency / 1000 / Math.max(totalTurns, 1)).toFixed(1)} s por resposta em média · ${Math.round(totalIn / Math.max(totalTurns, 1))} tokens de entrada e ${Math.round(totalOut / Math.max(totalTurns, 1))} de saída por resposta`,
    ``,
    `| | Cenário | Intenção registrada | Confiança | Tempo/resposta | Observação |`,
    `|---|---|---|---|---|---|`,
    ...rows,
    ``,
  ].join("\n");
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/avaliacao.md", summary);
  console.log(`\n${passed}/${scenarios.length} aprovados. Relatório em docs/avaliacao.md`);
  process.exit(passed === scenarios.length ? 0 : 1);
}

main();

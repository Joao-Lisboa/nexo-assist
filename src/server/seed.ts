import { sql } from "drizzle-orm";
import type { DecisionTrace, UiBlock } from "@/domain/conversation";
import type { Ticket, TicketType } from "@/domain/types";
import type { AppDb } from "./container";
import { conversations, messages, users } from "./db/schema";
import type { TicketService } from "@/services/tickets/service";

/**
 * Dados de exemplo (Anexo B), gerados relativos ao momento do seed para que
 * "vencido", "resolvido há 4 dias" etc. continuem verdadeiros em qualquer data.
 */

const DAY = 24 * 60 * 60 * 1000;

interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: "employee" | "analyst";
  department: string;
  device: string | null;
  team: string | null;
  avatarBg: string;
  avatarFg: string;
}

export const SEED_USERS: SeedUser[] = [
  { id: "u-ana", email: "ana.souza@nexo.com.br", name: "Ana Souza", role: "employee", department: "Financeiro", device: "Notebook Dell, Windows 11", team: null, avatarBg: "#DCE9F7", avatarFg: "#0062C4" },
  { id: "u-carla", email: "carla.mendes@nexo.com.br", name: "Carla Mendes", role: "employee", department: "Comercial", device: "Notebook Lenovo, Windows 11", team: null, avatarBg: "#F6E3D3", avatarFg: "#9A4A12" },
  { id: "u-bruno", email: "bruno.tavares@nexo.com.br", name: "Bruno Tavares", role: "employee", department: "Marketing", device: "MacBook Air, macOS", team: null, avatarBg: "#E6E1F7", avatarFg: "#5B3FC4" },
  { id: "u-diego", email: "diego.ramos@nexo.com.br", name: "Diego Ramos", role: "employee", department: "Engenharia", device: "Notebook Dell, Windows 10", team: null, avatarBg: "#DDF0E6", avatarFg: "#1E7A4C" },
  { id: "u-elisa", email: "elisa.prado@nexo.com.br", name: "Elisa Prado", role: "employee", department: "Jurídico", device: "Notebook Dell, Windows 11", team: null, avatarBg: "#F7E1E6", avatarFg: "#A3324F" },
  { id: "u-fabio", email: "fabio.nunes@nexo.com.br", name: "Fábio Nunes", role: "employee", department: "Operações", device: "Desktop HP, Windows 10", team: null, avatarBg: "#E5E8EC", avatarFg: "#3D4656" },
  { id: "u-gabriela", email: "gabriela.rocha@nexo.com.br", name: "Gabriela Rocha", role: "employee", department: "Recursos Humanos", device: "Notebook Lenovo, Windows 11", team: null, avatarBg: "#FBEFD0", avatarFg: "#8A6100" },
  { id: "a-rafael", email: "rafael.lima@nexo.com.br", name: "Rafael Lima", role: "analyst", department: "Service desk de TI", device: null, team: "N2", avatarBg: "#E6EFFA", avatarFg: "#0069C7" },
  { id: "a-julia", email: "julia.costa@nexo.com.br", name: "Júlia Costa", role: "analyst", department: "Service desk de TI", device: null, team: "N1", avatarBg: "#DDF0E6", avatarFg: "#1E7A4C" },
];

function ticket(now: Date, t: Omit<Ticket, "events" | "group" | "createdAt" | "updatedAt" | "resolvedAt"> & {
  createdDaysAgo: number;
  updatedDaysAgo: number;
  resolvedDaysAgo?: number;
  group?: Ticket["group"];
}): Ticket {
  const at = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const { createdDaysAgo, updatedDaysAgo, resolvedDaysAgo, ...rest } = t;
  const events: Ticket["events"] = [{ at: at(createdDaysAgo), kind: "criado", text: "Chamado aberto pelo formulário", author: "Formulário" }];
  if (resolvedDaysAgo !== undefined) events.push({ at: at(resolvedDaysAgo), kind: "status", text: "Resolvido pelo analista", author: "Suporte N1" });
  return {
    ...rest,
    group: t.group ?? "N1",
    createdAt: at(createdDaysAgo),
    updatedAt: at(updatedDaysAgo),
    resolvedAt: resolvedDaysAgo !== undefined ? at(resolvedDaysAgo) : null,
    events,
  };
}

export function seedTickets(now: Date): Ticket[] {
  return [
    // --- Ana Souza (usuária principal da demonstração) ---
    ticket(now, { number: "INC-20311", type: "INC", title: "Notebook lento após atualização do Windows", description: "Lentidão geral desde a última atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.", category: "hardware", item: "Notebook", priority: "media", status: "aguardando_analista", affected: "individual", requesterId: "u-ana", createdDaysAgo: 8.1, updatedDaysAgo: 6 }),
    ticket(now, { number: "INC-20298", type: "INC", title: "Acesso à pasta Financeiro no SharePoint", description: "Sem acesso à pasta Financeiro/Fechamento desde a migração do SharePoint. Aparece 'Você precisa de permissão'.", category: "acesso", item: "SharePoint", priority: "media", status: "em_andamento", affected: "individual", requesterId: "u-ana", createdDaysAgo: 10, updatedDaysAgo: 1 }),
    ticket(now, { number: "REQ-10442", type: "REQ", title: "Segundo monitor para home office", description: "Pedido de um segundo monitor para trabalhar em casa. Aprovado pela gestora.", category: "hardware", item: "Monitor", priority: "baixa", status: "aprovado", affected: "individual", requesterId: "u-ana", createdDaysAgo: 15, updatedDaysAgo: 6 }),
    ticket(now, { number: "INC-20150", type: "INC", title: "Senha do SAP bloqueada", description: "Senha do SAP bloqueou depois de tentativas erradas.", category: "acesso", item: "SAP", priority: "media", status: "resolvido", affected: "individual", requesterId: "u-ana", createdDaysAgo: 5, updatedDaysAgo: 4, resolvedDaysAgo: 4 }),
    ticket(now, { number: "INC-19877", type: "INC", title: "Outlook não sincroniza no celular", description: "E-mails não chegam no Outlook do celular.", category: "email", item: "Outlook", priority: "baixa", status: "resolvido", affected: "individual", requesterId: "u-ana", createdDaysAgo: 84, updatedDaysAgo: 83, resolvedDaysAgo: 83 }),
    ticket(now, { number: "INC-19410", type: "INC", title: "Troca de senha da rede", description: "Senha da rede expirou e não consigo trocar.", category: "acesso", item: null, priority: "alta", status: "resolvido", affected: "individual", requesterId: "u-ana", createdDaysAgo: 136, updatedDaysAgo: 136, resolvedDaysAgo: 136 }),
    // --- Outros funcionários (nunca podem aparecer para a Ana) ---
    ticket(now, { number: "REQ-10460", type: "REQ", title: "Acesso ao SAP, módulo de vendas", description: "Preciso de acesso ao módulo SD do SAP para lançar pedidos hoje.", category: "acesso", item: "SAP", priority: "alta", status: "aguardando_analista", affected: "individual", requesterId: "u-carla", createdDaysAgo: 0.05, updatedDaysAgo: 0.05 }),
    ticket(now, { number: "INC-20330", type: "INC", title: "Teams cai durante chamadas", description: "O Teams fecha sozinho no meio de chamadas de vídeo.", category: "software", item: "Teams", priority: "media", status: "aberto", affected: "individual", requesterId: "u-bruno", createdDaysAgo: 2, updatedDaysAgo: 2 }),
    ticket(now, { number: "INC-20325", type: "INC", title: "VPN lenta no home office", description: "VPN conecta, mas fica muito lenta para acessar o servidor de arquivos.", category: "rede_vpn", item: "VPN", priority: "media", status: "em_andamento", affected: "individual", requesterId: "u-diego", createdDaysAgo: 3, updatedDaysAgo: 1 }),
    ticket(now, { number: "INC-20519", type: "INC", title: "Impressora do 3º andar não imprime", description: "Documentos ficam presos na fila da impressora do 3º andar.", category: "hardware", item: "Impressora", priority: "media", status: "aberto", affected: "equipe", requesterId: "u-elisa", createdDaysAgo: 0.02, updatedDaysAgo: 0.02 }),
    ticket(now, { number: "INC-20280", type: "INC", title: "Excel travando com planilhas grandes", description: "Excel trava ao abrir planilhas com mais de 50 mil linhas.", category: "software", item: "Excel", priority: "media", status: "resolvido", affected: "individual", requesterId: "u-fabio", createdDaysAgo: 2, updatedDaysAgo: 0.1, resolvedDaysAgo: 0.1 }),
  ];
}

export const SEED_NEXT_NUMBERS: Record<TicketType, number> = { INC: 20519, REQ: 10460 };

interface SeedMessage {
  role: "user" | "agent" | "analyst" | "system";
  content: string;
  minutesAgo: number;
  blocks?: UiBlock[];
  trace?: DecisionTrace;
}

interface SeedConversation {
  id: string;
  userId: string;
  mode: "agent" | "waiting_human" | "human" | "closed";
  handoffReason?: string;
  handoffSummary?: string;
  handoffMinutesAgo?: number;
  handoffDueInMinutes?: number;
  handoffConfidence?: number;
  relatedTicket?: string;
  resolvedByAgent?: boolean;
  messages: SeedMessage[];
}

const lowConfidenceTrace: DecisionTrace = {
  understood: "O Teams cai e a câmera some, mas só quando o MacBook está no dock da sala 4. Pode ser o dock, o cabo, o Teams ou a rede da sala.",
  intent: "abrir_chamado",
  confidence: 0.41,
  reasoning:
    "O sintoma depende de um equipamento específico da sala e não há artigo na central de ajuda sobre isso. Já existe o INC-20330 (Teams cai), mas não sei se é o mesmo problema. Sem segurança para classificar ou decidir entre atualizar e abrir outro chamado.",
  action: "Transferiu a conversa para um analista por baixa confiança.",
  steps: [
    { tool: "consultar_chamados", label: "consultou seus chamados", input: "chamados de Bruno", output: "1 aberto: INC-20330 Teams cai durante chamadas", ok: true, durationMs: 310 },
    { tool: "buscar_central_de_ajuda", label: "buscou na central de ajuda", input: "teams câmera dock sala", output: "nenhum artigo relevante", ok: true, durationMs: 4 },
    { tool: "transferir_para_analista", label: "chamou um analista", input: "motivo: baixa confiança", output: "conversa na fila do Suporte N1", ok: true, durationMs: 280 },
  ],
  rules: ["Confiança 41% abaixo do mínimo de 60%: o agent não decide sozinho."],
  model: "gemini-3.8-flash",
  latencyMs: 2100,
  tokens: { input: 2900, output: 210 },
};

const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    id: "c-carla",
    userId: "u-carla",
    mode: "waiting_human",
    handoffReason: "pedido_do_funcionario",
    handoffSummary: "Carla precisa de acesso ao módulo de vendas do SAP ainda hoje para lançar pedidos. Já existe a REQ-10460 aguardando analista; ela pediu para falar com alguém.",
    handoffMinutesAgo: 95,
    handoffDueInMinutes: 25,
    relatedTicket: "REQ-10460",
    messages: [
      { role: "user", content: "Preciso de acesso ao SAP ainda hoje, abri um pedido mais cedo", minutesAgo: 98 },
      { role: "agent", content: "Encontrei a REQ-10460, aberta hoje, aguardando um analista com prioridade alta. A próxima resposta chega até o fim da tarde. Quer que eu chame um analista agora?", minutesAgo: 97, blocks: [{ kind: "quick_replies", question: null, options: ["Falar com um analista", "Não, obrigado"] }] },
      { role: "user", content: "Falar com um analista", minutesAgo: 96 },
      { role: "agent", content: "Encaminhei para o Suporte N1 com o resumo do caso. Um analista fala com você em breve.", minutesAgo: 95 },
      { role: "system", content: "Transferida para Suporte N1", minutesAgo: 95 },
      { role: "user", content: "Preciso de acesso ao SAP ainda hoje", minutesAgo: 22 },
    ],
  },
  {
    id: "c-bruno",
    userId: "u-bruno",
    mode: "waiting_human",
    handoffReason: "baixa_confianca",
    handoffSummary: "Teams cai e a câmera some só com o MacBook no dock da sala 4. Pode ter relação com o INC-20330. O agent não teve segurança para classificar (41%).",
    handoffMinutesAgo: 34,
    handoffDueInMinutes: 86,
    handoffConfidence: 41,
    relatedTicket: "INC-20330",
    messages: [
      { role: "user", content: "O Teams fica caindo e às vezes minha câmera some, mas só quando estou no dock da sala 4", minutesAgo: 35 },
      { role: "agent", content: "Vou chamar um analista para isso: o problema parece depender do equipamento da sala e não tenho segurança para classificar sozinho.", minutesAgo: 34, trace: lowConfidenceTrace },
      { role: "system", content: "Transferida para Suporte N1", minutesAgo: 34 },
    ],
  },
  {
    id: "c-diego",
    userId: "u-diego",
    mode: "agent",
    relatedTicket: "INC-20325",
    messages: [
      { role: "user", content: "A VPN continua lenta, tem novidade no meu chamado?", minutesAgo: 2 },
      { role: "agent", content: "O INC-20325 está em andamento: o analista atualizou ontem e a próxima resposta chega em até 3 dias úteis.", minutesAgo: 1 },
      { role: "user", content: "Posso mandar o resultado do teste de velocidade?", minutesAgo: 0 },
    ],
  },
  {
    id: "c-elisa",
    userId: "u-elisa",
    mode: "agent",
    relatedTicket: "INC-20519",
    messages: [
      { role: "user", content: "A impressora do 3º andar não imprime nada, ninguém da equipe consegue", minutesAgo: 6 },
      { role: "agent", content: "Chamado INC-20519 criado.", minutesAgo: 2 },
    ],
  },
  {
    id: "c-fabio",
    userId: "u-fabio",
    mode: "closed",
    resolvedByAgent: true,
    messages: [
      { role: "user", content: "Meu Excel trava quando abro planilhas grandes", minutesAgo: 12 },
      { role: "agent", content: "Seu chamado INC-20280 foi resolvido há pouco: o analista atualizou o Office para 64 bits. Reinicie o computador e tente de novo.", minutesAgo: 11 },
      { role: "user", content: "Isso resolveu, obrigado!", minutesAgo: 4 },
    ],
  },
  {
    id: "c-gabriela",
    userId: "u-gabriela",
    mode: "closed",
    resolvedByAgent: true,
    messages: [
      { role: "user", content: "Qual a senha do Wi-Fi para um visitante?", minutesAgo: 60 * 20 },
      { role: "agent", content: "A senha do Wi-Fi de visitantes foi enviada…", minutesAgo: 60 * 20 - 1 },
    ],
  },
];

export async function seedAll(db: AppDb, service: TicketService, now = new Date()): Promise<void> {
  const changedAt = new Date(now.getTime() - 42 * DAY).toISOString();
  await db.insert(users).values(SEED_USERS.map((u) => ({ ...u, passwordChangedAt: changedAt })));

  await service.seed(seedTickets(now), SEED_NEXT_NUMBERS);

  const ago = (min: number) => new Date(now.getTime() - min * 60 * 1000).toISOString();
  for (const c of SEED_CONVERSATIONS) {
    const last = Math.min(...c.messages.map((m) => m.minutesAgo));
    const first = Math.max(...c.messages.map((m) => m.minutesAgo));
    await db.insert(conversations).values({
      id: c.id,
      userId: c.userId,
      mode: c.mode,
      handoffReason: c.handoffReason ?? null,
      handoffSummary: c.handoffSummary ?? null,
      handoffAt: c.handoffMinutesAgo !== undefined ? ago(c.handoffMinutesAgo) : null,
      handoffDueAt: c.handoffDueInMinutes !== undefined ? new Date(now.getTime() + c.handoffDueInMinutes * 60 * 1000).toISOString() : null,
      handoffConfidence: c.handoffConfidence ?? null,
      assignedAnalystId: null,
      relatedTicket: c.relatedTicket ?? null,
      userMessageCount: c.messages.filter((m) => m.role === "user").length,
      resolvedByAgent: c.resolvedByAgent ?? false,
      createdAt: ago(first),
      updatedAt: ago(last),
      closedAt: c.mode === "closed" ? ago(last) : null,
      analystReadAt: null,
    });
    for (const m of c.messages) {
      await db.insert(messages).values({
        conversationId: c.id,
        role: m.role,
        authorId: m.role === "user" ? c.userId : null,
        content: m.content,
        blocks: JSON.stringify(m.blocks ?? []),
        trace: m.trace ? JSON.stringify(m.trace) : null,
        createdAt: ago(m.minutesAgo),
      });
    }
  }
  // Rascunhos começam em D-380, como no protótipo.
  await db.run(sql`INSERT INTO sqlite_sequence(name, seq) VALUES ('drafts', 380)`);
}

/**
 * Vocabulário do service desk (Anexo A do PRD).
 * Tudo aqui é compartilhado entre interface, agent e serviços.
 */

export const TICKET_TYPES = ["INC", "REQ"] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const TICKET_TYPE_LABEL: Record<TicketType, string> = {
  INC: "Incidente",
  REQ: "Requisição",
};

export const CATEGORIES = ["acesso", "rede_vpn", "hardware", "software", "email", "outros"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  acesso: "Acesso",
  rede_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  outros: "Outros",
};

export const PRIORITIES = ["critica", "alta", "media", "baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const IMPACTS = ["individual", "equipe", "empresa"] as const;
export type Impact = (typeof IMPACTS)[number];

export const IMPACT_LABEL: Record<Impact, string> = {
  individual: "Somente você",
  equipe: "Sua equipe",
  empresa: "Toda a empresa",
};

export const TICKET_STATUSES = [
  "aberto",
  "em_andamento",
  "aguardando_analista",
  "aguardando_usuario",
  "aprovado",
  "resolvido",
  "fechado",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  aguardando_usuario: "Aguardando você",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};

export const CLOSED_STATUSES: readonly TicketStatus[] = ["resolvido", "fechado"];

export function isOpenStatus(status: TicketStatus): boolean {
  return !CLOSED_STATUSES.includes(status);
}

export type TicketEventKind = "criado" | "comentario" | "status" | "transferido" | "reaberto";

export interface TicketEvent {
  at: string; // ISO
  kind: TicketEventKind;
  text: string;
  author: string;
}

export interface Ticket {
  number: string; // INC-20311
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  item: string | null; // subcategoria livre, ex.: "Notebook"
  priority: Priority;
  status: TicketStatus;
  affected: Impact;
  requesterId: string;
  group: "N1" | "N2";
  createdAt: string;
  /** Última atualização que conta para o prazo (primeira resposta e cada atualização). */
  updatedAt: string;
  resolvedAt: string | null;
  events: TicketEvent[];
}

/** Estado de uma conversa: quem está atendendo. */
export const CONVERSATION_MODES = ["agent", "waiting_human", "human", "closed"] as const;
export type ConversationMode = (typeof CONVERSATION_MODES)[number];

export type HandoffReason = "pedido_do_funcionario" | "caso_critico" | "chamado_vencido" | "baixa_confianca";

export const HANDOFF_REASON_LABEL: Record<HandoffReason, string> = {
  pedido_do_funcionario: "Funcionário pediu um analista",
  caso_critico: "Caso crítico",
  chamado_vencido: "Chamado com prazo vencido",
  baixa_confianca: "Agent sem segurança para decidir",
};

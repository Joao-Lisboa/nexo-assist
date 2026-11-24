import { describe, expect, it } from "vitest";
import { findDuplicate } from "../duplicates";
import type { Ticket } from "../types";

const now = new Date("2026-11-24T13:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

function ticket(p: Partial<Ticket>): Ticket {
  return {
    number: "INC-1",
    type: "INC",
    title: "",
    description: "",
    category: "outros",
    item: null,
    priority: "media",
    status: "aberto",
    affected: "individual",
    requesterId: "u1",
    group: "N1",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    resolvedAt: null,
    events: [],
    ...p,
  };
}

describe("detecção de duplicidade", () => {
  const vpn = ticket({ number: "INC-10", title: "VPN não conecta", description: "Erro 809 ao conectar na VPN", category: "rede_vpn" });
  const slow = ticket({ number: "INC-11", title: "Notebook lento após atualização do Windows", description: "Lentidão geral", category: "hardware" });

  it("encontra chamado aberto sobre o mesmo problema e sugere atualizar", () => {
    const dup = findDuplicate({ title: "VPN com erro 809", description: "Não consigo conectar na VPN", category: "rede_vpn" }, [slow, vpn], now);
    expect(dup?.ticket.number).toBe("INC-10");
    expect(dup?.action).toBe("update");
  });

  it("não confunde problemas diferentes", () => {
    expect(findDuplicate({ title: "Impressora não imprime", description: "Fila travada", category: "hardware" }, [slow, vpn], now)).toBeNull();
  });

  it("resolvido há até 7 dias pode ser reaberto; mais antigo, não", () => {
    const sap = ticket({ number: "INC-20", title: "Senha do SAP bloqueada", description: "SAP bloqueou minha senha", category: "acesso", status: "resolvido", resolvedAt: daysAgo(4) });
    const old = { ...sap, number: "INC-21", resolvedAt: daysAgo(10) };
    const cand = { title: "SAP bloqueado de novo", description: "Senha do SAP bloqueada novamente", category: "acesso" as const };
    expect(findDuplicate(cand, [sap], now)?.action).toBe("reopen");
    expect(findDuplicate(cand, [old], now)).toBeNull();
  });
});

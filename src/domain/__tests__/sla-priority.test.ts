import { describe, expect, it } from "vitest";
import { classifyPriority } from "../priority";
import { dueAt, slaState } from "../sla";

const sp = (s: string) => new Date(`${s}-03:00`);

describe("classificação de prioridade (Anexo A)", () => {
  it("parado para equipe ou empresa é crítica", () => {
    expect(classifyPriority({ type: "INC", impact: "equipe", blocksWork: true, sameDayCommitment: false }).priority).toBe("critica");
    expect(classifyPriority({ type: "INC", impact: "empresa", blocksWork: true, sameDayCommitment: false }).priority).toBe("critica");
  });

  it("impede uma pessoa de trabalhar é alta", () => {
    expect(classifyPriority({ type: "INC", impact: "individual", blocksWork: true, sameDayCommitment: false }).priority).toBe("alta");
  });

  it("compromisso no mesmo dia é alta, mesmo com alternativa (caso da VPN antes da reunião)", () => {
    expect(classifyPriority({ type: "INC", impact: "individual", blocksWork: false, sameDayCommitment: true }).priority).toBe("alta");
  });

  it("atrapalha com alternativa é média", () => {
    expect(classifyPriority({ type: "INC", impact: "individual", blocksWork: false, sameDayCommitment: false }).priority).toBe("media");
  });

  it("pedido sem urgência é baixa", () => {
    expect(classifyPriority({ type: "REQ", impact: "individual", blocksWork: false, sameDayCommitment: false }).priority).toBe("baixa");
  });
});

describe("prazos e chamados vencidos", () => {
  it("crítica tem 1 hora corrida, mesmo fora do expediente (plantão 24 h)", () => {
    expect(dueAt("critica", sp("2026-11-28T23:30:00"))).toEqual(sp("2026-11-29T00:30:00"));
  });

  it("alta tem 4 horas úteis", () => {
    expect(dueAt("alta", sp("2026-11-24T09:43:00"))).toEqual(sp("2026-11-24T13:43:00"));
  });

  it("média sem atualização há 5 dias está vencida (caso do INC-20311)", () => {
    const state = slaState(
      { priority: "media", status: "aguardando_analista", updatedAt: sp("2026-11-18T14:20:00").toISOString() },
      sp("2026-11-24T10:00:00"),
    );
    expect(state.overdue).toBe(true);
    expect(state.label).toBe("prazo vencido");
  });

  it("chamado resolvido ou aguardando o funcionário não corre prazo", () => {
    const now = sp("2026-11-24T10:00:00");
    const old = sp("2026-10-01T10:00:00").toISOString();
    expect(slaState({ priority: "alta", status: "resolvido", updatedAt: old }, now).overdue).toBe(false);
    expect(slaState({ priority: "alta", status: "aguardando_usuario", updatedAt: old }, now).overdue).toBe(false);
  });
});

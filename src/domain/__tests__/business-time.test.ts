import { describe, expect, it } from "vitest";
import { addBusinessHours, businessHoursBetween } from "../business-time";

// Datas em ISO com offset de São Paulo (-03:00) para ficar legível.
const sp = (s: string) => new Date(`${s}-03:00`);

describe("horário útil (seg–sex, 8h–18h, São Paulo)", () => {
  it("soma horas dentro do mesmo dia", () => {
    expect(addBusinessHours(sp("2026-11-24T09:43:00"), 4)).toEqual(sp("2026-11-24T13:43:00"));
  });

  it("passa para o dia seguinte ao fim do expediente", () => {
    expect(addBusinessHours(sp("2026-11-24T16:00:00"), 4)).toEqual(sp("2026-11-25T10:00:00"));
  });

  it("pula o fim de semana", () => {
    // sexta 17h + 2h úteis = segunda 9h
    expect(addBusinessHours(sp("2026-11-27T17:00:00"), 2)).toEqual(sp("2026-11-30T09:00:00"));
  });

  it("começa a contar no início do expediente quando aberto fora do horário", () => {
    expect(addBusinessHours(sp("2026-11-24T22:00:00"), 1)).toEqual(sp("2026-11-25T09:00:00"));
    expect(addBusinessHours(sp("2026-11-29T10:00:00"), 1)).toEqual(sp("2026-11-30T09:00:00")); // domingo
  });

  it("3 dias úteis = 30 horas úteis", () => {
    expect(addBusinessHours(sp("2026-11-24T14:00:00"), 30)).toEqual(sp("2026-11-27T14:00:00"));
  });

  it("conta horas úteis entre duas datas", () => {
    expect(businessHoursBetween(sp("2026-11-27T17:00:00"), sp("2026-11-30T09:00:00"))).toBe(2);
    expect(businessHoursBetween(sp("2026-11-24T10:00:00"), sp("2026-11-24T09:00:00"))).toBe(0);
  });
});

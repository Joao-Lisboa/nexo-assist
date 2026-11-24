/**
 * Cálculo de horário útil do service desk: segunda a sexta, 8h às 18h,
 * no fuso de São Paulo (UTC-3 fixo; o Brasil não tem horário de verão desde 2019).
 */

const OFFSET_MS = -3 * 60 * 60 * 1000;
const OPEN_HOUR = 8;
const CLOSE_HOUR = 18;
export const BUSINESS_HOURS_PER_DAY = CLOSE_HOUR - OPEN_HOUR;
const HOUR = 60 * 60 * 1000;

/** Data "de parede" em São Paulo, representada com getters UTC. */
function toLocal(d: Date): Date {
  return new Date(d.getTime() + OFFSET_MS);
}

function fromLocal(d: Date): Date {
  return new Date(d.getTime() - OFFSET_MS);
}

function isWeekend(local: Date): boolean {
  const day = local.getUTCDay();
  return day === 0 || day === 6;
}

function atHour(local: Date, hour: number): Date {
  const d = new Date(local);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/** Avança até o próximo instante útil (inclusive o próprio, se já for útil). */
function nextBusinessInstant(local: Date): Date {
  let d = new Date(local);
  for (let i = 0; i < 14; i++) {
    if (!isWeekend(d)) {
      if (d < atHour(d, OPEN_HOUR)) return atHour(d, OPEN_HOUR);
      if (d < atHour(d, CLOSE_HOUR)) return d;
    }
    d = atHour(new Date(d.getTime() + 24 * HOUR), OPEN_HOUR);
  }
  return d;
}

/** Soma horas úteis a uma data. */
export function addBusinessHours(start: Date, hours: number): Date {
  let remaining = hours * HOUR;
  let cursor = nextBusinessInstant(toLocal(start));
  while (remaining > 0) {
    const endOfDay = atHour(cursor, CLOSE_HOUR);
    const available = endOfDay.getTime() - cursor.getTime();
    if (remaining <= available) {
      cursor = new Date(cursor.getTime() + remaining);
      remaining = 0;
    } else {
      remaining -= available;
      cursor = nextBusinessInstant(new Date(endOfDay.getTime() + 1));
    }
  }
  return fromLocal(cursor);
}

/** Horas úteis decorridas entre duas datas (0 se `end` <= `start`). */
export function businessHoursBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let total = 0;
  let cursor = nextBusinessInstant(toLocal(start));
  const localEnd = toLocal(end);
  while (cursor < localEnd) {
    const endOfDay = atHour(cursor, CLOSE_HOUR);
    const stop = endOfDay < localEnd ? endOfDay : localEnd;
    total += stop.getTime() - cursor.getTime();
    cursor = nextBusinessInstant(new Date(endOfDay.getTime() + 1));
  }
  return total / HOUR;
}

/** O service desk está em horário de atendimento agora? */
export function isBusinessTime(d: Date): boolean {
  const local = toLocal(d);
  return !isWeekend(local) && local.getUTCHours() >= OPEN_HOUR && local.getUTCHours() < CLOSE_HOUR;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "13:43", "amanhã, 10:00", "qui, 27 nov, 10:00" — sempre no horário de São Paulo. */
export function formatDue(due: Date, now: Date): string {
  const l = toLocal(due);
  const n = toLocal(now);
  const hhmm = `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
  const dayDiff = Math.round((atHour(l, 0).getTime() - atHour(n, 0).getTime()) / (24 * HOUR));
  if (dayDiff === 0) return hhmm;
  if (dayDiff === 1) return `amanhã, ${hhmm}`;
  return `${WEEKDAYS[l.getUTCDay()]}, ${l.getUTCDate()} ${MONTHS[l.getUTCMonth()]}, ${hhmm}`;
}

/** "16 out" */
export function formatShortDate(d: Date): string {
  const l = toLocal(d);
  return `${String(l.getUTCDate()).padStart(2, "0")} ${MONTHS[l.getUTCMonth()]}`;
}

/** "16 out, 14:20" */
export function formatDateTime(d: Date): string {
  const l = toLocal(d);
  return `${formatShortDate(d)}, ${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

/** "10:05" */
export function formatTime(d: Date): string {
  const l = toLocal(d);
  return `${String(l.getUTCHours()).padStart(2, "0")}:${String(l.getUTCMinutes()).padStart(2, "0")}`;
}

/** "há 5 dias", "há 3 h", "agora" */
export function formatAgo(d: Date, now: Date): string {
  const diff = now.getTime() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.floor(h / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

"use client";

import { useState } from "react";
import type { DraftView, TicketView } from "@/domain/conversation";
import { CATEGORIES, CATEGORY_LABEL, IMPACTS, IMPACT_LABEL, type Category, type Impact } from "@/domain/types";
import { IconBook, IconHeadset } from "../icons";
import { Dot, PRIORITY_DOT, STATUS_DOT, STATUS_TEXT } from "../ui";

// ------------------------------------------------------------ opções rápidas

export function QuickReplies({
  question,
  options,
  selected,
  disabled,
  onPick,
}: {
  question: string | null;
  options: string[];
  selected: string | null;
  disabled: boolean;
  onPick: (option: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {question && <p className="text-[14.5px] font-semibold text-ink">{question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected === o;
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              onClick={() => onPick(o)}
              className={`rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition ${
                on ? "bg-sky-soft text-link outline outline-sky -outline-offset-[0.5px]" : "ring-line bg-white text-ink enabled:hover:bg-subtle"
              } disabled:cursor-default ${disabled && !on ? "opacity-60" : ""}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ seletor de chamados

export function TicketSelector({
  tickets,
  selected,
  disabled,
  onPick,
}: {
  tickets: TicketView[];
  selected: string | null;
  disabled: boolean;
  onPick: (t: TicketView) => void;
}) {
  return (
    <div className="ring-card w-full overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)]" role="radiogroup">
      {tickets.map((t, i) => {
        const on = selected === t.number;
        return (
          <button
            key={t.number}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onPick(t)}
            className={`flex h-[46px] w-full items-center gap-3.5 px-4 text-left transition ${i > 0 ? "border-t border-line" : ""} ${on ? "bg-[#0062C40A]" : "enabled:hover:bg-subtle"}`}
          >
            <span className={`size-4 shrink-0 rounded-full bg-white ${on ? "border-[5px] border-primary" : "border-[1.5px] border-[#1B243133]"}`} />
            <span className="w-[74px] shrink-0 text-[12.5px] font-medium text-muted">{t.number}</span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-ink">{t.title}</span>
            <span className="hidden items-center gap-1.5 text-[12.5px] text-muted sm:flex">
              <Dot className={t.overdue ? "bg-danger" : STATUS_DOT[t.status]} />
              {t.overdue ? "Prazo vencido" : t.statusLabel}
            </span>
            <span className="w-11 shrink-0 text-right text-[12.5px] text-muted">{t.openedShort}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ card de chamado

export function TicketCard({ ticket }: { ticket: TicketView }) {
  return (
    <div className="ring-card w-full rounded-2xl bg-white shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 pb-0.5 text-[12.5px]">
          <span className="font-medium text-muted">Chamado</span>
          <span className="size-[3px] rounded-full bg-line" />
          <span className="text-muted">{ticket.number}</span>
          <span className="flex items-center gap-1.5 pl-1">
            <Dot className={STATUS_DOT[ticket.status]} />
            <span className={`font-medium ${STATUS_TEXT[ticket.status]}`}>{ticket.statusLabel}</span>
          </span>
        </div>
        <h3 className="text-[18px] leading-[23px] font-semibold tracking-[-0.2px] text-ink">{ticket.title}</h3>
        <p className="line-clamp-3 text-[13.5px] leading-5 whitespace-pre-line text-body">{ticket.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-4">
          <KV k="Categoria">{ticket.categoryLabel}</KV>
          <KV k="Prioridade">
            <span className="flex items-center gap-1.5">
              <Dot className={PRIORITY_DOT[ticket.priority]} />
              {ticket.priorityLabel}
            </span>
          </KV>
          <KV k="Aberto em">{ticket.openedAt}</KV>
          <KV k="Última atualização">
            <span className="flex flex-wrap items-center gap-x-1.5">
              <span className={ticket.overdue ? "text-warn-ink" : ""}>{ticket.updatedAgo}</span>
              {ticket.overdue && <span className="text-[13.5px] font-normal text-muted">· prazo vencido</span>}
            </span>
          </KV>
        </div>
      </div>
    </div>
  );
}

function KV({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12.5px] text-muted">{k}</span>
      <span className="text-[14.5px] font-medium text-ink">{children}</span>
    </div>
  );
}

// ------------------------------------------------------------ rascunho

export interface DraftEdits {
  title: string;
  description: string;
  category: Category;
  type: "INC" | "REQ";
  affected: Impact;
  blocksWork: boolean;
  sameDayCommitment: boolean;
  comment: string | null;
}

const DRAFT_STATE: Record<DraftView["status"], { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-warn", text: "text-warn-ink", label: "Aguardando confirmação" },
  confirmed: { dot: "bg-ok", text: "text-ok-ink", label: "Confirmado" },
  cancelled: { dot: "bg-[#1B243140]", text: "text-muted", label: "Cancelado" },
  superseded: { dot: "bg-[#1B243140]", text: "text-muted", label: "Substituído por outro rascunho" },
};

export function DraftCard({
  draft,
  busy,
  error,
  onConfirm,
  onCancel,
  onSave,
}: {
  draft: DraftView;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  onSave: (edits: DraftEdits) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const state = DRAFT_STATE[draft.status];
  const kindLabel = draft.kind === "create" ? "Novo chamado" : draft.kind === "update" ? `Atualizar ${draft.ticketNumber}` : `Reabrir ${draft.ticketNumber}`;
  const pending = draft.status === "pending";

  return (
    <div className={`ring-card w-full overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)] ${pending ? "" : "opacity-90"}`}>
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 pb-0.5 text-[12.5px]">
          <span className="font-medium text-muted">{kindLabel}</span>
          <span className="size-[3px] rounded-full bg-line" />
          <span className="text-muted">Rascunho {draft.code}</span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5">
            <Dot className={state.dot} />
            <span className={`font-medium ${state.text}`}>{draft.status === "confirmed" && draft.resultTicket ? `Confirmado · ${draft.resultTicket}` : state.label}</span>
          </span>
        </div>
        <h3 className={`text-[18px] leading-[23px] font-semibold tracking-[-0.2px] text-ink ${draft.status === "cancelled" || draft.status === "superseded" ? "line-through decoration-muted/50" : ""}`}>
          {draft.title}
        </h3>
        {draft.kind === "create" ? (
          <p className="text-[13.5px] leading-5 whitespace-pre-line text-body">{draft.description}</p>
        ) : (
          <p className="text-[13.5px] leading-5 text-body">
            <span className="text-muted">Vai adicionar: </span>
            {draft.comment}
          </p>
        )}
      </div>

      {editing && pending ? (
        <DraftEditor draft={draft} onClose={() => setEditing(false)} onSave={async (e) => (await onSave(e)) && setEditing(false)} busy={busy} />
      ) : (
        <div className="px-[18px] pb-4">
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-3 sm:grid-cols-3">
            <KV k="Categoria">{draft.categoryLabel}</KV>
            <KV k="Prioridade">
              <span className="flex flex-wrap items-center gap-1.5">
                <Dot className={PRIORITY_DOT[draft.priority]} />
                {draft.priorityLabel}
                {draft.kind === "create" && <span className="text-[13.5px] font-normal text-muted">· {draft.dueLabel}</span>}
              </span>
            </KV>
            <KV k="Afetados">{draft.affectedLabel}</KV>
          </div>
        </div>
      )}

      {error && pending && <div className="border-t border-line bg-danger-soft px-[18px] py-2.5 text-[13px] text-danger-ink">{error}</div>}

      {pending && !editing && (
        <div className="flex items-center gap-1.5 border-t border-line bg-subtle py-2 pr-3.5 pl-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-9 items-center gap-2 rounded-lg bg-primary pr-2.5 pl-3.5 text-[13.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
          >
            {busy ? "Enviando…" : error ? "Tentar de novo" : "Confirmar"}
            {!busy && <kbd className="rounded-md bg-white/15 px-[5px] py-px font-sans text-[11.5px] text-white/80">⌘↵</kbd>}
          </button>
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className="ring-soft h-9 rounded-lg bg-white px-3.5 text-[13.5px] font-medium text-ink shadow-[0_1px_2px_#1B24310D] hover:bg-subtle">
            Editar
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-body hover:bg-white">
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function DraftEditor({ draft, onClose, onSave, busy }: { draft: DraftView; onClose: () => void; onSave: (e: DraftEdits) => void; busy: boolean }) {
  const initialCategory = (Object.entries(CATEGORY_LABEL).find(([, l]) => draft.categoryLabel.startsWith(l))?.[0] ?? "outros") as Category;
  const initialAffected = (Object.entries(IMPACT_LABEL).find(([, l]) => l === draft.affectedLabel)?.[0] ?? "individual") as Impact;
  const [f, setF] = useState<DraftEdits>({
    title: draft.title,
    description: draft.description,
    category: initialCategory,
    type: draft.typeLabel === "Requisição" ? "REQ" : "INC",
    affected: initialAffected,
    blocksWork: draft.priority === "alta" || draft.priority === "critica",
    sameDayCommitment: false,
    comment: draft.comment,
  });
  const input = "ring-soft w-full rounded-lg bg-white px-3 py-2 text-[14px] text-ink outline-none focus:outline-[1.5px] focus:outline-primary";

  return (
    <div className="flex flex-col gap-3 border-t border-line px-[18px] py-4">
      {draft.kind === "create" ? (
        <>
          <label className="flex flex-col gap-1 text-[12.5px] text-muted">
            Título
            <input className={input} value={f.title} maxLength={90} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-muted">
            Descrição
            <textarea className={`${input} min-h-[84px]`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">
              Tipo
              <select className={input} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "INC" | "REQ" })}>
                <option value="INC">Incidente</option>
                <option value="REQ">Requisição</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">
              Categoria
              <select className={input} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as Category })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">
              Afetados
              <select className={input} value={f.affected} onChange={(e) => setF({ ...f, affected: e.target.value as Impact })}>
                {IMPACTS.map((c) => (
                  <option key={c} value={c}>
                    {IMPACT_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-[13.5px] text-body">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.blocksWork} onChange={(e) => setF({ ...f, blocksWork: e.target.checked })} />
              Impede de trabalhar
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.sameDayCommitment} onChange={(e) => setF({ ...f, sameDayCommitment: e.target.checked })} />
              Compromisso hoje depende disso
            </label>
          </div>
          <p className="text-[12px] text-muted">A prioridade é recalculada pelas regras do service desk a partir do impacto e da urgência.</p>
        </>
      ) : (
        <label className="flex flex-col gap-1 text-[12.5px] text-muted">
          O que adicionar ao chamado
          <textarea className={`${input} min-h-[84px]`} value={f.comment ?? ""} onChange={(e) => setF({ ...f, comment: e.target.value })} />
        </label>
      )}
      <div className="flex gap-1.5">
        <button type="button" disabled={busy} onClick={() => onSave(f)} className="h-9 rounded-lg bg-primary px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-70">
          Salvar alterações
        </button>
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3.5 text-[13.5px] font-medium text-body hover:bg-subtle">
          Voltar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ artigos e transferência

export function Articles({ articles }: { articles: { id: string; title: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
      <IconBook size={14} />
      <span>Fonte:</span>
      {articles.map((a) => (
        <span key={a.id} className="ring-line rounded-md bg-white px-2 py-0.5 text-body">
          {a.id} · {a.title}
        </span>
      ))}
    </div>
  );
}

export function HandoffNotice({ team, dueLabel }: { team: string; dueLabel: string }) {
  return (
    <div className="flex w-fit items-center gap-2.5 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
      <IconHeadset size={16} />
      <span>
        <span className="font-semibold">Suporte {team}</span> · primeiro contato {dueLabel}
      </span>
    </div>
  );
}

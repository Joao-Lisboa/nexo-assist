"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageView, TicketView, UiBlock } from "@/domain/conversation";
import type { ConsoleCounts, ConsoleDetail, ConsoleFilter, ConsoleListItem } from "@/server/console-service";
import { DecisionPanel } from "../chat/decision-panel";
import { IconAlert, IconChat, IconChevronDown, IconHeadset, IconLogout, IconMore, IconSearch, IconSend, IconSparkle, IconX, NexoMark } from "../icons";
import { Avatar, Dot, RichText, STATUS_DOT, STATUS_TEXT } from "../ui";

const FILTERS: { key: ConsoleFilter; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "para_voce", label: "Para você" },
  { key: "com_agent", label: "Com o agent" },
  { key: "minhas", label: "Minhas" },
];

const TAG_TONE: Record<ConsoleListItem["tag"]["tone"], { dot: string; text: string }> = {
  red: { dot: "bg-danger", text: "text-danger-ink" },
  amber: { dot: "bg-warn", text: "text-warn-ink" },
  green: { dot: "bg-ok", text: "text-muted" },
  gray: { dot: "bg-[#1B243155]", text: "text-muted" },
  blue: { dot: "bg-primary", text: "text-link" },
};

interface Analyst {
  name: string;
  initials: string;
  team: string;
}

export function ConsoleClient({ analyst }: { analyst: Analyst }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ConsoleFilter>("para_voce");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<ConsoleListItem[]>([]);
  const [counts, setCounts] = useState<ConsoleCounts | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConsoleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [showTickets, setShowTickets] = useState(true);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/console/conversations?filter=${filter}&q=${encodeURIComponent(search)}`, { cache: "no-store" });
      if (res.status === 401) return router.replace("/login");
      const data = (await res.json()) as { items: ConsoleListItem[]; counts: ConsoleCounts; error?: string };
      if (!res.ok) throw new Error(data.error);
      setItems(data.items);
      setCounts(data.counts);
      setListError(null);
      setSelected((s) => s ?? data.items[0]?.id ?? null);
    } catch {
      setListError("Não foi possível carregar as conversas.");
    }
  }, [filter, search, router]);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    try {
      const res = await fetch(`/api/console/conversations/${id}`, { cache: "no-store" });
      const data = (await res.json()) as ConsoleDetail & { error?: string };
      if (!res.ok) throw new Error(data.error);
      setDetail(data);
    } catch (err) {
      if (!quiet) setActionError(err instanceof Error && err.message ? err.message : "Não foi possível abrir a conversa.");
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(loadList, 0);
    const t = setInterval(loadList, 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadList]);

  useEffect(() => {
    if (!selected) return;
    const first = setTimeout(() => loadDetail(selected), 0);
    const t = setInterval(() => loadDetail(selected, true), 4000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [selected, loadDetail]);

  function select(id: string) {
    setActionError(null);
    setDetail(null);
    setSelected(id);
  }

  async function act(path: "assume" | "return" | "close" | "messages", body?: unknown) {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/console/conversations/${selected}/${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as ConsoleDetail & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Não foi possível concluir.");
      setDetail(data);
      if (path === "messages") setDraft("");
      void loadList();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Rail */}
      <nav className="flex w-16 shrink-0 flex-col items-center gap-3 border-r border-line bg-subtle py-4">
        <span className="pb-2">
          <NexoMark size={22} />
        </span>
        <span className="relative flex size-10 items-center justify-center rounded-xl bg-white text-ink shadow-[0_1px_2px_#1B24310D]" title="Conversas">
          <IconChat size={18} />
          {!!counts?.para_voce && (
            <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] font-bold text-white outline-2 outline-subtle">
              {counts.para_voce}
            </span>
          )}
        </span>
        <span className="flex-1" />
        <button onClick={logout} title="Sair" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-white">
          <IconLogout size={16} />
        </button>
        <Avatar initials={analyst.initials} bg="#0285F712" fg="#0069C7" size={36} online ringColor="#F6F7F9" />
      </nav>

      {/* Lista */}
      <section className="flex w-[380px] shrink-0 flex-col border-r border-line">
        <div className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
          <div className="flex items-center justify-between">
            <h1 className="text-[20px] font-bold text-ink">Conversas</h1>
            <span className="flex items-center gap-[7px] rounded-full bg-ok-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-ok-ink">
              <span className="size-[7px] rounded-full bg-ok" />
              Disponível
            </span>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-full bg-subtle px-3 text-muted">
            <IconSearch size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar conversa ou chamado" className="flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted" />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const on = filter === f.key;
              const n = counts?.[f.key];
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`flex items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[12.5px] ${on ? "bg-sky-soft text-link" : "bg-subtle text-body hover:bg-line"}`}>
                  {f.label}
                  {f.key !== "todas" && n !== undefined && <span className={`font-semibold ${on ? "text-link" : "text-muted"}`}>{n}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="scroll-thin flex flex-1 flex-col overflow-y-auto px-2 pb-3">
          {listError && <p className="m-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">{listError}</p>}
          {!counts && !listError && <ListSkeleton />}
          {counts && items.length === 0 && <p className="px-3 py-8 text-center text-[13.5px] text-muted">Nenhuma conversa neste filtro.</p>}
          {items.map((i) => (
            <ListItem key={i.id} item={i} active={i.id === selected} onClick={() => select(i.id)} />
          ))}
        </div>
      </section>

      {/* Conversa */}
      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        {!selected || !detail ? (
          <div className="flex flex-1 items-center justify-center text-[13.5px] text-muted">{detailLoading ? "Carregando conversa…" : "Selecione uma conversa."}</div>
        ) : (
          <ConversationPane
            detail={detail}
            analystName={analyst.name}
            busy={busy}
            error={actionError}
            draft={draft}
            setDraft={setDraft}
            onAct={act}
            showTickets={showTickets}
            onToggleTickets={() => setShowTickets((s) => !s)}
          />
        )}
      </section>

      {/* Chamados */}
      {detail && showTickets && <TicketPanel detail={detail} onClose={() => setShowTickets(false)} />}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex animate-pulse gap-3 p-2">
          <div className="size-[46px] rounded-full bg-subtle" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <div className="h-3 w-1/2 rounded bg-subtle" />
            <div className="h-3 w-3/4 rounded bg-subtle" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ListItem({ item, active, onClick }: { item: ConsoleListItem; active: boolean; onClick: () => void }) {
  const tone = TAG_TONE[item.tag.tone];
  return (
    <button onClick={onClick} className={`flex w-full gap-3 rounded-xl p-2.5 text-left transition ${active ? "bg-subtle" : "hover:bg-subtle/60"}`}>
      <Avatar initials={item.employee.initials} bg={item.employee.avatarBg} fg={item.employee.avatarFg} size={46} online={item.mode !== "closed"} ringColor={active ? "#F6F7F9" : "#ffffff"} />
      <div className={`flex min-w-0 flex-1 flex-col gap-0.5 pb-2.5 ${active ? "" : "border-b border-line"}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-[14.5px] text-ink ${item.unread ? "font-semibold" : ""}`}>{item.employee.name}</span>
          <span className={`shrink-0 text-[12px] ${item.unread ? "font-semibold text-primary" : "text-muted"}`}>{item.lastAtLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13.5px] text-muted">{item.lastMessage}</span>
          {item.unread > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{item.unread}</span>}
        </div>
        <span className="flex items-center gap-1.5 pt-0.5 text-[12px]">
          <Dot className={tone.dot} />
          <span className={tone.text}>{item.tag.label}</span>
        </span>
      </div>
    </button>
  );
}

function ConversationPane({
  detail,
  analystName,
  busy,
  error,
  draft,
  setDraft,
  onAct,
  showTickets,
  onToggleTickets,
}: {
  detail: ConsoleDetail;
  analystName: string;
  busy: boolean;
  error: string | null;
  draft: string;
  setDraft: (s: string) => void;
  onAct: (path: "assume" | "return" | "close" | "messages", body?: unknown) => void;
  showTickets: boolean;
  onToggleTickets: () => void;
}) {
  const { conversation: c, employee } = detail;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openTrace, setOpenTrace] = useState<number | null>(null);
  const first = employee.name.split(" ")[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [c.messages.length, c.id]);

  const modePill =
    c.mode === "waiting_human"
      ? { cls: "bg-warn-soft text-warn-ink", label: "Aguardando atendente" }
      : c.mode === "human"
        ? { cls: "bg-sky-soft text-link", label: detail.assignedToMe ? "Você está atendendo" : `Com ${c.assignedAnalystName ?? "analista"}` }
        : c.mode === "closed"
          ? { cls: "bg-subtle text-muted", label: "Encerrada" }
          : { cls: "bg-ok-soft text-ok-ink", label: "Agent atendendo" };

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line bg-white pr-4 pl-5">
        <Avatar initials={employee.initials} bg={employee.avatarBg} fg={employee.avatarFg} size={40} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-ink">{employee.name}</span>
          <span className="truncate text-[12.5px] text-muted">
            online · {employee.department}
            {detail.relatedTicket && c.mode !== "human" ? ` · ${detail.relatedTicket}` : ""}
          </span>
        </div>
        {detail.assignedToMe ? (
          <>
            <button disabled={busy} onClick={() => onAct("return")} className="ring-soft h-9 rounded-lg px-3 text-[13.5px] text-body hover:bg-subtle">
              Devolver ao agent
            </button>
            <button disabled={busy} onClick={() => onAct("close")} className="h-9 rounded-lg bg-danger-soft px-3 text-[13.5px] font-semibold text-danger-ink hover:brightness-95">
              Encerrar atendimento
            </button>
          </>
        ) : (
          <span className={`rounded-full px-[11px] py-1.5 text-[12.5px] font-semibold ${modePill.cls}`}>{modePill.label}</span>
        )}
        <button onClick={onToggleTickets} title={showTickets ? "Ocultar chamados" : "Mostrar chamados"} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-subtle">
          <IconMore size={18} />
        </button>
      </header>

      <div ref={scrollRef} className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto px-10 pt-5 pb-4">
        {detail.handoff && c.mode !== "agent" && (
          <div className="mb-3 flex gap-3 rounded-xl bg-white p-3.5 ring-line">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn-ink">
              <IconSparkle size={16} />
            </span>
            <div className="flex flex-col gap-1 text-[13px]">
              <span className="font-semibold text-ink">
                Resumo do agent · {detail.handoff.reason}
                {detail.handoff.confidence !== null && ` (confiança ${detail.handoff.confidence}%)`}
              </span>
              <span className="leading-[19px] text-body">{detail.handoff.summary}</span>
            </div>
          </div>
        )}
        <div className="flex justify-center pb-1">
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-[12px] text-muted">Hoje</span>
        </div>
        {c.messages.map((m, i) => {
          const prev = c.messages[i - 1];
          const grouped = prev && prev.role === m.role && m.role === "user";
          return <ConsoleMessage key={m.id} m={m} grouped={!!grouped} open={openTrace === m.id} onToggle={() => setOpenTrace(openTrace === m.id ? null : m.id)} />;
        })}
      </div>

      <div className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-white px-5 pt-3 pb-3.5">
        {error && (
          <p className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
            <IconAlert size={15} /> {error}
          </p>
        )}
        {c.mode === "waiting_human" && (
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-warn-soft text-warn-ink">
              <IconHeadset size={17} />
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-[14px] font-semibold text-ink">{first} espera um atendente</span>
              <span className="text-[12.5px] text-muted">Agent pausado{c.handoffDueLabel ? ` · até ${c.handoffDueLabel}` : ""}</span>
            </div>
            <button disabled={busy} onClick={() => onAct("return")} className="ring-soft h-9 rounded-lg px-3.5 text-[13.5px] text-body hover:bg-subtle">
              Devolver ao agent
            </button>
            <button disabled={busy} onClick={() => onAct("assume")} className="h-9 rounded-lg bg-primary px-4 text-[13.5px] font-semibold text-white hover:brightness-110">
              Assumir atendimento
            </button>
          </div>
        )}
        {c.mode === "agent" && (
          <div className="flex items-center gap-3 text-[13px] text-muted">
            <span className="flex-1">O Nexo Assist está atendendo {first}. Assuma se quiser intervir.</span>
            <button disabled={busy} onClick={() => onAct("assume")} className="ring-soft h-9 rounded-lg px-3.5 text-[13.5px] text-body hover:bg-subtle">
              Assumir atendimento
            </button>
          </div>
        )}
        {detail.assignedToMe ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim()) onAct("messages", { text: draft });
            }}
            className="flex items-center gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Responder a ${first}…`}
              className="h-11 flex-1 rounded-xl bg-subtle px-3.5 text-[14px] text-ink outline-none focus:outline-[1.5px] focus:outline-primary"
            />
            <button disabled={busy || !draft.trim()} className="flex size-11 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50" aria-label="Enviar">
              <IconSend size={17} />
            </button>
          </form>
        ) : (
          c.mode !== "agent" && (
            <div className="flex h-11 items-center rounded-xl bg-subtle px-3.5 text-[14px] text-muted">
              {c.mode === "closed" ? "Atendimento encerrado" : c.mode === "human" ? `${c.assignedAnalystName ?? "Outro analista"} está atendendo` : "Assuma o atendimento para responder"}
            </div>
          )
        )}
        <span className="sr-only">{analystName}</span>
      </div>
    </>
  );
}

function blockSummary(b: UiBlock): string {
  switch (b.kind) {
    case "quick_replies":
      return `Opções: ${b.options.join(" · ")}`;
    case "ticket_selector":
      return `Lista: ${b.tickets.map((t) => t.number).join(", ")}`;
    case "ticket_card":
      return `Card: ${b.ticket.number} · ${b.ticket.statusLabel}${b.ticket.overdue ? " · vencido" : ""}`;
    case "draft":
      return `Rascunho ${b.draft.code} · ${b.draft.title} · ${b.draft.priorityLabel} · ${b.draft.status === "pending" ? "aguardando confirmação" : b.draft.status === "confirmed" ? `confirmado ${b.draft.resultTicket ?? ""}` : "descartado"}`;
    case "articles":
      return `Fonte: ${b.articles.map((a) => a.id).join(", ")}`;
    case "handoff":
      return `Transferido para Suporte ${b.team}`;
  }
}

function ConsoleMessage({ m, grouped, open, onToggle }: { m: MessageView; grouped: boolean; open: boolean; onToggle: () => void }) {
  if (m.role === "system") {
    return (
      <div className="flex items-center gap-3 pt-[18px] pb-1">
        <span className="h-px flex-1 bg-[#1B243114]" />
        <span className="text-[12.5px] text-muted">
          {m.content} · {m.time}
        </span>
        <span className="h-px flex-1 bg-[#1B243114]" />
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div className={`flex flex-col items-start ${grouped ? "pt-[3px]" : "pt-4"}`}>
        <div className={`max-w-[460px] bg-white px-3 pt-2 pb-1.5 shadow-[0_1px_1px_#1B24310D] ${grouped ? "rounded-xl" : "rounded-[4px_12px_12px_12px]"}`}>
          <p className="text-[14px] leading-5 text-ink">{m.content}</p>
          <p className="text-right text-[11px] text-muted">{m.time}</p>
        </div>
      </div>
    );
  }
  const isAgent = m.role === "agent";
  return (
    <div className="flex flex-col items-end gap-1 pt-4">
      <div className="flex items-center gap-1.5 px-1 text-[12.5px]">
        <span className="font-semibold text-body">{m.authorName}</span>
        <span className={`rounded-md px-1.5 py-px text-[11px] font-semibold ${isAgent ? "bg-sky-soft text-link" : "bg-ok-soft text-ok-ink"}`}>{isAgent ? "IA" : m.authorTeam}</span>
        {isAgent && m.trace && (
          <button onClick={onToggle} className="flex items-center gap-0.5 text-[12px] font-medium text-link hover:underline">
            {open ? "ocultar" : "por quê?"}
            <IconChevronDown size={12} className={open ? "rotate-180" : ""} />
          </button>
        )}
      </div>
      <div className={`max-w-[460px] rounded-[12px_4px_12px_12px] px-3 pt-2 pb-1.5 ${isAgent ? "bg-bubble-agent" : "bg-bubble-analyst"}`}>
        <p className="text-[14px] leading-5 text-ink">
          <RichText text={m.content} />
        </p>
        {m.blocks.map((b, i) => (
          <p key={i} className="mt-1 text-[12px] text-muted">
            ▸ {blockSummary(b)}
          </p>
        ))}
        <p className="text-right text-[11px] text-muted">{m.time}</p>
      </div>
      {open && m.trace && (
        <div className="w-full max-w-[560px]">
          <DecisionPanel trace={m.trace} compact />
        </div>
      )}
    </div>
  );
}

function TicketPanel({ detail, onClose }: { detail: ConsoleDetail; onClose: () => void }) {
  const first = detail.employee.name.split(" ")[0];
  const t = detail.tickets;
  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l border-line bg-white xl:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-line pr-3.5 pl-5">
        <div className="flex flex-1 flex-col">
          <span className="text-[15px] font-semibold text-ink">Chamados de {first}</span>
          <span className="text-[12.5px] text-muted">{t ? `${(t.current && isOpen(t.current) ? 1 : 0) + t.open.length} abertos · ${t.closed.length + (t.current && !isOpen(t.current) ? 1 : 0)} encerrados` : "—"}</span>
        </div>
        <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-subtle" aria-label="Fechar painel">
          <IconX size={16} />
        </button>
      </div>
      <div className="scroll-thin flex flex-1 flex-col gap-6 overflow-y-auto px-5 pt-6 pb-5">
        {detail.ticketsError && (
          <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
            <IconAlert size={15} className="mt-0.5 shrink-0" />
            {detail.ticketsError}
          </p>
        )}
        {t?.current && (
          <div className="flex flex-col gap-2.5">
            <span className="text-[12px] font-semibold tracking-wide text-muted uppercase">Desta conversa</span>
            <div className="flex flex-col gap-3 rounded-xl bg-subtle p-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="text-muted">{t.current.number}</span>
                  <span className="flex items-center gap-1.5">
                    <Dot className={t.current.overdue ? "bg-danger" : STATUS_DOT[t.current.status]} size={7} />
                    <span className={`font-semibold ${STATUS_TEXT[t.current.status]}`}>{t.current.statusLabel}</span>
                  </span>
                </div>
                <span className="text-[14.5px] font-semibold text-ink">{t.current.title}</span>
                <span className="text-[12.5px] text-muted">
                  {t.current.categoryLabel} · prioridade {t.current.priorityLabel.toLowerCase()}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-3 text-[12.5px]">
                <span className={t.current.overdue ? "text-danger-ink" : "text-body"}>{t.current.overdue ? `Prazo vencido (${t.current.slaRule})` : t.current.slaLabel}</span>
                <span className="text-muted">{t.current.updatedAgo}</span>
              </div>
              <p className="line-clamp-4 text-[12.5px] leading-[18px] text-body">{t.current.description}</p>
            </div>
          </div>
        )}
        {t && (t.open.length > 0 || t.closed.length > 0) && (
          <div className="flex flex-col">
            <span className="pb-1 text-[12px] font-semibold tracking-wide text-muted uppercase">Outros chamados</span>
            {[...t.open, ...t.closed].map((x, i, arr) => (
              <TicketRow key={x.number} t={x} last={i === arr.length - 1} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function isOpen(t: TicketView): boolean {
  return t.status !== "resolvido" && t.status !== "fechado";
}

function TicketRow({ t, last }: { t: TicketView; last: boolean }) {
  return (
    <div className={`flex gap-3 py-3 ${last ? "" : "border-b border-line"}`}>
      <Dot className={t.overdue ? "bg-danger" : STATUS_DOT[t.status]} size={7} />
      <div className="-mt-1 flex min-w-0 flex-col">
        <span className="truncate text-[14px] text-ink">{t.title}</span>
        <span className="text-[12.5px] text-muted">
          {t.number} · {isOpen(t) ? (t.overdue ? "Prazo vencido" : t.statusLabel) : `${t.statusLabel} em ${t.openedShort}`}
        </span>
      </div>
    </div>
  );
}

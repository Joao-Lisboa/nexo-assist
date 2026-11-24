"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConversationView, MessageView, StreamEvent, UiBlock } from "@/domain/conversation";
import { IconAlert, IconChevronDown, IconHeadset, IconPlus, IconSend } from "../icons";
import { RichText } from "../ui";
import { Articles, DraftCard, HandoffNotice, QuickReplies, TicketCard, TicketSelector, type DraftEdits } from "./blocks";
import { StepLine } from "./step-line";
import { DecisionPanel } from "./decision-panel";

const SUGGESTIONS = ["Qual o status do meu chamado?", "Minha VPN não conecta", "Preciso de acesso a uma pasta do SharePoint", "Qual o horário do service desk?"];

interface Pending {
  steps: string[];
  text: string;
}

async function readSse(res: Response, onEvent: (e: StreamEvent) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const line = raw.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
}

export function ChatClient({ initial, firstName }: { initial: ConversationView; firstName: string }) {
  const [conv, setConv] = useState<ConversationView>(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [draftBusy, setDraftBusy] = useState<number | null>(null);
  const [draftErrors, setDraftErrors] = useState<Record<number, string>>({});
  const [openTraces, setOpenTraces] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const upsertMessage = useCallback((m: MessageView) => {
    setConv((c) => {
      const without = c.messages.filter((x) => x.id !== m.id && !(x.id < 0 && m.role === "user"));
      return { ...c, messages: [...without, m].sort((a, b) => (a.id < 0 ? 1 : b.id < 0 ? -1 : a.id - b.id)) };
    });
  }, []);

  const apply = useCallback(
    (e: StreamEvent) => {
      switch (e.type) {
        case "user_message":
          upsertMessage(e.message);
          break;
        case "step":
          setPending((p) => ({ steps: [...(p?.steps ?? []), e.label], text: p?.text ?? "" }));
          break;
        case "text":
          setPending((p) => ({ steps: p?.steps ?? [], text: (p?.text ?? "") + e.delta }));
          break;
        case "message":
          if (e.message.role !== "user") setPending(null);
          upsertMessage(e.message);
          break;
        case "conversation":
          setConv((c) => ({ ...c, ...e.conversation }));
          break;
        case "error":
          setError(e.message);
          setConv((c) => ({ ...c, messages: c.messages.filter((m) => m.id >= 0) }));
          break;
        case "done":
          setPending(null);
          break;
      }
    },
    [upsertMessage],
  );

  // rolar para o fim quando algo muda
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [conv.messages.length, pending?.text, pending?.steps.length, openTraces.size]);

  // com um analista, buscar novas mensagens periodicamente
  useEffect(() => {
    if (conv.mode === "agent" || conv.mode === "closed") return;
    const timer = setInterval(async () => {
      const res = await fetch("/api/chat", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setConv((await res.json()) as ConversationView);
    }, 4000);
    return () => clearInterval(timer);
  }, [conv.mode]);

  const send = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || sending) return;
      setError(null);
      setSending(true);
      setText("");
      const temp: MessageView = { id: -Date.now(), role: "user", authorName: null, authorTeam: null, content: value, blocks: [], trace: null, createdAt: new Date().toISOString(), time: "" };
      setConv((c) => ({ ...c, messages: [...c.messages, temp] }));
      if (conv.mode === "agent") setPending({ steps: [], text: "" });
      try {
        const res = await fetch("/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: value }) });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "Não consegui enviar. Tente de novo.");
        }
        await readSse(res, apply);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não consegui enviar. Tente de novo.");
        setConv((c) => ({ ...c, messages: c.messages.filter((m) => m.id !== temp.id) }));
        setText(value);
      } finally {
        setPending(null);
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [apply, conv.mode, sending],
  );

  const draftAction = useCallback(
    async (id: number, action: "confirm" | "cancel") => {
      setDraftBusy(id);
      setDraftErrors((e) => ({ ...e, [id]: "" }));
      try {
        const res = await fetch(`/api/drafts/${id}/${action}`, { method: "POST" });
        const data = (await res.json()) as { events?: StreamEvent[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Não foi possível concluir.");
        for (const e of data.events ?? []) apply(e);
        const fresh = await fetch("/api/chat", { cache: "no-store" });
        if (fresh.ok) setConv((await fresh.json()) as ConversationView);
      } catch (err) {
        setDraftErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Não foi possível concluir." }));
      } finally {
        setDraftBusy(null);
      }
    },
    [apply],
  );

  const saveDraft = useCallback(
    async (id: number, edits: DraftEdits): Promise<boolean> => {
      setDraftBusy(id);
      try {
        const res = await fetch(`/api/drafts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edits) });
        const data = (await res.json()) as { message?: MessageView | null; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar.");
        if (data.message) upsertMessage(data.message);
        return true;
      } catch (err) {
        setDraftErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : "Não foi possível salvar." }));
        return false;
      } finally {
        setDraftBusy(null);
      }
    },
    [upsertMessage],
  );

  const pendingDraftId = useMemo(() => {
    for (const m of [...conv.messages].reverse()) for (const b of m.blocks) if (b.kind === "draft" && b.draft.status === "pending") return b.draft.id;
    return null;
  }, [conv.messages]);

  // ⌘/Ctrl + Enter confirma o rascunho pendente
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && pendingDraftId && !text.trim() && draftBusy === null) {
        e.preventDefault();
        void draftAction(pendingDraftId, "confirm");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draftAction, draftBusy, pendingDraftId, text]);

  async function newConversation() {
    const res = await fetch("/api/chat/new", { method: "POST" });
    const data = (await res.json()) as ConversationView & { error?: string };
    if (!res.ok) return setError(data.error ?? "Não foi possível iniciar uma nova conversa.");
    setConv(data);
    setError(null);
  }

  const lastAgentId = useMemo(() => [...conv.messages].reverse().find((m) => m.role === "agent")?.id ?? null, [conv.messages]);
  const atLimit = conv.userMessageCount >= conv.messageLimit;
  const canType = conv.mode !== "closed" && !atLimit;
  const interactive = (id: number) => id === lastAgentId && conv.mode === "agent" && !sending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[808px] flex-1 flex-col justify-end gap-5 px-5 pt-7 pb-1">
          {conv.messages.length === 0 && !pending && <EmptyState firstName={firstName} onPick={send} />}
          {conv.messages.map((m, i) => {
            const next = conv.messages.slice(i + 1).find((x) => x.role === "user");
            if (m.role === "user") return <UserBubble key={m.id} message={m} />;
            if (m.role === "system") return <SystemLine key={m.id} text={m.content} time={m.time} />;
            if (m.role === "analyst") return <AnalystMessage key={m.id} message={m} />;
            return (
              <AgentMessage
                key={m.id}
                message={m}
                traceOpen={openTraces.has(m.id)}
                onToggleTrace={() =>
                  setOpenTraces((s) => {
                    const n = new Set(s);
                    if (n.has(m.id)) n.delete(m.id);
                    else n.add(m.id);
                    return n;
                  })
                }
                renderBlock={(b, k) => (
                  <BlockView
                    key={k}
                    block={b}
                    nextUser={next?.content ?? null}
                    interactive={interactive(m.id)}
                    onSend={send}
                    draftBusy={draftBusy}
                    draftErrors={draftErrors}
                    onDraft={draftAction}
                    onSaveDraft={saveDraft}
                  />
                )}
              />
            );
          })}
          {pending && <PendingAgent pending={pending} />}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[808px] flex-col gap-1.5 px-5 pt-2.5 pb-[18px]">
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">
            <IconAlert size={15} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="font-medium underline-offset-2 hover:underline">
              Fechar
            </button>
          </div>
        )}
        <ModeBanner conv={conv} />
        {canType ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
            className="ring-soft flex min-h-12 items-end gap-2 rounded-xl bg-white py-1.5 pr-1.5 pl-4 focus-within:outline-[1.5px] focus-within:outline-primary"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              autoFocus
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  void send(text);
                }
              }}
              placeholder={conv.mode === "agent" ? "Escreva para o Nexo…" : "Escreva para o analista…"}
              className="max-h-32 flex-1 resize-none self-center bg-transparent py-1.5 text-[14.5px] text-ink outline-none placeholder:text-muted"
            />
            <button type="submit" disabled={sending || !text.trim()} className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[13.5px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50">
              <IconSend size={15} />
              Enviar
            </button>
          </form>
        ) : (
          <div className="ring-line flex items-center gap-3 rounded-xl bg-subtle px-4 py-3 text-[13.5px] text-body">
            <span className="flex-1">
              {atLimit && conv.mode !== "closed"
                ? `Você chegou ao limite de ${conv.messageLimit} mensagens desta sessão.`
                : "Este atendimento foi encerrado."}{" "}
              Seus chamados continuam salvos.
            </span>
            <button onClick={newConversation} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13.5px] font-semibold text-white">
              <IconPlus size={15} />
              Nova conversa
            </button>
          </div>
        )}
        <div className="flex justify-end">
          <span className="text-[12.5px] text-muted">
            {conv.userMessageCount}/{conv.messageLimit} mensagens nesta sessão
          </span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ partes

/** A opção que o funcionário escolheu (clicando ou escrevendo algo que começa com ela). */
function pickedOption(options: string[], nextUser: string | null): string | null {
  if (!nextUser) return null;
  const n = nextUser.trim().toLowerCase();
  return options.find((o) => n === o.toLowerCase() || n.startsWith(`${o.toLowerCase().replace(/[.!]$/, "")}`)) ?? null;
}

function EmptyState({ firstName, onPick }: { firstName: string; onPick: (t: string) => void }) {
  return (
    <div className="fade-up flex flex-col gap-5 pb-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-[36px] leading-[40px] tracking-[-0.6px] text-ink">Olá, {firstName}. Como posso ajudar?</h1>
        <p className="max-w-[560px] text-[15px] leading-[23px] text-muted">
          Descreva o problema com suas palavras. Eu consulto seus chamados, busco na central de ajuda, abro ou atualizo chamados e chamo um analista
          quando precisar. Você vê o que eu fiz e por quê em cada resposta.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => onPick(s)} className="ring-line rounded-lg bg-white px-3 py-[7px] text-[13.5px] font-medium text-ink hover:bg-subtle">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: MessageView }) {
  return (
    <div className="fade-up flex justify-end">
      <div className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[21px] whitespace-pre-wrap text-white">{message.content}</div>
    </div>
  );
}

function SystemLine({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[#1B243114]" />
      <span className="text-[12.5px] text-muted">
        {text}
        {time && ` · ${time}`}
      </span>
      <span className="h-px flex-1 bg-[#1B243114]" />
    </div>
  );
}

function AnalystMessage({ message }: { message: MessageView }) {
  return (
    <div className="fade-up flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold text-ink">{message.authorName}</span>
        <span className="rounded-md bg-ok-soft px-1.5 py-px font-semibold text-ok-ink">{message.authorTeam}</span>
      </div>
      <div className="w-fit max-w-[600px] rounded-[4px_12px_12px_12px] bg-bubble-analyst px-4 py-3 text-[14.5px] leading-[22px] text-ink">
        <RichText text={message.content} />
      </div>
    </div>
  );
}

function AgentMessage({
  message,
  traceOpen,
  onToggleTrace,
  renderBlock,
}: {
  message: MessageView;
  traceOpen: boolean;
  onToggleTrace: () => void;
  renderBlock: (b: UiBlock, key: number) => React.ReactNode;
}) {
  const steps = message.trace?.steps.map((s) => s.label) ?? [];
  // Como no protótipo: o card do chamado vem antes do texto; opções ficam dentro do balão; o resto vem depois.
  const before: UiBlock[] = message.blocks.filter((b) => b.kind === "ticket_card");
  const inline: UiBlock[] = message.blocks.filter((b) => b.kind === "quick_replies");
  const outside: UiBlock[] = message.blocks.filter((b) => b.kind !== "quick_replies" && b.kind !== "ticket_card");
  return (
    <div className="fade-up flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink">Nexo Assist</span>
        <StepLine steps={steps} />
        {message.trace && (
          <button onClick={onToggleTrace} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-link hover:bg-sky-soft" aria-expanded={traceOpen}>
            {traceOpen ? "Ocultar detalhes" : "Por que fiz isso?"}
            <IconChevronDown size={13} className={`transition ${traceOpen ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {traceOpen && message.trace && <DecisionPanel trace={message.trace} />}
      {before.map((b, i) => (
        <div key={`b${i}`} className="w-full">
          {renderBlock(b, 200 + i)}
        </div>
      ))}
      <div className="ring-line flex w-full max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] bg-white px-4 py-3">
        <p className="text-[14.5px] leading-[22px] text-ink">
          <RichText text={message.content} />
        </p>
        {inline.map((b, i) => renderBlock(b, i))}
      </div>
      {outside.map((b, i) => (
        <div key={i} className="w-full">
          {renderBlock(b, 100 + i)}
        </div>
      ))}
    </div>
  );
}

function PendingAgent({ pending }: { pending: Pending }) {
  return (
    <div className="fade-up flex flex-col gap-1.5" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-semibold text-ink">Nexo Assist</span>
        <StepLine steps={pending.steps} live />
      </div>
      <div className="ring-line w-fit max-w-[600px] rounded-[4px_12px_12px_12px] bg-white px-4 py-3 text-[14.5px] leading-[22px] text-ink">
        {pending.text ? (
          <RichText text={pending.text} />
        ) : (
          <span className="flex h-[22px] items-center gap-1" aria-label="Nexo Assist está pensando">
            <span className="typing-dot size-1.5 rounded-full bg-muted" />
            <span className="typing-dot size-1.5 rounded-full bg-muted" />
            <span className="typing-dot size-1.5 rounded-full bg-muted" />
          </span>
        )}
      </div>
    </div>
  );
}

function ModeBanner({ conv }: { conv: ConversationView }) {
  if (conv.mode === "waiting_human") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-ink">
        <IconHeadset size={16} />
        <span>
          <span className="font-semibold">Um analista vai continuar por aqui</span>
          {conv.handoffDueLabel && ` · primeiro contato até ${conv.handoffDueLabel}`}. O assistente está pausado.
        </span>
      </div>
    );
  }
  if (conv.mode === "human") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok-ink">
        <IconHeadset size={16} />
        <span>
          Você está falando com <span className="font-semibold">{conv.assignedAnalystName ?? "um analista"}</span>.
        </span>
      </div>
    );
  }
  return null;
}

function BlockView({
  block,
  nextUser,
  interactive,
  onSend,
  draftBusy,
  draftErrors,
  onDraft,
  onSaveDraft,
}: {
  block: UiBlock;
  nextUser: string | null;
  interactive: boolean;
  onSend: (t: string) => void;
  draftBusy: number | null;
  draftErrors: Record<number, string>;
  onDraft: (id: number, a: "confirm" | "cancel") => void;
  onSaveDraft: (id: number, e: DraftEdits) => Promise<boolean>;
}) {
  switch (block.kind) {
    case "quick_replies":
      return <QuickReplies question={block.question} options={block.options} selected={pickedOption(block.options, nextUser)} disabled={!interactive} onPick={onSend} />;
    case "ticket_selector":
      return (
        <TicketSelector
          tickets={block.tickets}
          selected={nextUser ? (block.tickets.find((t) => nextUser.startsWith(t.number))?.number ?? null) : null}
          disabled={!interactive}
          onPick={(t) => onSend(`${t.number} · ${t.title}`)}
        />
      );
    case "ticket_card":
      return <TicketCard ticket={block.ticket} />;
    case "draft":
      return (
        <DraftCard
          draft={block.draft}
          busy={draftBusy === block.draft.id}
          error={draftErrors[block.draft.id] || null}
          onConfirm={() => onDraft(block.draft.id, "confirm")}
          onCancel={() => onDraft(block.draft.id, "cancel")}
          onSave={(e) => onSaveDraft(block.draft.id, e)}
        />
      );
    case "articles":
      return <Articles articles={block.articles} />;
    case "handoff":
      return <HandoffNotice team={block.team} dueLabel={block.dueLabel} />;
  }
}

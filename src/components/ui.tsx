import type { Priority, TicketStatus } from "@/domain/types";

export const STATUS_DOT: Record<TicketStatus, string> = {
  aberto: "bg-sky",
  em_andamento: "bg-sky",
  aguardando_analista: "bg-warn",
  aguardando_usuario: "bg-warn",
  aprovado: "bg-ok",
  resolvido: "bg-[#1B243140]",
  fechado: "bg-[#1B243140]",
};

export const STATUS_TEXT: Record<TicketStatus, string> = {
  aberto: "text-link",
  em_andamento: "text-link",
  aguardando_analista: "text-warn-ink",
  aguardando_usuario: "text-warn-ink",
  aprovado: "text-ok-ink",
  resolvido: "text-muted",
  fechado: "text-muted",
};

export const PRIORITY_DOT: Record<Priority, string> = {
  critica: "bg-danger",
  alta: "bg-warn",
  media: "bg-[#1B243166]",
  baixa: "bg-[#1B243140]",
};

export function Dot({ className, size = 6 }: { className: string; size?: number }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ width: size, height: size }} />;
}

export function Avatar({
  initials,
  bg,
  fg,
  size = 34,
  online,
  ringColor = "#ffffff",
}: {
  initials: string;
  bg: string;
  fg: string;
  size?: number;
  online?: boolean;
  ringColor?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={{ width: size, height: size, background: bg, color: fg, fontSize: size >= 40 ? 14 : 12.5 }}>
      {initials}
      {online && (
        <span className="absolute right-0 bottom-0 rounded-full bg-ok" style={{ width: size >= 40 ? 11 : 9, height: size >= 40 ? 11 : 9, outline: `2px solid ${ringColor}` }} />
      )}
    </span>
  );
}

/** Texto do agent: preserva quebras de linha e aceita **negrito**. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </span>
  );
}

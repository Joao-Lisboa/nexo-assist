import { IconBook, IconCheck, IconClock, IconFile, IconGauge, IconHeadset, IconSearch, IconTicket } from "../icons";

/** Ações do agent exibidas acima da resposta ("consultou seus chamados"…). */

function iconFor(label: string) {
  if (label.includes("central")) return IconBook;
  if (label.includes("prioridade")) return IconGauge;
  if (label.includes("SLA") || label.includes("prazo")) return IconClock;
  if (label.includes("rascunho") || label.includes("atualização")) return IconFile;
  if (label.includes("analista")) return IconHeadset;
  if (label.includes("duplicidade")) return IconSearch;
  if (label.includes("criou") || label.includes("atualizou") || label.includes("reabriu")) return IconCheck;
  return IconTicket;
}

export function StepLine({ steps, live = false }: { steps: string[]; live?: boolean }) {
  const unique = steps.filter((s, i) => steps.indexOf(s) === i);
  return (
    <>
      {unique.map((label, i) => {
        const Icon = iconFor(label);
        const running = live && i === unique.length - 1;
        return (
          <span key={label} className={`fade-up flex items-center gap-[5px] text-[12.5px] ${running ? "text-link" : "text-muted"}`}>
            <Icon size={13} />
            {label}
            {running && "…"}
          </span>
        );
      })}
    </>
  );
}

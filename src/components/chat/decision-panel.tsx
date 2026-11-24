import { INTENT_LABEL, type DecisionTrace } from "@/domain/conversation";
import { IconCheck, IconX } from "../icons";

/**
 * Detalhe da decisão: o que o agent entendeu, que ação tomou, com que
 * segurança e por quê — além das regras aplicadas e de cada ferramenta.
 */
export function DecisionPanel({ trace, compact = false }: { trace: DecisionTrace; compact?: boolean }) {
  const pct = Math.round(trace.confidence * 100);
  const tone = pct >= 75 ? "bg-ok" : pct >= 60 ? "bg-warn" : "bg-danger";
  const toneText = pct >= 75 ? "text-ok-ink" : pct >= 60 ? "text-warn-ink" : "text-danger-ink";
  const confidenceLabel = pct >= 75 ? "alta" : pct >= 60 ? "média" : "baixa";

  return (
    <div className={`fade-up ring-line flex flex-col gap-3.5 rounded-xl bg-subtle p-4 text-[13px] ${compact ? "" : "w-full"}`}>
      <div className="grid gap-3.5 sm:grid-cols-[1fr_180px]">
        <Field label="O que entendi">{trace.understood}</Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-medium tracking-wide text-muted uppercase">Confiança</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#1B24311a]">
              <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`font-semibold tabular-nums ${toneText}`}>{pct}%</span>
          </div>
          <span className="text-[12px] text-muted">{confidenceLabel} · {INTENT_LABEL[trace.intent]}</span>
        </div>
      </div>
      <Field label="O que fiz">{trace.action}</Field>
      <Field label="Por quê">{trace.reasoning}</Field>

      {trace.rules.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-medium tracking-wide text-muted uppercase">Regras do service desk aplicadas</span>
          <ul className="flex flex-col gap-1">
            {trace.rules.map((r, i) => (
              <li key={i} className="flex gap-2 text-body">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {trace.steps.filter((s) => s.input || s.output).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-medium tracking-wide text-muted uppercase">Consultas e ações</span>
          <ol className="flex flex-col gap-1">
            {trace.steps
              .filter((s) => s.input || s.output)
              .map((s, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-2 ring-line">
                  {s.ok ? <IconCheck size={14} className="mt-0.5 shrink-0 text-ok-ink" /> : <IconX size={14} className="mt-0.5 shrink-0 text-danger-ink" />}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono text-[12px] text-ink">
                      {s.tool}
                      {s.input && <span className="text-muted">({s.input})</span>}
                    </span>
                    <span className="text-[12.5px] text-body">→ {s.output}</span>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-muted tabular-nums">{s.durationMs} ms</span>
                </li>
              ))}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[11.5px] text-muted">
        <span>modelo: {trace.model}</span>
        <span>tempo: {(trace.latencyMs / 1000).toFixed(1)} s</span>
        {trace.tokens && <span>tokens: {trace.tokens.input.toLocaleString("pt-BR")} entrada · {trace.tokens.output.toLocaleString("pt-BR")} saída</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium tracking-wide text-muted uppercase">{label}</span>
      <span className="leading-[19px] text-ink">{children}</span>
    </div>
  );
}

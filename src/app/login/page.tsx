import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { NexoMark } from "@/components/icons";
import { currentUser } from "@/server/auth";

export const dynamic = "force-dynamic";

const STATS = [
  { value: "8 s", label: "primeira resposta, em média" },
  { value: "72%", label: "resolvidos sem fila" },
  { value: "6", label: "analistas online agora", live: true },
];

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.role === "analyst" ? "/console" : "/chat");

  return (
    <main className="flex min-h-screen bg-white">
      {/* Vitrine */}
      <section className="relative hidden w-[800px] max-w-[55%] shrink-0 flex-col justify-between bg-ink px-16 pt-10 pb-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark size={24} color="#ffffff" />
          <span className="text-[17px] font-bold tracking-[-0.2px] text-white">Nexo Assist</span>
        </div>

        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-[18px]">
            <span className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</span>
            <h1 className="font-serif text-[54px] leading-[56px] tracking-[-1.2px] text-white">
              Seu problema de TI, resolvido em uma conversa.
            </h1>
            <p className="max-w-[520px] text-[16px] leading-[25px] text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um
              analista quando precisa.
            </p>
          </div>

          <div className="pl-24">
            <div className="flex w-[500px] max-w-full flex-col gap-2.5 rounded-2xl bg-white/[0.04] p-[18px] outline outline-white/[0.08]">
              <div className="flex justify-end">
                <div className="rounded-[12px_12px_4px_12px] bg-white px-3.5 py-[9px] text-[13.5px] text-ink">
                  Meu notebook não conecta na VPN. Erro 809.
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[12.5px]">
                  <span className="font-semibold text-white/80">Nexo Assist</span>
                  <span className="text-white/45">consultou seus chamados · criou um chamado</span>
                </div>
                <div className="w-[380px] max-w-full rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px] leading-5 text-white">
                  Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
                </div>
                <div className="flex w-fit items-center gap-2 rounded-xl bg-white px-3 py-[7px] text-[12.5px]">
                  <span className="size-[7px] rounded-full bg-warn" />
                  <span className="font-semibold text-ink">INC-20517</span>
                  <span className="text-muted">Rede e VPN · Alta · em até 4 h</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-t border-white/10 pt-6">
          {STATS.map((s, i) => (
            <div key={s.label} className={`flex flex-1 flex-col gap-1.5 ${i > 0 ? "border-l border-white/10 pl-6" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="font-serif text-[34px] leading-none tracking-[-0.6px] text-white">{s.value}</span>
                {s.live && <span className="size-2 rounded-full bg-ok" />}
              </div>
              <span className="text-[13.5px] text-white/55">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Acesso */}
      <section className="flex flex-1 flex-col justify-between px-6 py-10 sm:px-14">
        <div className="flex items-center justify-end gap-1.5 text-[13.5px]">
          <span className="text-muted">Problema para entrar?</span>
          <span className="font-semibold text-link">Ligue no ramal 4000</span>
        </div>
        <div className="flex justify-center">
          <LoginForm />
        </div>
        <div className="flex justify-between text-[12.5px] text-muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </div>
      </section>
    </main>
  );
}

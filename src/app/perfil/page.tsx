import { redirect } from "next/navigation";
import { EmployeeShell } from "@/components/employee-shell";
import { IconInfo, IconKey, IconShield } from "@/components/icons";
import { formatAgo } from "@/domain/business-time";
import { currentUser } from "@/server/auth";
import { initials } from "@/server/console-service";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/console");
  const changed = formatAgo(new Date(user.passwordChangedAt), new Date()).replace("há", "Alterada há");

  return (
    <EmployeeShell user={{ name: user.name, email: user.email, initials: initials(user.name) }} active="perfil" title="Meu perfil">
      <div className="flex flex-1 justify-center overflow-y-auto px-6 py-12 sm:px-10">
        <div className="flex w-[600px] max-w-full flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[24px] font-bold tracking-[-0.4px] text-ink">Meu perfil</h1>
            <p className="text-[14.5px] text-muted">Seus dados de acesso ao service desk de TI.</p>
          </div>

          <section className="ring-card flex flex-col rounded-2xl bg-white shadow-[var(--shadow-card)]">
            {[
              ["Nome", user.name],
              ["Área", user.department],
              ["Equipamento", user.device ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-4 border-b border-line px-6 py-5">
                <span className="w-40 text-[13.5px] text-muted">{k}</span>
                <span className="flex-1 text-[14.5px] font-medium text-ink">{v}</span>
              </div>
            ))}
            <div className="flex items-center gap-4 px-6 py-5">
              <span className="w-40 text-[13.5px] text-muted">E-mail corporativo</span>
              <span className="flex-1 text-[14.5px] font-medium text-ink">{user.email}</span>
              <span className="flex items-center gap-[5px] text-[12.5px] text-muted">
                <IconShield size={14} />
                Gerenciado pela TI
              </span>
            </div>
          </section>

          <section className="ring-card flex flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-4 p-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-subtle text-body">
                <IconKey size={18} />
              </span>
              <div className="flex flex-1 flex-col gap-[3px]">
                <span className="text-[14.5px] font-semibold text-ink">Senha</span>
                <span className="text-[13.5px] text-muted">{changed}</span>
              </div>
              <a
                href="https://senha.nexo.com.br"
                className="ring-soft flex h-9 items-center gap-[7px] rounded-lg px-3.5 text-[13.5px] font-medium text-body hover:bg-subtle"
              >
                Redefinir senha
              </a>
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-subtle px-6 py-3 text-[13px] text-muted">
              <IconInfo size={15} />
              Enviaremos um link de redefinição para {user.email}.
            </div>
          </section>
        </div>
      </div>
    </EmployeeShell>
  );
}

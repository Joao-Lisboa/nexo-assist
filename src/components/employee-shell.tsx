"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChat, IconChevronRight, IconLogout, IconUser, NexoMark } from "./icons";
import { Avatar } from "./ui";

export interface ShellUser {
  name: string;
  email: string;
  initials: string;
}

export function EmployeeShell({
  user,
  active,
  title,
  status,
  children,
}: {
  user: ShellUser;
  active: "atendimento" | "perfil";
  title: string;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  const nav = [
    { key: "atendimento", href: "/chat", label: "Atendimento", icon: IconChat },
    { key: "perfil", href: "/perfil", label: "Meu perfil", icon: IconUser },
  ] as const;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line px-3.5 pt-5 pb-3.5 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <NexoMark size={20} />
          <span className="text-[16px] font-bold tracking-[-0.2px] text-ink">Nexo Assist</span>
        </div>
        <nav className="mt-[22px] flex flex-col gap-0.5">
          {nav.map((n) => {
            const on = n.key === active;
            const Icon = n.icon;
            return (
              <Link
                key={n.key}
                href={n.href}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] ${on ? "bg-sky-soft font-semibold text-link" : "font-medium text-body hover:bg-subtle"}`}
              >
                <Icon size={16} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 border-t border-line px-2 pt-3.5 pb-1">
          <Avatar initials={user.initials} bg="#0285F712" fg="#0069C7" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-semibold text-ink">{user.name}</span>
            <span className="truncate text-[11.5px] text-muted">{user.email}</span>
          </div>
        </div>
        <button onClick={logout} className="mt-1 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-body hover:bg-subtle">
          <IconLogout size={16} />
          Sair
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-5 sm:px-8">
          <div className="flex flex-1 items-center gap-2 text-[13.5px]">
            <span className="text-muted">Service desk de TI</span>
            <IconChevronRight size={14} className="text-muted" />
            <span className="font-semibold text-ink">{title}</span>
          </div>
          {status}
        </header>
        {children}
      </div>
    </div>
  );
}

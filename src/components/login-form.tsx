"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconArrowRight, IconCheck, IconEye, IconEyeOff, IconLock, IconMail } from "./icons";

const DEMO = [
  { email: "ana.souza@nexo.com.br", label: "Ana Souza · funcionária" },
  { email: "rafael.lima@nexo.com.br", label: "Rafael Lima · analista N2" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember }),
      });
      const data = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok || !data.redirect) throw new Error(data.error ?? "Não foi possível entrar.");
      router.replace(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-[380px] max-w-full flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[40px] leading-[44px] tracking-[-0.8px] text-ink">Entrar</h2>
        <p className="text-[15.5px] leading-[23px] text-muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <label className="flex flex-col gap-2">
          <span className="text-[13.5px] font-medium text-ink">E-mail corporativo</span>
          <span className="ring-soft flex h-11 items-center gap-2.5 rounded-lg bg-white pr-2 pl-3.5 shadow-[0_1px_2px_#1B24310A] focus-within:outline-[1.5px] focus-within:outline-primary">
            <IconMail className="text-muted" />
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.sobrenome@nexo.com.br"
              className="flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-muted/70"
            />
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-ink">Senha</span>
            <span className="text-[13.5px] font-medium text-link">Esqueci minha senha</span>
          </span>
          <span className="ring-soft flex h-11 items-center gap-2.5 rounded-lg bg-white pr-2 pl-3.5 focus-within:outline-[1.5px] focus-within:outline-primary">
            <IconLock className="text-muted" />
            <input
              type={show ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 bg-transparent text-[14.5px] text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="flex size-[30px] items-center justify-center rounded-md text-muted hover:bg-subtle"
              aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            >
              {show ? <IconEyeOff /> : <IconEye />}
            </button>
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-[9px] pt-0.5">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
          <span className="flex size-[18px] items-center justify-center rounded-md bg-primary text-white peer-[:not(:checked)]:bg-white peer-[:not(:checked)]:text-transparent peer-[:not(:checked)]:outline peer-[:not(:checked)]:outline-[#1B243133]">
            <IconCheck size={12} strokeWidth={2.5} />
          </span>
          <span className="text-[13.5px] text-body">Manter conectado neste computador</span>
        </label>
      </div>

      {error && (
        <p role="alert" className="-mt-2 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger-ink">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-[15.5px] font-semibold text-white shadow-[var(--shadow-button)] transition hover:brightness-110 disabled:opacity-70"
      >
        {loading ? "Entrando…" : "Entrar"}
        {!loading && <IconArrowRight />}
      </button>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <span className="text-[12.5px] text-muted">Ambiente de demonstração · qualquer senha funciona</span>
        <div className="flex flex-wrap gap-1.5">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => {
                setEmail(d.email);
                setPassword("demo");
              }}
              className="ring-line rounded-lg px-2.5 py-1.5 text-[12.5px] text-body hover:bg-subtle"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

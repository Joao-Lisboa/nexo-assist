import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getContainer } from "./container";
import { users } from "./db/schema";
import { HttpError } from "./errors";

export { HttpError };

/**
 * Sessão simples em cookie assinado (HMAC). O desafio aceita qualquer senha
 * para os funcionários dos dados de exemplo; o que importa aqui é que a
 * identidade usada pelo agent venha do servidor, nunca do modelo ou do cliente.
 */

import type { User } from "./types";

export type { User };

const COOKIE = "nexo_session";
const MAX_AGE_DAYS = 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET é obrigatório em produção");
  return "dev-only-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function encodeSession(userId: string, issuedAt = Date.now()): string {
  const payload = `${userId}.${issuedAt}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, issuedAt, sig] = parts as [string, string, string];
  const expected = Buffer.from(sign(`${userId}.${issuedAt}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Date.now() - Number(issuedAt) > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) return null;
  return userId;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const { db } = await getContainer();
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  return user ?? null;
}

export async function startSession(userId: string, remember: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(remember ? { maxAge: MAX_AGE_DAYS * 24 * 60 * 60 } : {}),
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const userId = decodeSession((await cookies()).get(COOKIE)?.value);
  if (!userId) return null;
  const { db } = await getContainer();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user ?? null;
}


export async function requireUser(role: User["role"]): Promise<User> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sessão expirada. Entre de novo.");
  if (user.role !== role) throw new HttpError(403, "Acesso não permitido para este perfil.");
  return user;
}

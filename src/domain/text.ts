/** Normalização simples de texto em português para busca e comparação. */

const STOPWORDS = new Set(
  (
    "a o e de do da dos das um uma uns umas em no na nos nas para pra por com sem que se nao não " +
    "meu minha meus minhas seu sua eu voce você ele ela isso esse essa este esta ja já mais muito " +
    "como quando onde qual quais ao aos as os é esta está estou tem ter tenho foi ser sobre desde " +
    "ainda hoje ontem agora preciso precisa favor ola olá oi bom dia tarde noite obrigado obrigada " +
    "chamado problema ajuda consigo consegue conseguir aparece aparecendo"
  ).split(/\s+/),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  // Stemming leve: plurais e algumas terminações comuns.
  if (token.length > 4 && token.endsWith("oes")) return token.slice(0, -3) + "ao";
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

export function tokens(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

/** Sobreposição relativa ao menor conjunto (0..1). */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / Math.min(a.size, b.size);
}

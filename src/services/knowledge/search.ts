import { tokenSet } from "@/domain/text";
import { ARTICLES, type Article } from "./articles";

export interface ArticleHit {
  article: Article;
  score: number;
}

/**
 * Busca por palavras-chave. Com uma central de ajuda pequena, isso é rápido,
 * barato e previsível; embeddings ficariam para uma base maior.
 */
export function searchArticles(query: string, limit = 3): ArticleHit[] {
  const q = tokenSet(query);
  if (q.size === 0) return [];

  const hits: ArticleHit[] = [];
  for (const article of ARTICLES) {
    const title = tokenSet(article.title);
    const body = tokenSet(article.body);
    const keywords = tokenSet(article.keywords.join(" "));
    let score = 0;
    for (const t of q) {
      if (title.has(t)) score += 3;
      if (keywords.has(t)) score += 2;
      if (body.has(t)) score += 1;
    }
    if (score > 0) hits.push({ article, score: score / q.size });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function getArticle(id: string): Article | undefined {
  return ARTICLES.find((a) => a.id === id);
}

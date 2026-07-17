import type { KnowledgeSearchResult, SearchableKnowledgeChunk } from "./types.js";

const STOP_WORDS = new Set([
  "a", "aby", "albo", "bo", "by", "czy", "dla", "do", "i", "jak", "jaka", "jakie", "jest", "na", "o",
  "od", "oraz", "po", "sie", "to", "w", "z", "za", "ze", "co", "gdzie", "kiedy", "ktory", "mozna",
]);

const TOPIC_HINTS: Record<string, string[]> = {
  warranty: ["gwarancja", "gwarancji", "rejestracja", "przedluzyc", "reklamacja"],
  guide: ["montaz", "zamontowac", "instalacja", "filtr", "wentylacja", "wydajnosc", "glosnosc", "poradnik", "instrukcja"],
  stores: ["salon", "salony", "sklep", "kupic", "sprzedaz", "dystrybutor"],
  company: ["firma", "producent", "nortberg", "produkcja", "polska"],
};

export function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase("pl-PL").replaceAll("ł", "l").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return [...new Set(normalizeForSearch(value).split(/\s+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)))];
}

export function isKnowledgeQuestion(message: string): boolean {
  const normalized = normalizeForSearch(message);
  return Object.values(TOPIC_HINTS).flat().some((hint) => normalized.includes(normalizeForSearch(hint)));
}

export function searchKnowledge(chunks: SearchableKnowledgeChunk[], query: string, limit = 5): KnowledgeSearchResult[] {
  const queryText = normalizeForSearch(query);
  const queryTokens = tokens(query);
  if (!queryTokens.length) return [];

  return chunks.map((chunk) => {
    const title = normalizeForSearch(chunk.title);
    const heading = normalizeForSearch(chunk.heading ?? "");
    const content = normalizeForSearch(chunk.content);
    const topic = normalizeForSearch(chunk.topic);
    let score = content.includes(queryText) ? 15 : 0;
    let matched = 0;
    for (const token of queryTokens) {
      let tokenScore = 0;
      if (title.includes(token)) tokenScore += 6;
      if (heading.includes(token)) tokenScore += 8;
      if (content.includes(token)) tokenScore += 2;
      if (TOPIC_HINTS[chunk.topic]?.some((hint) => normalizeForSearch(hint).includes(token) || token.includes(normalizeForSearch(hint)))) tokenScore += 5;
      if (topic.includes(token)) tokenScore += 4;
      if (tokenScore) matched += 1;
      score += tokenScore;
    }
    const coverage = matched / queryTokens.length;
    score += coverage * 10;
    return { ...chunk, score: Math.round(score * 100) / 100, excerpt: createExcerpt(chunk.content, queryTokens) };
  }).filter((result) => result.score >= 8 && result.content.length > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pl"))
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

function createExcerpt(content: string, queryTokens: string[], maxLength = 460): string {
  const normalized = normalizeForSearch(content);
  const firstMatch = queryTokens.map((token) => normalized.indexOf(token)).filter((position) => position >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstMatch - 100);
  const raw = content.replace(/#{1,6}\s*/g, "").replace(/\s+/g, " ").trim();
  const safeStart = Math.min(start, Math.max(0, raw.length - maxLength));
  const excerpt = raw.slice(safeStart, safeStart + maxLength).trim();
  return `${safeStart > 0 ? "…" : ""}${excerpt}${safeStart + maxLength < raw.length ? "…" : ""}`;
}

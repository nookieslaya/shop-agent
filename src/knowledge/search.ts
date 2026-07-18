import type { KnowledgeSearchResult, SearchableKnowledgeChunk } from "./types.js";

export interface KnowledgeRetrievalConfig {
  locale?: string;
  stopWords?: string[];
  topicAliases?: Record<string, string[]>;
  topicSuggestions?: Record<string, Array<{ label: string; message: string }>>;
  insufficientEvidenceRules?: Array<{ queryTerms: string[]; evidenceTerms: string[]; message: string }>;
}

export function topicFollowUpSuggestions(results: KnowledgeSearchResult[], config: KnowledgeRetrievalConfig = {}) {
  const seen = new Set<string>();
  return [...new Set(results.map((result) => result.topic))].flatMap((topic) => config.topicSuggestions?.[topic] ?? [])
    .filter((suggestion) => { const key = normalizeForSearch(`${suggestion.label} ${suggestion.message}`, config.locale); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 2);
}

export function normalizeForSearch(value: string, locale = "en"): string {
  return value.toLocaleLowerCase(locale).replaceAll("ł", "l").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string, config: KnowledgeRetrievalConfig): string[] {
  const stopWords = new Set((config.stopWords ?? []).map((word) => normalizeForSearch(word, config.locale)));
  return [...new Set(normalizeForSearch(value, config.locale).split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token)))];
}

export function isKnowledgeQuestion(message: string, config: KnowledgeRetrievalConfig = {}): boolean {
  return detectKnowledgeTopics(message, config).length > 0;
}

export function detectKnowledgeTopics(message: string, config: KnowledgeRetrievalConfig = {}): string[] {
  const normalized = normalizeForSearch(message, config.locale);
  return Object.entries(config.topicAliases ?? {}).filter(([, hints]) => hints.some((hint) => normalized.includes(normalizeForSearch(hint, config.locale))))
    .map(([topic]) => topic);
}

export function searchKnowledge(chunks: SearchableKnowledgeChunk[], query: string, limit = 5, config: KnowledgeRetrievalConfig = {}): KnowledgeSearchResult[] {
  const queryText = normalizeForSearch(query, config.locale);
  const queryTokens = tokens(query, config);
  if (!queryTokens.length) return [];

  const detectedTopics = detectKnowledgeTopics(query, config);
  const candidates = detectedTopics.length ? chunks.filter((chunk) => detectedTopics.includes(chunk.topic)) : chunks;

  return candidates.map((chunk) => {
    const title = normalizeForSearch(chunk.title, config.locale);
    const heading = normalizeForSearch(chunk.heading ?? "", config.locale);
    const content = normalizeForSearch(chunk.content, config.locale);
    const topic = normalizeForSearch(chunk.topic, config.locale);
    let score = content.includes(queryText) ? 15 : 0;
    let matched = 0;
    for (const token of queryTokens) {
      let tokenScore = 0;
      if (title.includes(token)) tokenScore += 6;
      if (heading.includes(token)) tokenScore += 8;
      if (content.includes(token)) tokenScore += 2;
      if (config.topicAliases?.[chunk.topic]?.some((hint) => normalizeForSearch(hint, config.locale).includes(token) || token.includes(normalizeForSearch(hint, config.locale)))) tokenScore += 5;
      if (topic.includes(token)) tokenScore += 4;
      if (tokenScore) matched += 1;
      score += tokenScore;
    }
    const coverage = matched / queryTokens.length;
    score += coverage * 10;
    return { ...chunk, score: Math.round(score * 100) / 100, excerpt: createExcerpt(chunk.content, queryTokens, config) };
  }).filter((result) => result.score >= 8 && result.content.length > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "pl"))
    .slice(0, Math.max(1, Math.min(limit, 10)));
}

export function buildKnowledgeAnswer(query: string, results: KnowledgeSearchResult[], config: KnowledgeRetrievalConfig = {}): string {
  if (!results.length) return "Nie znalazłem wiarygodnej odpowiedzi w dokumentach tego sklepu.";
  return findInsufficientEvidenceMessage(query, results, config) ?? results[0]!.excerpt;
}

export function findInsufficientEvidenceMessage(query: string, results: KnowledgeSearchResult[], config: KnowledgeRetrievalConfig = {}): string | undefined {
  const normalizedQuery = normalizeForSearch(query, config.locale);
  const evidence = normalizeForSearch(results.map((result) => result.content).join(" "), config.locale);
  for (const rule of config.insufficientEvidenceRules ?? []) {
    const matchesQuery = rule.queryTerms.every((term) => normalizedQuery.includes(normalizeForSearch(term, config.locale)));
    const hasEvidence = rule.evidenceTerms.some((term) => evidence.includes(normalizeForSearch(term, config.locale)));
    if (matchesQuery && !hasEvidence) return rule.message;
  }
  return undefined;
}

function createExcerpt(content: string, queryTokens: string[], config: KnowledgeRetrievalConfig, maxLength = 460): string {
  const normalized = normalizeForSearch(content, config.locale);
  const firstMatch = queryTokens.map((token) => normalized.indexOf(token)).filter((position) => position >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstMatch - 100);
  const raw = content.replace(/#{1,6}\s*/g, "").replace(/\s+/g, " ").trim();
  const safeStart = Math.min(start, Math.max(0, raw.length - maxLength));
  const excerpt = raw.slice(safeStart, safeStart + maxLength).trim();
  return `${safeStart > 0 ? "…" : ""}${excerpt}${safeStart + maxLength < raw.length ? "…" : ""}`;
}

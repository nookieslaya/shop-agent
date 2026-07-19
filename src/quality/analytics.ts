import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { conversationMessages, conversations, qualityScenarioRuns, qualityScenarios } from "../db/schema.js";

export type AnalyticsConversation = {
  id: string;
  messageCount: number;
  flags: string[];
  lastMessageAt: Date;
};

export type AnalyticsAssistantMessage = {
  conversationId: string;
  content: string;
  details: Record<string, any>;
  createdAt: Date;
};

export type AnalyticsScenario = { id: string; enabled: boolean };
export type AnalyticsScenarioRun = { scenarioId: string; passed: boolean; failures: string[]; createdAt: Date };

const flagWeights: Record<string, number> = {
  unknown: 28,
  fallback: 18,
  no_results: 14,
  insufficient_evidence: 8,
  contact_support: 4,
};

const reasonLabels: Record<string, string> = {
  unknown: "Nierozpoznana intencja",
  fallback: "Użyto odpowiedzi awaryjnej",
  no_results: "Brak wyników produktowych",
  insufficient_evidence: "Niewystarczające dowody",
  contact_support: "Prośba o kontakt lub wsparcie",
};

const ratio = (value: number, total: number) => total ? Math.round(value / total * 1000) / 10 : 0;
const change = (current: number, previous: number) => previous ? Math.round((current - previous) / previous * 1000) / 10 : current ? 100 : 0;

function periodSummary(items: AnalyticsConversation[]) {
  const flagged = (flag: string) => items.filter(item => item.flags.includes(flag)).length;
  const penalty = items.reduce((sum, item) => sum + Math.min(60, item.flags.reduce((score, flag) => score + (flagWeights[flag] ?? 0), 0)), 0);
  return {
    conversations: items.length,
    messages: items.reduce((sum, item) => sum + item.messageCount, 0),
    qualityScore: items.length ? Math.max(0, Math.round(100 - penalty / items.length)) : 100,
    noResultsRate: ratio(flagged("no_results"), items.length),
    fallbackRate: ratio(flagged("fallback"), items.length),
    unknownRate: ratio(flagged("unknown"), items.length),
  };
}

function repeatedResponse(messages: AnalyticsAssistantMessage[]) {
  const counts = new Map<string, number>();
  for (const message of messages) {
    const normalized = message.content.trim().toLocaleLowerCase();
    if (normalized.length >= 20) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.values()].some(count => count > 1);
}

export function buildQualityAnalytics(input: {
  current: AnalyticsConversation[];
  previous: AnalyticsConversation[];
  messages: AnalyticsAssistantMessage[];
  scenarios: AnalyticsScenario[];
  runs: AnalyticsScenarioRun[];
}) {
  const current = periodSummary(input.current);
  const previous = periodSummary(input.previous);
  const messagesByConversation = new Map<string, AnalyticsAssistantMessage[]>();
  for (const message of input.messages) {
    const list = messagesByConversation.get(message.conversationId) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }

  const attention = input.current.map(conversation => {
    const messages = messagesByConversation.get(conversation.id) ?? [];
    const reasons = conversation.flags.filter(flag => reasonLabels[flag]).map(flag => reasonLabels[flag]!);
    if (repeatedResponse(messages)) reasons.push("Powtórzona odpowiedź asystenta");
    const score = Math.min(100, conversation.flags.reduce((sum, flag) => sum + (flagWeights[flag] ?? 0), 0) + (repeatedResponse(messages) ? 25 : 0));
    return { id: conversation.id, lastMessageAt: conversation.lastMessageAt, messageCount: conversation.messageCount, flags: conversation.flags, reasons, severity: score >= 35 ? "critical" : score >= 14 ? "warning" : "info", score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score || b.lastMessageAt.getTime() - a.lastMessageAt.getTime()).slice(0, 20);

  const intents: Record<string, number> = {};
  const actions = { productResults: 0, comparisons: 0, similarProducts: 0, knowledgeAnswers: 0, openAiAnswers: 0 };
  for (const message of input.messages) {
    const meta = message.details?.meta ?? {};
    const intent = String(meta.conversationIntent ?? "unknown");
    intents[intent] = (intents[intent] ?? 0) + 1;
    if (Array.isArray(message.details?.products) && message.details.products.length) actions.productResults++;
    if (meta.action === "compare" || message.details?.comparison) actions.comparisons++;
    if (meta.action === "similar" || meta.action === "cheaper") actions.similarProducts++;
    if (intent === "knowledge") actions.knowledgeAnswers++;
    if (meta.intentSource === "openai" || meta.answerSource === "openai") actions.openAiAnswers++;
  }

  const latest = new Map<string, AnalyticsScenarioRun>();
  const prior = new Map<string, AnalyticsScenarioRun>();
  for (const run of [...input.runs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (!latest.has(run.scenarioId)) latest.set(run.scenarioId, run);
    else if (!prior.has(run.scenarioId)) prior.set(run.scenarioId, run);
  }
  const enabled = input.scenarios.filter(scenario => scenario.enabled);
  const passed = enabled.filter(scenario => latest.get(scenario.id)?.passed).length;
  const regressions = enabled.filter(scenario => prior.get(scenario.id)?.passed && latest.get(scenario.id)?.passed === false).map(scenario => scenario.id);

  return {
    summary: { ...current, attention: attention.length },
    trend: {
      conversationsPercent: change(current.conversations, previous.conversations),
      qualityScorePoints: current.qualityScore - previous.qualityScore,
      noResultsRatePoints: Math.round((current.noResultsRate - previous.noResultsRate) * 10) / 10,
      fallbackRatePoints: Math.round((current.fallbackRate - previous.fallbackRate) * 10) / 10,
    },
    intents,
    actions,
    attention,
    scenarios: { total: enabled.length, passed, failed: enabled.filter(scenario => latest.get(scenario.id)?.passed === false).length, neverRun: enabled.filter(scenario => !latest.has(scenario.id)).length, regressions },
  };
}

export class QualityAnalyticsRepository {
  constructor(private readonly db: Database) {}

  async dashboard(storeId: string, days = 7, now = new Date()) {
    const currentStart = new Date(now.getTime() - days * 86_400_000);
    const previousStart = new Date(currentStart.getTime() - days * 86_400_000);
    const allConversations = await this.db.select().from(conversations).where(and(eq(conversations.storeId, storeId), gte(conversations.lastMessageAt, previousStart))).orderBy(desc(conversations.lastMessageAt));
    const current = allConversations.filter(item => item.lastMessageAt >= currentStart);
    const previous = allConversations.filter(item => item.lastMessageAt < currentStart);
    const ids = current.map(item => item.id);
    const messages = ids.length ? await this.db.select({ conversationId: conversationMessages.conversationId, content: conversationMessages.content, details: conversationMessages.details, createdAt: conversationMessages.createdAt }).from(conversationMessages).where(and(eq(conversationMessages.role, "assistant"), inArray(conversationMessages.conversationId, ids))) : [];
    const scenarios = await this.db.select({ id: qualityScenarios.id, enabled: qualityScenarios.enabled }).from(qualityScenarios).where(eq(qualityScenarios.storeId, storeId));
    const scenarioIds = scenarios.map(item => item.id);
    const runs = scenarioIds.length ? await this.db.select({ scenarioId: qualityScenarioRuns.scenarioId, passed: qualityScenarioRuns.passed, failures: qualityScenarioRuns.failures, createdAt: qualityScenarioRuns.createdAt }).from(qualityScenarioRuns).where(inArray(qualityScenarioRuns.scenarioId, scenarioIds)).orderBy(desc(qualityScenarioRuns.createdAt)) : [];
    return { period: { days, currentStart, previousStart, generatedAt: now }, ...buildQualityAnalytics({ current, previous, messages, scenarios, runs }) };
  }
}

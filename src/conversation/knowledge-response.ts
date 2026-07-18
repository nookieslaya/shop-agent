import type { KnowledgeSearchResult } from "../knowledge/types.js";
import { buildKnowledgeAnswer, findInsufficientEvidenceMessage, topicFollowUpSuggestions, type KnowledgeRetrievalConfig } from "../knowledge/search.js";
import type { GroundedAnswerGenerator, GroundedAnswerResult } from "../openai/grounded-answer-generator.js";
import type { ConversationResponse, ConversationState } from "./types.js";

export async function buildKnowledgeConversationResponse(input: {
  question: string;
  storeName: string;
  state?: ConversationState;
  results: KnowledgeSearchResult[];
  retrievalConfig?: KnowledgeRetrievalConfig;
  tone?: "concise" | "friendly" | "expert";
  generator?: GroundedAnswerGenerator;
}): Promise<ConversationResponse> {
  const state: ConversationState = { criteria: {}, intent: "knowledge" };
  const baseSources = input.results.map((result, index) => ({
    id: `S${index + 1}`, topic: result.topic, title: result.title, url: result.sourceUrl,
    ...(result.heading ? { heading: result.heading } : {}), excerpt: result.excerpt,
  }));
  if (!input.results.length) return response(buildKnowledgeAnswer(input.question, [], input.retrievalConfig), state, [], [], "deterministic", undefined, true);

  const ruleMessage = findInsufficientEvidenceMessage(input.question, input.results, input.retrievalConfig);
  if (ruleMessage) return response(ruleMessage, state, [], baseSources, "deterministic", undefined, true);
  const deterministicSuggestions = topicFollowUpSuggestions(input.results, input.retrievalConfig, input.question).map((suggestion) => ({ label: suggestion.label, key: "message" as const, value: suggestion.message }));
  if (!input.generator) return response(buildKnowledgeAnswer(input.question, input.results, input.retrievalConfig), state, deterministicSuggestions, baseSources, "deterministic");

  try {
    const generated = await input.generator.generate({
      question: input.question, storeName: input.storeName,
      locale: input.retrievalConfig?.locale ?? "pl-PL", evidence: input.results,
      ...(input.tone ? { tone: input.tone } : {}),
    });
    if (generated.status === "insufficient" || !generated.answer) {
      return response("Nie znalazłem w dokumentach sklepu informacji wystarczających do udzielenia pewnej odpowiedzi.", state, [], baseSources, "openai", generated, true);
    }
    const cited = baseSources.filter((source) => generated.sourceIds.includes(source.id));
    return response(generated.answer, state, deterministicSuggestions, cited, "openai", generated);
  } catch {
    return response(buildKnowledgeAnswer(input.question, input.results, input.retrievalConfig), state, deterministicSuggestions, baseSources, "fallback");
  }
}

function response(message: string, state: ConversationState, suggestions: ConversationResponse["suggestions"], sources: NonNullable<ConversationResponse["sources"]>, answerSource: "deterministic" | "openai" | "fallback", generated?: GroundedAnswerResult, insufficientEvidence = false): ConversationResponse {
  return {
    message, state, suggestions, products: [], sources,
    meta: {
      intentSource: "deterministic", answerSource,
      conversationIntent: "knowledge",
      ...(insufficientEvidence ? { insufficientEvidence: true } : {}),
      ...(generated ? { answerModel: generated.model, answerInputTokens: generated.inputTokens, answerOutputTokens: generated.outputTokens } : {}),
    },
  };
}

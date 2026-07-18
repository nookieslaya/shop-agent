import type { KnowledgeSearchResult } from "../knowledge/types.js";
import { buildKnowledgeAnswer, findInsufficientEvidenceMessage, topicFollowUpSuggestions, type KnowledgeRetrievalConfig } from "../knowledge/search.js";
import type { GroundedAnswerGenerator, GroundedAnswerResult } from "../openai/grounded-answer-generator.js";
import type { ConversationResponse, ConversationState, ProductConversationContext } from "./types.js";

export async function buildKnowledgeConversationResponse(input: {
  question: string;
  storeName: string;
  state?: ConversationState;
  results: KnowledgeSearchResult[];
  retrievalConfig?: KnowledgeRetrievalConfig;
  tone?: "concise" | "friendly" | "expert";
  generator?: GroundedAnswerGenerator;
  routingReason?: string;
  contextReused?: boolean;
  knowledgeTopics?: string[];
  productContext?: ProductConversationContext;
}): Promise<ConversationResponse> {
  const state: ConversationState = { criteria: {}, intent: "knowledge", knowledgeTopics:[...new Set([...input.results.map(result=>result.topic),...(input.knowledgeTopics??[])])],...(input.productContext?{productContext:input.productContext}:{}) };
  const baseSources = input.results.map((result, index) => ({
    id: `S${index + 1}`, topic: result.topic, title: result.title, url: result.sourceUrl,
    ...(result.heading ? { heading: result.heading } : {}), excerpt: result.excerpt,
  }));
  if (!input.results.length) return response(buildKnowledgeAnswer(input.question, [], input.retrievalConfig), state, [], [], "deterministic", undefined, true,input.routingReason,input.contextReused);

  const ruleMessage = findInsufficientEvidenceMessage(input.question, input.results, input.retrievalConfig);
  if (ruleMessage) return response(ruleMessage, state, [], baseSources, "deterministic", undefined, true,input.routingReason,input.contextReused);
  const deterministicSuggestions = topicFollowUpSuggestions(input.results, input.retrievalConfig, input.question).map((suggestion) => ({ label: suggestion.label, key: "message" as const, value: suggestion.message }));
  if (!input.generator) return response(buildKnowledgeAnswer(input.question, input.results, input.retrievalConfig), state, deterministicSuggestions, baseSources, "deterministic",undefined,false,input.routingReason,input.contextReused);

  try {
    const generated = await input.generator.generate({
      question: input.question, storeName: input.storeName,
      locale: input.retrievalConfig?.locale ?? "pl-PL", evidence: input.results,
      ...(input.tone ? { tone: input.tone } : {}),
    });
    if (generated.status === "insufficient" || !generated.answer) {
      return response("Nie znalazłem w dokumentach sklepu informacji wystarczających do udzielenia pewnej odpowiedzi.", state, [], baseSources, "openai", generated, true,input.routingReason,input.contextReused);
    }
    const cited = baseSources.filter((source) => generated.sourceIds.includes(source.id));
    return response(generated.answer, state, deterministicSuggestions, cited, "openai", generated,false,input.routingReason,input.contextReused);
  } catch {
    return response(buildKnowledgeAnswer(input.question, input.results, input.retrievalConfig), state, deterministicSuggestions, baseSources, "fallback",undefined,false,input.routingReason,input.contextReused);
  }
}


function response(message: string, state: ConversationState, suggestions: ConversationResponse["suggestions"], sources: NonNullable<ConversationResponse["sources"]>, answerSource: "deterministic" | "openai" | "fallback", generated?: GroundedAnswerResult, insufficientEvidence = false,routingReason?:string,contextReused=false): ConversationResponse {
  return {
    message, state, suggestions, products: [], sources,
    meta: {
      intentSource: "deterministic", answerSource,
      conversationIntent: "knowledge",
      ...(routingReason?{routingReason}:{}),
      ...(contextReused?{contextReused:true}:{}),
      ...(insufficientEvidence ? { insufficientEvidence: true } : {}),
      ...(generated ? { answerModel: generated.model, answerInputTokens: generated.inputTokens, answerOutputTokens: generated.outputTokens } : {}),
    },
  };
}

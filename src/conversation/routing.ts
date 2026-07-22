import type { StoreConfig } from "../config/store.js";
import { detectKnowledgeTopics, normalizeForSearch } from "../knowledge/search.js";
import { extractSearchCriteria } from "./intent.js";
import { normalizeCustomerText, type SearchTaxonomy } from "../search/taxonomy.js";
import type { ConversationIntent, ConversationState } from "./types.js";

type RoutingConfig = Partial<NonNullable<StoreConfig["conversationRouting"]>>;
export type RoutingReason = "product_action" | "comparison_follow_up" | "structured_selection" | "explicit_product_criteria" | "contact_request" | "knowledge_topic" | "product_vocabulary" | "contextual_follow_up" | "empty_message" | "unrecognized";
export interface ConversationRoute {
  intent: ConversationIntent;
  reason: RoutingReason;
  detectedTopics: string[];
  contextReused: boolean;
  contextReset: boolean;
}

const containsConfiguredTerm = (normalized: string, terms: string[], locale?: string) => terms.some((term) => {
  const candidate = normalizeForSearch(term, locale);
  return candidate.length > 0 && normalized.includes(candidate);
});

export function decideConversationRoute(input: {
  message: string; hasProductAction?: boolean; selectionKey?: string; state?: ConversationState;
  routing?: RoutingConfig; knowledge?: StoreConfig["knowledgeRetrieval"]; taxonomy?: SearchTaxonomy;
}): ConversationRoute {
  if (input.hasProductAction || ["compare", "similar", "similarCheaper"].includes(input.selectionKey ?? "")) return route("product_action", "product_action");
  if (input.selectionKey && input.selectionKey !== "message") return route("product_search", "structured_selection", [], true);
  const message = input.message.trim();
  if (!message) return route(input.state?.intent ?? "unknown", "empty_message", input.state?.knowledgeTopics ?? [], Boolean(input.state));

  const locale = input.knowledge?.locale;
  const normalized = normalizeCustomerText(message, input.taxonomy);
  if (input.state?.productContext?.comparedProductIds?.length && isComparisonFollowUp(normalized)) {
    return route("product_action", "comparison_follow_up", [], true);
  }
  const extracted = extractSearchCriteria(message, input.taxonomy);
  const detectedTopics = detectKnowledgeTopics(message, input.knowledge);
  const contextReset = containsConfiguredTerm(normalized, input.routing?.restartProductTerms ?? [], locale);
  const hasExplicitProductCriteria = Object.keys(extracted).length > 0;

  if (extracted.catalogView || extracted.category || extracted.sortBy || extracted.limit || extracted.minPriceMinor !== undefined || extracted.maxPriceMinor !== undefined||extracted.targetPriceMinor!==undefined||extracted.relativePrice) return route("product_search", "explicit_product_criteria", detectedTopics, !contextReset && hasProductContext(input.state), contextReset);
  if (containsConfiguredTerm(normalized, input.routing?.contactTerms ?? [], locale)) return route("contact_support", "contact_request", detectedTopics, false, true);
  if (detectedTopics.length) return route("knowledge", "knowledge_topic", detectedTopics, false, input.state?.intent !== "knowledge");
  if (hasExplicitProductCriteria || containsConfiguredTerm(normalized, input.routing?.productTerms ?? [], locale)) return route("product_search", hasExplicitProductCriteria ? "explicit_product_criteria" : "product_vocabulary", [], !contextReset && hasProductContext(input.state), contextReset);

  const continuation = containsConfiguredTerm(normalized, input.routing?.continuationTerms ?? [], locale);
  if (continuation && input.state?.intent === "knowledge" && input.state.knowledgeTopics?.length) return route("knowledge", "contextual_follow_up", input.state.knowledgeTopics, true);
  if (continuation && isProductContext(input.state)) return route("product_search", "contextual_follow_up", [], true);
  return route("unknown", "unrecognized", [], false, true);
}

export function classifyConversationIntent(input: Parameters<typeof decideConversationRoute>[0]): ConversationIntent {
  return decideConversationRoute(input).intent;
}

export function reusableProductState(state: ConversationState | undefined, decision: ConversationRoute): ConversationState | undefined {
  if(decision.contextReset||!state)return undefined;if(isProductContext(state))return state;
  return state.productContext?{criteria:state.productContext.criteria,intent:"product_search",productContext:state.productContext}:undefined;
}

function isProductContext(state?: ConversationState) {
  return state?.intent === "product_search" || state?.intent === "product_action";
}
function hasProductContext(state?:ConversationState){return isProductContext(state)||Boolean(state?.productContext)}

function isComparisonFollowUp(message: string) {
  const reference = /\b(ktory|ktorego|ktorym|nich|porownywanych|pierwszy|drugi|trzeci)\b/.test(message);
  const comparison = /(lepsz|wybral|wybrac|polec|oplacal|tansz|nizsz.{0,8}cen|cichsz|halas|wydajniejsz|wydajnosc|roznic)/.test(message);
  return comparison && (reference || /\b(co bys|jaki wybrac)\b/.test(message));
}

function route(intent: ConversationIntent, reason: RoutingReason, detectedTopics: string[] = [], contextReused = false, contextReset = false): ConversationRoute {
  return { intent, reason, detectedTopics: [...new Set(detectedTopics)], contextReused, contextReset };
}

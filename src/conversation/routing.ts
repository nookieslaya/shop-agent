import type { StoreConfig } from "../config/store.js";
import { detectKnowledgeTopics, normalizeForSearch } from "../knowledge/search.js";
import { extractSearchCriteria } from "./intent.js";
import type { ConversationIntent, ConversationState } from "./types.js";

type RoutingConfig = StoreConfig["conversationRouting"];

export function classifyConversationIntent(input: {
  message: string; hasProductAction?: boolean; selectionKey?: string; state?: ConversationState;
  routing?: RoutingConfig; knowledge?: StoreConfig["knowledgeRetrieval"];
}): ConversationIntent {
  if (input.hasProductAction || ["compare", "similar", "similarCheaper"].includes(input.selectionKey ?? "")) return "product_action";
  if (input.selectionKey && input.selectionKey !== "message") return "product_search";
  const message = input.message.trim();
  if (!message) return input.state?.intent ?? "unknown";
  const normalized = normalizeForSearch(message, input.knowledge?.locale);
  const extracted = extractSearchCriteria(message);
  if (extracted.sortBy || extracted.limit || extracted.minPriceMinor !== undefined || extracted.maxPriceMinor !== undefined) return "product_search";
  if (detectKnowledgeTopics(message, input.knowledge).length) return "knowledge";
  if ((input.routing?.contactTerms ?? []).some((term) => normalized.includes(normalizeForSearch(term, input.knowledge?.locale)))) return "contact_support";
  if (Object.keys(extracted).length || (input.routing?.productTerms ?? []).some((term) => normalized.includes(normalizeForSearch(term, input.knowledge?.locale)))) return "product_search";
  return "unknown";
}

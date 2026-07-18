import type { ProductSearchCriteria } from "../search/types.js";

export type ConversationIntent = "product_search" | "knowledge" | "product_action" | "contact_support" | "unknown";
export interface ProductConversationContext { criteria: ProductSearchCriteria; resultPriceRange?: { minPriceMinor: number; maxPriceMinor: number } }
export interface ConversationState { criteria: ProductSearchCriteria; intent?: ConversationIntent; knowledgeTopics?: string[]; productContext?: ProductConversationContext }
export interface Suggestion { label: string; key: "widthCm" | "maxPriceMinor" | "priority" | "removeFilter" | "message" | "compare" | "similar" | "similarCheaper"; value: string | number }
export interface ConversationProduct {
  externalId: string; title: string; price: number; currency: string; imageUrl: string; productUrl: string;
  reasons: string[];
  similarityScore?: number;
  similarityDiagnostics?: Array<{ fieldId: string; label: string; left: unknown; right: unknown; similarity: number | null; weight: number; contribution: number; penalty: number; status: string }>;
}
export interface ConversationResponse {
  message: string;
  state: ConversationState;
  suggestions: Suggestion[];
  products: ConversationProduct[];
  sources?: Array<{ id: string; topic: string; title: string; url: string; heading?: string; excerpt: string }>;
  comparison?: import("../products/comparison.js").ProductComparisonResult;
  meta?: {
    intentSource: "deterministic" | "openai" | "fallback";
    model?: string; inputTokens?: number; outputTokens?: number;
    answerSource?: "deterministic" | "openai" | "fallback";
    answerModel?: string; answerInputTokens?: number; answerOutputTokens?: number;
    productAction?: "compare" | "similar";
    conversationIntent?: ConversationIntent;
    routingReason?: string;
    contextReused?: boolean;
    contextReset?: boolean;
    insufficientEvidence?: boolean;
  };
}
